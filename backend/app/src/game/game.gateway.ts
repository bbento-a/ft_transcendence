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
import { GameService, FORFEIT_GRACE_PERIOD_MS } from './game.service';
import { DIFFICULTIES, GameState } from './game.types';
import { GameRoom, RoomSummary, toRoomSummary } from './game.room';
import { JwtService } from '@nestjs/jwt';
import * as cookie from 'cookie';

// A host who closes the tab should not leave a ghost room in the lobby. A host
// who is just walking from /gamerooms to the game page must not lose the room
// either — that navigation drops one socket and opens another. So a room whose
// host went away is deleted only if they do not come back within this window.
const HOST_RECONNECT_GRACE_MS = 15_000;

const AI_PLAYER_ID = 'AI';

// Shown on the board's side panel, matching the "Play vs bot" wording.
const AI_PLAYER_NAME = 'Bot';

@WebSocketGateway({ cors: true })
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  // Lobby rooms, keyed by room id. Games vs the AI are deliberately absent:
  // they are private, so they live only in GameService.
  private rooms = new Map<string, GameRoom>();

  // Who is watching what: user id -> room id. They receive board updates but
  // cannot play, and they are sent away when their room stops playing.
  private spectators = new Map<string, string>();

  // Pending deletions for rooms whose host disconnected (see the grace constant).
  private hostGraceTimers = new Map<string, NodeJS.Timeout>();

  private roomCounter = 1;

  //Tempo minimo que a IA "pensa" antes de jogar para a jogada nao ser instantanea
  private static readonly AI_THINK_TIME_MS = 1000 * 1.3;

  constructor(
    private readonly gameService: GameService,
    private readonly jwtService: JwtService,
  ) {}

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

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

    // Still tied to a room (closed the tab, lost the network, crashed)? Point the
    // lobby straight back at it, instead of leaving the player looking at their
    // own game in the list with a "Spectate" button on it.
    const roomId = this.findResumableRoom(user.id);
    if (roomId) client.emit('resumeRoom', { roomId });
  }

  // Where this user belongs right now: a lobby room they are host or guest of,
  // or a private game vs the bot. Null when they are free to browse.
  private findResumableRoom(userId: string): string | null {
    const room = this.findRoomByUser(userId);
    // Nao puxamos de volta para uma sala em ESPERA: se a pessoa saiu para o
    // lobby/home (ex.: clicou no icone wawa), foi porque quis :$
    if (room && room.status !== 'waiting') return room.id;

    const game = this.gameService.GetGameByPlayerId(userId);
    if (game && !game.isGameOver) return game.roomId;

    return null;
  }

  async handleDisconnect(client: Socket) {
    const userId = client.data?.userId;
    if (!userId) return;

    // Moving between pages closes one socket and opens another, and the two can
    // be handled in either order. If this user still has a live socket they have
    // not gone anywhere, so leaving now would start a forfeit against someone who
    // is sitting right there. The socket being cleaned up has already left its
    // rooms, so it cannot count itself here.
    const otherSockets = await this.server.in(userId).fetchSockets();
    if (otherSockets.length > 0) return;

    this.spectators.delete(userId);

    const room = this.findRoomByUser(userId);

    // Host of a room nobody joined yet: give them a moment to come back before
    // the room disappears from the lobby.
    if (room && room.status === 'waiting' && room.hostId === userId) {
      this.scheduleRoomCleanup(room.id);
      return;
    }

    // Left while the room was waiting on a rematch. There is no game left to
    // protect, so hand the room to whoever stayed rather than holding both
    // players in a room neither of them can leave.
    if (room && room.status === 'finished') {
      await this.resetRoom(room, userId);
      return;
    }

    // In a live game: pause it and let GameService decide the forfeit.
    const game = this.gameService.GetGameByPlayerId(userId);
    if (!game || game.isGameOver) return;

    // Jogo vs bot: nao ha adversario humano para proteger, por isso sair (ex.:
    // ir as settings) nao e um forfeit — simplesmente descartamos o jogo. Sem
    // isto, o jogo ficava preso em activeGames e um novo "Play vs bot" era
    // recusado com "You are already in a game or room.", alem de gravar uma
    // derrota injusta quando o timer expirava.
    const vsBot =
      game.player1Id === AI_PLAYER_ID || game.player2Id === AI_PLAYER_ID;
    if (vsBot) {
      this.gameService.AbandonGame(game.roomId);
      return;
    }

    game.disconnectedPlayerId = userId;

    // Sent to the whole room, so spectators watch the clock run down too. The
    // server owns the deadline; the page only renders it ticking.
    this.server.to(game.roomId).emit('opponentDisconnected', {
      message: `${client.data.username} disconnected.`,
      secondsLeft: Math.round(FORFEIT_GRACE_PERIOD_MS / 1000),
    });

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
      rematchVotes: new Set(),
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

  // Back button: a deliberate exit, unlike a dropped connection. Someone who
  // merely reloads is handled by handleDisconnect's grace periods instead.
  @SubscribeMessage('leaveRoom')
  async leaveRoom(@ConnectedSocket() client: Socket, @MessageBody() roomId: string) {
    const userId = client.data.userId;

    this.spectators.delete(userId);
    client.leave(roomId);

    const room = this.rooms.get(roomId);
    if (!room) {
      // Private game vs the AI: drop it, or the player stays "busy" forever.
      const game = this.gameService.GetStateOfGame(roomId);
      if (game && game.player1Id === userId) this.gameService.AbandonGame(roomId);
      return;
    }

    const isPlayer = userId === room.hostId || userId === room.guestId;
    if (!isPlayer) return; // a spectator walking out changes nothing for the room

    // Nobody had joined yet, so the room leaves with its host.
    if (room.status === 'waiting') {
      this.closeRoom(room.id);
      return;
    }

    await this.resetRoom(room, userId);
  }

  // "Play again". It takes both players: the first press is an offer, the second
  // one accepts it and the same room starts a fresh game.
  @SubscribeMessage('requestRematch')
  requestRematch(@ConnectedSocket() client: Socket) {
    const { userId, username } = client.data;
    const room = this.findRoomByUser(userId);

    if (!room || room.status !== 'finished' || !room.guestId || !room.guestName) {
      client.emit('warning', 'There is no finished game to replay here.');
      return;
    }

    room.rematchVotes.add(userId);

    const bothAgreed =
      room.rematchVotes.has(room.hostId) && room.rematchVotes.has(room.guestId);
    if (!bothAgreed) {
      client.to(room.id).emit('rematchRequested', `${username} wants a rematch.`);
      return;
    }

    room.rematchVotes.clear();
    room.status = 'playing';

    const state = this.gameService.InitNewGame(
      room.id,
      { id: room.hostId, name: room.hostName },
      { id: room.guestId, name: room.guestName },
    );

    // MatchFound is what starts a game everywhere else, so the board, the turn
    // and the spectators all reset through the path they already use.
    this.server.to(room.id).emit('MatchFound', {
      room: room.id,
      message: 'Rematch! Game starting',
      state,
    });
    this.broadcastRooms();
  }

  // A player walked out of a live game. Nobody won, so no result is recorded:
  // the game is dropped, anyone watching is sent back to the lobby, and the room
  // reopens with whoever stayed as its host — free for anyone to join again.
  private async resetRoom(room: GameRoom, leaverId: string) {
    this.gameService.AbandonGame(room.id);

    for (const [watcherId, watchedRoomId] of this.spectators) {
      if (watchedRoomId !== room.id) continue;
      this.spectators.delete(watcherId);
      this.server.to(watcherId).emit('roomUnavailable', 'The game ended.');
    }

    this.server.in(room.id).socketsLeave(room.id);

    const stayingId = leaverId === room.hostId ? room.guestId : room.hostId;
    const stayingName = leaverId === room.hostId ? room.guestName : room.hostName;
    if (!stayingId || !stayingName) {
      this.closeRoom(room.id);
      return;
    }

    room.hostId = stayingId;
    room.hostName = stayingName;
    room.guestId = null;
    room.guestName = null;
    room.status = 'waiting';

    // Whoever stayed keeps the room and waits in it, exactly like a fresh host.
    this.server.in(stayingId).socketsJoin(room.id);
    this.server
      .to(stayingId)
      .emit('gameAborted', 'Your opponent left. Waiting for a new opponent...');

    // They may be gone as well — both players can drop at nearly the same time.
    // A promoted host who is not actually connected will never disconnect again,
    // so nothing else would ever clean this room up and it would sit in the
    // lobby forever. Give them the same grace period as any other absent host.
    const stayingSockets = await this.server.in(stayingId).fetchSockets();
    if (stayingSockets.length > 0) this.cancelRoomCleanup(room.id);
    else this.scheduleRoomCleanup(room.id);

    this.broadcastRooms();
  }

  private startGame(client: Socket, room: GameRoom, userId: string, username: string) {
    if (this.isBusy(userId)) {
      client.emit('warning', 'You are already in a game or room.');
      return;
    }

    room.guestId = userId;
    room.guestName = username;
    room.status = 'playing';

    const state = this.gameService.InitNewGame(
      room.id,
      { id: room.hostId, name: room.hostName },
      { id: userId, name: username },
    );
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

    this.spectators.set(client.data.userId, room.id);
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
    client
      .to(game.roomId)
      .emit('opponentReconnected', `${client.data.username} reconnected.`);
  }

  // --- gameplay -------------------------------------------------------------

  /*
    O frontend ainda nao manda dificuldade nenhuma, e nesse caso vale o
    DEFAULT_AI_DIFFICULTY definido no game.service.ts. Quando houver ecra de escolha
    basta emitir playVsAI com { difficulty: 'easy' | 'medium' | 'hard' }, sem mexer aqui.
  */
  @SubscribeMessage('playVsAI')
  startAIGame(
    @ConnectedSocket() client: Socket,
    @MessageBody() data?: { difficulty?: string },
  ) {
    const userId = client.data.userId;

    // Uma sala de lobby (multiplayer) bloqueia mesmo — nao a mexemos.
    if (this.findRoomByUser(userId)) {
      client.emit('warning', 'You are already in a game or room.');
      return;
    }
    // Um jogo vs bot antigo e descartavel: abandona-o e comeca um novo, para
    // "Play vs bot" nunca ficar preso em "already in a game" (ex.: foi as
    // settings e voltou). So recusamos se for um jogo multiplayer a decorrer.
    const existing = this.gameService.GetGameByPlayerId(userId);
    if (existing) {
      const existingVsBot =
        existing.player1Id === AI_PLAYER_ID ||
        existing.player2Id === AI_PLAYER_ID;
      if (!existingVsBot) {
        client.emit('warning', 'You are already in a game or room.');
        return;
      }
      this.gameService.AbandonGame(existing.roomId);
    }

    //Nunca confiar no que vem do cliente: so passa se for mesmo um dos niveis conhecidos
    const requested = data?.difficulty;
    const difficulty = DIFFICULTIES.find((level) => level === requested);

    const roomId = `room-${this.roomCounter++}`;
    const state = this.gameService.InitNewGame(
      roomId,
      { id: userId, name: client.data.username },
      { id: AI_PLAYER_ID, name: AI_PLAYER_NAME },
      difficulty,
    );
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

    // Vs the AI the move above was ours, so the bot answers next.
    if (state.player2Id === AI_PLAYER_ID && state.currentPlayer === 2) {
      // Pause first so the reply is not instant. It is still the bot's turn
      // while this runs, so the player cannot sneak a move in.
      await this.sleep(GameGateway.AI_THINK_TIME_MS);

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

    await this.gameService.finalizeGame(finalState);

    // Avisa cada jogador humano que as suas stats mudaram, para o dashboard (se
    // aberto noutra aba) se atualizar em tempo real. Emitimos para a room pessoal
    // (userId), que apanha todas as ligacoes desse utilizador. A IA nao tem stats.
    for (const playerId of [finalState.player1Id, finalState.player2Id]) {
      if (playerId !== AI_PLAYER_ID) {
        this.server.to(playerId).emit('statsUpdated');
      }
    }

    // A game vs the bot has no room to keep: "play again" just starts a new one.
    const room = this.rooms.get(roomId);
    if (!room) return;

    // Everyone stays in the channel so the players can agree on a rematch (and
    // spectators can watch it), but the room drops out of the lobby meanwhile.
    room.status = 'finished';
    room.rematchVotes.clear();

    // Unless nobody is there to be asked. A forfeit can land long after both
    // players dropped, and a room with no one in it will never see another
    // disconnect to clean it up — it would keep both players "busy" for good.
    if (!(await this.anyPlayerConnected(room))) {
      this.closeRoom(room.id);
      return;
    }

    this.broadcastRooms();
  }

  private async anyPlayerConnected(room: GameRoom): Promise<boolean> {
    for (const playerId of [room.hostId, room.guestId]) {
      if (!playerId) continue;
      const sockets = await this.server.in(playerId).fetchSockets();
      if (sockets.length > 0) return true;
    }
    return false;
  }

  // --- room bookkeeping -----------------------------------------------------

  // Finished rooms are left out: their game is over, so there is nothing to
  // join or spectate while the two players decide whether to play again.
  private roomSummaries(): RoomSummary[] {
    return Array.from(this.rooms.values())
      .filter((room) => room.status !== 'finished')
      .map(toRoomSummary);
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
