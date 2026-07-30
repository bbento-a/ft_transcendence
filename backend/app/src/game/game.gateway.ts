import {
  WebSocketGateway,
  SubscribeMessage,
  ConnectedSocket,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { GameService } from './game.service';
import { GameState } from './game.types';
import { GameRoom, RoomSummary, toRoomSummary } from './game.room';
import { JwtService } from '@nestjs/jwt';
import * as cookie from 'cookie';

// A host who closes the tab should not leave a ghost room in the lobby. A host
// who is just walking from /gamerooms to the game page must not lose the room
// either — that navigation drops one socket and opens another. So a room whose
// host went away is deleted only if they do not come back within this window.
const HOST_RECONNECT_GRACE_MS = 15_000;

const AI_PLAYER_ID = 'AI';

@WebSocketGateway({ cors: true })
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  // Lobby rooms, keyed by room id. Games vs the AI are deliberately absent:
  // they are private, so they live only in GameService.
  private rooms = new Map<string, GameRoom>();

  // Users currently watching a game. They receive board updates but cannot play.
  private spectators = new Set<string>();

  // Pending deletions for rooms whose host disconnected (see the grace constant).
  private hostGraceTimers = new Map<string, NodeJS.Timeout>();

  private roomCounter = 1;

  constructor(
    private readonly gameService: GameService,
    private readonly jwtService: JwtService,
  ) {}

  // --- connection lifecycle -------------------------------------------------

  async handleConnection(client: Socket) {
    const user = await this.authenticateSocket(client);
    if (!user) {
      client.emit('warning', 'Unauthorized');
      client.disconnect();
      return;
    }

    client.data.userId = user.id;
    client.data.username = user.username;
    client.join(user.id); // personal channel, used to reach a user directly
  }

  handleDisconnect(client: Socket) {
    const userId = client.data?.userId;
    if (!userId) return;

    this.spectators.delete(userId);

    // Host of a room nobody joined yet: give them a moment to come back before
    // the room disappears from the lobby.
    const room = this.findRoomByUser(userId);
    if (room && room.status === 'waiting' && room.hostId === userId) {
      this.scheduleRoomCleanup(room.id);
      return;
    }

    // In a live game: pause it and let GameService decide the forfeit.
    const game = this.gameService.GetGameByPlayerId(userId);
    if (!game || game.isGameOver) return;

    game.disconnectedPlayerId = userId;
    const opponentId = game.player1Id === userId ? game.player2Id : game.player1Id;
    this.server.to(opponentId).emit('opponentDisconnected', 'Your opponent left. Waiting for reconnect...');

    this.gameService.StartForfeitTimer(game.roomId, userId, async (finishedGame) => {
      await this.endGame(finishedGame.roomId, finishedGame, 'Opponent did not reconnect in time. Forfeit.');
    });
  }

  private async authenticateSocket(
    client: Socket,
  ): Promise<{ id: string; username: string } | null> {
    const rawCookie = client.handshake.headers.cookie;
    if (!rawCookie) return null;

    const token = cookie.parse(rawCookie)['access_token'];
    if (!token) return null;

    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: process.env.JWT_SECRET,
      });
      return { id: payload.sub, username: payload.username };
    } catch {
      return null;
    }
  }

  // --- lobby ----------------------------------------------------------------

  // Sent to the lobby page on mount; every change after that is broadcast.
  @SubscribeMessage('getRooms')
  sendRooms(@ConnectedSocket() client: Socket) {
    client.emit('roomList', this.roomSummaries());
  }

  // "Play vs someone": open a room and wait inside it.
  @SubscribeMessage('createRoom')
  createRoom(@ConnectedSocket() client: Socket) {
    const { userId, username } = client.data;

    if (this.isBusy(userId)) {
      client.emit('warning', 'You are already in a game or room.');
      return;
    }

    const room: GameRoom = {
      id: `room-${this.roomCounter++}`,
      hostId: userId,
      hostName: username,
      guestId: null,
      guestName: null,
      status: 'waiting',
    };
    this.rooms.set(room.id, room);

    // The page navigates to /<id>, which then sends `enterRoom`.
    client.emit('roomCreated', { roomId: room.id });
    this.broadcastRooms();
  }

  // The one way into a room. The caller does not say what they want to be — the
  // server works it out, so a hand-typed URL cannot make anyone a player:
  //   host or guest coming back -> rejoin (covers page reloads)
  //   room still waiting        -> become the guest and start the game
  //   game already running      -> watch as a spectator
  @SubscribeMessage('enterRoom')
  enterRoom(@ConnectedSocket() client: Socket, @MessageBody() roomId: string) {
    const { userId, username } = client.data;
    const room = this.rooms.get(roomId);

    if (!room) {
      // Not a lobby room, but it may be this user's own game vs the AI.
      const aiGame = this.gameService.GetStateOfGame(roomId);
      if (aiGame && aiGame.player1Id === userId) {
        this.rejoinGame(client, aiGame);
        return;
      }
      client.emit('roomUnavailable', 'This room no longer exists.');
      return;
    }

    if (userId === room.hostId || userId === room.guestId) {
      this.cancelRoomCleanup(room.id);
      client.join(room.id);

      const game = this.gameService.GetStateOfGame(room.id);
      if (game) this.rejoinGame(client, game);
      else client.emit('statusWait', 'Waiting for an opponent to join...');
      return;
    }

    if (room.status === 'waiting') {
      this.startGame(client, room, userId, username);
      return;
    }

    this.watchGame(client, room);
  }

  // Back button. Only the host of an empty room needs handling: leaving mid-game
  // disconnects the socket, which the forfeit logic already covers.
  @SubscribeMessage('leaveRoom')
  leaveRoom(@ConnectedSocket() client: Socket, @MessageBody() roomId: string) {
    const userId = client.data.userId;
    this.spectators.delete(userId);
    client.leave(roomId);

    const room = this.rooms.get(roomId);
    if (room && room.status === 'waiting' && room.hostId === userId) {
      this.closeRoom(room.id);
    }
  }

  private startGame(client: Socket, room: GameRoom, userId: string, username: string) {
    if (this.isBusy(userId)) {
      client.emit('warning', 'You are already in a game or room.');
      return;
    }

    room.guestId = userId;
    room.guestName = username;
    room.status = 'playing';

    const state = this.gameService.InitNewGame(room.id, room.hostId, userId);
    client.join(room.id);

    this.server.to(room.id).emit('MatchFound', {
      room: room.id,
      message: 'Opponent joined! Game starting',
      state,
    });
    this.broadcastRooms();
  }

  private watchGame(client: Socket, room: GameRoom) {
    const game = this.gameService.GetStateOfGame(room.id);
    if (!game) {
      client.emit('roomUnavailable', 'This game is already over.');
      return;
    }

    this.spectators.add(client.data.userId);
    client.join(room.id);
    client.emit('gameStateUpdated', game);
    client.emit('statusWait', `Watching ${room.hostName} vs ${room.guestName}`);
  }

  // A player is back (reload, or arriving from the lobby): resume where they left.
  private rejoinGame(client: Socket, game: GameState) {
    this.gameService.CancelForfeitTimer(game.roomId);
    game.disconnectedPlayerId = null;

    client.join(game.roomId);
    client.emit('gameStateUpdated', game);
    client.to(game.roomId).emit('opponentReconnected', 'Your opponent reconnected.');
  }

  // --- gameplay -------------------------------------------------------------

  @SubscribeMessage('playVsAI')
  startAIGame(@ConnectedSocket() client: Socket) {
    const userId = client.data.userId;

    if (this.isBusy(userId)) {
      client.emit('warning', 'You are already in a game or room.');
      return;
    }

    const roomId = `room-${this.roomCounter++}`;
    const state = this.gameService.InitNewGame(roomId, userId, AI_PLAYER_ID);
    client.join(roomId);

    client.emit('MatchFound', {
      room: roomId,
      message: 'Playing against AI',
      state,
    });
  }

  @SubscribeMessage('playerMove')
  async handleMove(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; column: number },
  ) {
    const userId = client.data.userId;

    if (this.spectators.has(userId)) {
      client.emit('warning', 'Spectators cannot play.');
      return;
    }

    // GameService re-checks this, but rejecting here keeps bad input out of it.
    if (!Number.isInteger(data.column) || data.column < 0 || data.column > 6) {
      client.emit('warning', 'Invalid column');
      return;
    }

    const state = this.gameService.MakeMove(data.roomId, userId, data.column);
    if (!state) {
      client.emit('warning', 'Invalid play, or it is not your turn.');
      return;
    }

    this.server.to(data.roomId).emit('gameStateUpdated', state);

    if (state.isGameOver) {
      await this.endGame(data.roomId, state);
      return;
    }

    // Vs the AI the move above was ours, so the bot answers straight away.
    if (state.player2Id === AI_PLAYER_ID && state.currentPlayer === 2) {
      const afterAI = this.gameService.PlayerAIMove(data.roomId);
      if (!afterAI) return;

      this.server.to(data.roomId).emit('gameStateUpdated', afterAI);
      if (afterAI.isGameOver) await this.endGame(data.roomId, afterAI);
    }
  }

  private async endGame(roomId: string, finalState: GameState, customMessage?: string) {
    const message =
      customMessage ??
      (finalState.winnerId ? 'Game over!' : 'Game ended in a draw!');

    this.server.to(roomId).emit('gameOver', {
      winner: finalState.winnerId,
      board: finalState.board,
      message,
    });

    this.server.in(roomId).socketsLeave(roomId);
    await this.gameService.finalizeGame(finalState);

    // The room played its part; it should not linger in the lobby.
    this.closeRoom(roomId);
  }

  // --- room bookkeeping -----------------------------------------------------

  private roomSummaries(): RoomSummary[] {
    return Array.from(this.rooms.values()).map(toRoomSummary);
  }

  private broadcastRooms() {
    this.server.emit('roomList', this.roomSummaries());
  }

  private findRoomByUser(userId: string): GameRoom | undefined {
    for (const room of this.rooms.values()) {
      if (room.hostId === userId || room.guestId === userId) return room;
    }
    return undefined;
  }

  // One game or one room at a time, so a user cannot hold several lobby boxes.
  private isBusy(userId: string): boolean {
    return (
      !!this.gameService.GetGameByPlayerId(userId) || !!this.findRoomByUser(userId)
    );
  }

  private closeRoom(roomId: string) {
    this.cancelRoomCleanup(roomId);
    if (this.rooms.delete(roomId)) this.broadcastRooms();
  }

  private scheduleRoomCleanup(roomId: string) {
    this.cancelRoomCleanup(roomId);
    this.hostGraceTimers.set(
      roomId,
      setTimeout(() => {
        this.hostGraceTimers.delete(roomId);
        if (this.rooms.delete(roomId)) this.broadcastRooms();
      }, HOST_RECONNECT_GRACE_MS),
    );
  }

  private cancelRoomCleanup(roomId: string) {
    const timer = this.hostGraceTimers.get(roomId);
    if (timer) {
      clearTimeout(timer);
      this.hostGraceTimers.delete(roomId);
    }
  }
}
