import {
  WebSocketGateway,
  SubscribeMessage,
  ConnectedSocket,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { GameService, FORFEIT_GRACE_PERIOD_MS } from './game.service';
import { BackendMessage, DIFFICULTIES, GameState, otherPlayer } from './game.types';
import { GameRoom, RoomSummary, toRoomSummary } from './game.room';
import { JwtService } from '@nestjs/jwt';
import * as cookie from 'cookie';
import { PrismaService } from '../prisma/prisma.service';

// A host who closes the tab should not leave a ghost room in the lobby. A host
// who is just walking from /gamerooms to the game page must not lose the room
// either — that navigation drops one socket and opens another. So a room whose
// host went away is deleted only if they do not come back within this window.
const HOST_RECONNECT_GRACE_MS = 15_000;

const AI_PLAYER_ID = 'AI';

// Shown on the board's side panel, matching the "Play vs bot" wording.
const AI_PLAYER_NAME = 'Carlitos';

// Traduzir aqui era impossivel: o servidor nao tem idioma nenhum — quem o tem e
// cada browser ligado, e a mesma sala pode ter pessoas em idiomas diferentes.
// Por isso mandamos so a chave (+ os valores que a frase precisa) e e o
// frontend que a traduz. As chaves vivem em frontend/app/messages/*.json,
// debaixo de "gameroomBackend".
const t = (key: string, params?: Record<string, string>): BackendMessage =>
  params ? { key, params } : { key };

@WebSocketGateway({ cors: true })
export class GameGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
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
    private readonly prisma: PrismaService,
  ) {}

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // --- connection lifecycle -------------------------------------------------

  /*

    Quem falha aqui recebe um connect_error (ver o handler no useGameSocket),
    ja nao o evento 'warning' — antes do handshake acabar nao ha canal para
    emitir eventos nossos.
  */
  afterInit(server: Server) {
    server.use(async (socket, next) => {
      const user = await this.authenticateSocket(socket);
      if (!user) return next(new Error('unauthorized'));

      socket.data.userId = user.id;
      socket.data.username = user.username;
      // O dashboard liga um socket so para ouvir statsUpdated (useStatsSocket,
      // query scope=stats). Ele NAO conta como presenca no jogo: sem esta marca,
      // sair de uma partida para o dashboard nunca arrancava o cronometro de
      // desistencia — o gateway via este socket e achava que o jogador ainda
      // ca estava. Tudo o que nao se identificar fica 'game', como sempre foi.
      socket.data.scope =
        socket.handshake.query.scope === 'stats' ? 'stats' : 'game';
      next();
    });
  }

  handleConnection(client: Socket) {
    // O middleware do afterInit ja autenticou; sem client.data nem chegamos ca.
    const { userId } = client.data;

    // O canal pessoal e para TODOS os sockets: e por ele que o statsUpdated
    // chega ao dashboard, e o socket de stats liga-se exatamente para isso.
    client.join(userId);

    // Mas so um socket de JOGO e puxado de volta para uma sala pendente — o
    // dashboard nao tem pagina de jogo nenhuma para onde voltar.
    if (client.data.scope === 'stats') return;

    // Still tied to a room (closed the tab, lost the network, crashed)? Point the
    // lobby straight back at it, instead of leaving the player looking at their
    // own game in the list with a "Spectate" button on it.
    const roomId = this.findResumableRoom(userId);
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

  /*
    "Este utilizador ainda esta no jogo?" — conta apenas sockets de JOGO.
    O socket de stats do dashboard vive no mesmo canal pessoal (precisa dele
    para o statsUpdated), mas estar a olhar para o dashboard nao e estar numa
    partida: se ele contasse, sair de um jogo para o dashboard nunca arrancava
    o cronometro de desistencia e o adversario ficava pendurado sem contagem.
  */
  private async hasGameSockets(userId: string): Promise<boolean> {
    const sockets = await this.server.in(userId).fetchSockets();
    return sockets.some((s) => s.data.scope !== 'stats');
  }

  async handleDisconnect(client: Socket) {
    const userId = client.data?.userId;
    if (!userId) return;

    // Moving between pages closes one socket and opens another, and the two can
    // be handled in either order. If this user still has a live GAME socket they
    // have not gone anywhere, so leaving now would start a forfeit against
    // someone who is sitting right there. The socket being cleaned up has
    // already left its rooms, so it cannot count itself here.
    if (await this.hasGameSockets(userId)) return;

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
    //
    // O jogo vs bot passa por aqui exatamente como um multiplayer: sair da
    // pagina (ir as settings, por exemplo) nao descarta a partida — ela fica em
    // pausa e retomamo-la ao voltar (ver startAIGame/enterRoom). So se o
    // periodo de graca esgotar e que conta como forfeit, com a derrota gravada
    // — a mesma promessa que o popup de saida ja faz contra o bot.
    const game = this.gameService.GetGameByPlayerId(userId);
    if (!game || game.isGameOver) return;

    game.disconnectedPlayerId = userId;

    // Sent to the whole room, so spectators watch the clock run down too. The
    // server owns the deadline; the page only renders it ticking.
    this.server.to(game.roomId).emit('opponentDisconnected', {
      message: t("disconnected", { name: client.data.username }),
      secondsLeft: Math.round(FORFEIT_GRACE_PERIOD_MS / 1000),
    });

    this.gameService.StartForfeitTimer(game.roomId, userId, async (finishedGame) => {
      await this.endGame(finishedGame.roomId, finishedGame, t("noReconnection"));
      this.dismissAfterForfeit(finishedGame);
    });
  }

  /*
    Desistencia por nao voltar a tempo. O endGame ja deixou a sala em 'finished'
    a espera de uma revanche — so que o adversario nao esta la para a aceitar, e
    nao vai estar: foi precisamente por isso que o cronometro chegou ao fim. Sem
    isto o vencedor ficava com um botao de revanche que nunca ninguem premia.

    Fechamos a sala e mandamos o vencedor de volta ao lobby, como na desistencia
    deliberada. Ao contrario dessa, aqui NAO limpamos o tabuleiro: o gameOver
    acabou de mostrar a jogada final e vale a pena deixar ver como ficou.
  */
  private dismissAfterForfeit(finalState: GameState) {
    // Sem sala: ou era um jogo contra o bot (que nunca teve uma), ou o proprio
    // endGame ja a fechou por nao haver ninguem ligado. Nos dois casos nao ha
    // ninguem para tirar de lado nenhum.
    const room = this.rooms.get(finalState.roomId);
    if (!room) return;

    // Quem estava a ver fica sem sala: mandamo-los embora como em qualquer
    // outro fim de sala, senao ficavam num canal que ja nao existe.
    for (const [watcherId, watchedRoomId] of this.spectators) {
      if (watchedRoomId !== room.id) continue;
      this.spectators.delete(watcherId);
      this.server.to(watcherId).emit('roomUnavailable', t("gameEnded"));
    }

    this.server.in(room.id).socketsLeave(room.id);
    this.closeRoom(room.id);

    // Canal pessoal: o socketsLeave acima ja o tirou do canal da sala.
    if (finalState.winnerId) {
      this.server.to(finalState.winnerId).emit('returnToLobby');
    }
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

      // O token so serve para provar QUEM somos (payload.sub). O nome vem
      // sempre da BD: o payload.username fica congelado no que era na altura do
      // login, e o PATCH /auth/me nao reemite o cookie -- quem mudasse de nick
      // continuava a aparecer com o antigo no tabuleiro (e no historico de
      // partidas) ate as 24h do token passarem.
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, username: true },
      });

      // Token nosso mas o utilizador ja nao existe (BD recriada, conta apagada):
      // o mesmo criterio do getMe, nao ha sessao fantasma a jogar.
      return user ?? null;
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
      client.emit('warning', t("alreadyInRoom"));
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
      lastStarter: null,
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
      client.emit('roomUnavailable', t("noRoom"));
      return;
    }

    if (userId === room.hostId || userId === room.guestId) {
      this.cancelRoomCleanup(room.id);
      client.join(room.id);

      const game = this.gameService.GetStateOfGame(room.id);
      if (game) this.rejoinGame(client, game);
      else client.emit('statusWait', t("waitingOpponent"));
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
  //
  // Devolve sempre um valor: e o ack que a pagina espera antes de navegar, e o
  // adaptador do Nest so o envia se o handler devolver algo. Sem ele a pagina
  // saia antes de nos processarmos isto e, na ligacao seguinte, ainda a viamos
  // dentro da sala — mandando-a de volta com "resumeRoom".
  @SubscribeMessage('leaveRoom')
  async leaveRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() roomId: string,
  ): Promise<{ left: true }> {
    const userId = client.data.userId;

    this.spectators.delete(userId);
    client.leave(roomId);

    const room = this.rooms.get(roomId);
    if (!room) {
      // Private game vs the AI. Walking out on purpose is a forfeit here too:
      // the bot "wins" (it never gets counters — buildOutcomes drops it) and the
      // player takes the loss, exactly as against a human. Either way the game
      // leaves activeGames, or the player would stay "busy" forever.
      const game = this.gameService.GetStateOfGame(roomId);
      if (game && game.player1Id === userId) {
        const forfeited = this.gameService.ForfeitGame(roomId, userId);
        if (forfeited) await this.gameService.finalizeGame(forfeited);
        else this.gameService.AbandonGame(roomId);
      }
      return { left: true };
    }

    const isPlayer = userId === room.hostId || userId === room.guestId;
    // A spectator walking out changes nothing for the room.
    if (!isPlayer) return { left: true };

    // Nobody had joined yet, so the room leaves with its host.
    if (room.status === 'waiting') {
      this.closeRoom(room.id);
      return { left: true };
    }

    await this.resetRoom(room, userId);
    return { left: true };
  }

  // "Play again". It takes both players: the first press is an offer, the second
  // one accepts it and the same room starts a fresh game.
  @SubscribeMessage('requestRematch')
  requestRematch(@ConnectedSocket() client: Socket) {
    const { userId, username } = client.data;
    const room = this.findRoomByUser(userId);

    if (!room || room.status !== 'finished' || !room.guestId || !room.guestName) {
      client.emit('warning', t("noReplay"));
      return;
    }

    room.rematchVotes.add(userId);

    const bothAgreed =
      room.rematchVotes.has(room.hostId) && room.rematchVotes.has(room.guestId);
    if (!bothAgreed) {
      client.to(room.id).emit('rematchRequested', t("wantsRematch", { name: username }));
      return;
    }

    room.rematchVotes.clear();
    room.status = 'playing';

    // Revanche: abre quem NAO abriu da ultima vez, em vez de sortear outra vez.
    // Sem lastStarter (sala antiga, por exemplo) cai no sorteio do servico.
    const nextStarter = room.lastStarter ? otherPlayer(room.lastStarter) : undefined;

    const state = this.gameService.InitNewGame(
      room.id,
      { id: room.hostId, name: room.hostName },
      { id: room.guestId, name: room.guestName },
      undefined,
      nextStarter,
    );
    room.lastStarter = state.currentPlayer;

    // MatchFound is what starts a game everywhere else, so the board, the turn
    // and the spectators all reset through the path they already use.
    this.server.to(room.id).emit('MatchFound', {
      room: room.id,
      message: t("rematch"),
      state,
    });
    this.broadcastRooms();
  }

  // A player walked out. Anyone watching is sent back to the lobby, and what
  // happens to the room depends on whether there was a game to lose:
  //   jogo a decorrer  -> desistencia. A sala FECHA e quem ficou volta ao lobby.
  //   sala em revanche -> nada a perder. A sala reabre com quem ficou de anfitriao.
  private async resetRoom(room: GameRoom, leaverId: string) {
    // Walking out of a RUNNING game is a forfeit — exactly what the exit popup
    // warns — so the result is recorded: the leaver takes the loss, whoever
    // stayed the win, match history included. When there is no live game (a
    // room waiting on a rematch), there is nothing to record and Abandon just
    // tidies the timers.
    const forfeited = this.gameService.ForfeitGame(room.id, leaverId);
    if (forfeited) await this.gameService.finalizeGame(forfeited);
    else this.gameService.AbandonGame(room.id);

    for (const [watcherId, watchedRoomId] of this.spectators) {
      if (watchedRoomId !== room.id) continue;
      this.spectators.delete(watcherId);
      this.server.to(watcherId).emit('roomUnavailable', t("gameEnded"));
    }

    this.server.in(room.id).socketsLeave(room.id);

    const stayingId = leaverId === room.hostId ? room.guestId : room.hostId;
    const stayingName = leaverId === room.hostId ? room.guestName : room.hostName;
    if (!stayingId || !stayingName) {
      this.closeRoom(room.id);
      return;
    }

    /*
      Vitoria por desistencia: quem ficou nao herda uma sala vazia a espera de
      um desconhecido. A sala fecha e a pagina dele volta ao lobby passados
      alguns segundos, o tempo de ler a mensagem.

      Fechar a sala e o que garante que ele nao volta ca para dentro: enquanto
      fosse anfitriao dela, o findResumableRoom apanhava-a assim que a ligacao
      seguinte se abrisse no lobby e mandava-o de volta com 'resumeRoom'.
      O jogo em si ja desapareceu no finalizeGame, portanto tambem nao ha nada
      la para o puxar.

      A mensagem vai para o canal pessoal (stayingId) e nao para a sala, porque
      o socketsLeave acima ja o tirou dela.
    */
    if (forfeited) {
      this.closeRoom(room.id);
      this.server.to(stayingId).emit('opponentForfeited', t("leftAndForfeit"));
      return;
    }

    room.hostId = stayingId;
    room.hostName = stayingName;
    room.guestId = null;
    room.guestName = null;
    room.status = 'waiting';
    // Adversario novo: a alternancia recomeca do zero, com sorteio.
    room.lastStarter = null;

    // Sem desistencia (saiu de uma sala a espera de revanche) nao houve jogo
    // nenhum a perder, por isso quem ficou guarda a sala e espera nela, tal e
    // qual um anfitriao acabado de criar uma.
    this.server.in(stayingId).socketsJoin(room.id);
    this.server.to(stayingId).emit('gameAborted', t("leftAndWaiting"));


    if (await this.hasGameSockets(stayingId)) this.cancelRoomCleanup(room.id);
    else this.scheduleRoomCleanup(room.id);

    this.broadcastRooms();
  }

  private startGame(client: Socket, room: GameRoom, userId: string, username: string) {
    if (this.isBusy(userId)) {
      client.emit('warning', t("unavailable"));
      return;
    }

    room.guestId = userId;
    room.guestName = username;
    room.status = 'playing';

    // Sem starter explicito o servico sorteia. Guardamos o resultado: a
    // revanche desta sala da a abertura ao outro jogador.
    const state = this.gameService.InitNewGame(
      room.id,
      { id: room.hostId, name: room.hostName },
      { id: userId, name: username },
    );
    room.lastStarter = state.currentPlayer;
    client.join(room.id);

    this.server.to(room.id).emit('MatchFound', {
      room: room.id,
      message: t("startingGame"),
      state,
    });
    this.broadcastRooms();
  }

  private watchGame(client: Socket, room: GameRoom) {
    const game = this.gameService.GetStateOfGame(room.id);
    if (!game) {
      client.emit('roomUnavailable', t("alreadyOver"));
      return;
    }

    this.spectators.set(client.data.userId, room.id);
    client.join(room.id);
    client.emit('gameStateUpdated', game);
    client.emit(
      'statusWait',
      t("watching", { host: room.hostName, guest: room.guestName ?? '' }),
    );
  }

  // A player is back (reload, or arriving from the lobby): resume where they left.
  private rejoinGame(client: Socket, game: GameState) {
    this.gameService.CancelForfeitTimer(game.roomId);
    game.disconnectedPlayerId = null;

    client.join(game.roomId);
    client.emit('gameStateUpdated', game);
    client
      .to(game.roomId)
      .emit('opponentReconnected', t("reconnected", { name: client.data.username }));
  }

  // --- gameplay -------------------------------------------------------------

  /*
    O frontend ainda nao manda dificuldade nenhuma, e nesse caso vale o
    DEFAULT_AI_DIFFICULTY definido no game.service.ts. Quando houver ecra de escolha
    basta emitir playVsAI com { difficulty: 'easy' | 'medium' | 'hard' }, sem mexer aqui.
  */
  @SubscribeMessage('playVsAI')
  async startAIGame(
    @ConnectedSocket() client: Socket,
    @MessageBody() data?: { difficulty?: string },
  ) {
    const userId = client.data.userId;

    // Uma sala de lobby (multiplayer) bloqueia mesmo — nao a mexemos.
    if (this.findRoomByUser(userId)) {
      client.emit('warning', t("unavailable"));
      return;
    }
    // Ja ha uma partida vs bot a decorrer? Entao isto nao e um jogo novo: e um
    // regresso a ela (foi as settings e voltou pela seta, que traz o browser de
    // volta a /ai). Retomamos onde ficou, como o enterRoom faz no multiplayer —
    // comecar um jogo novo aqui apagava um tabuleiro a meio.
    // Uma partida terminada ja saiu do activeGames no finalizeGame, por isso o
    // "Rematch" continua a cair no caminho de baixo e comeca um jogo mesmo novo.
    const existing = this.gameService.GetGameByPlayerId(userId);
    if (existing && !existing.isGameOver) {
      const existingVsBot =
        existing.player1Id === AI_PLAYER_ID ||
        existing.player2Id === AI_PLAYER_ID;
      if (!existingVsBot) {
        client.emit('warning', t("unavailable"));
        return;
      }
      this.rejoinGame(client, existing);
      return;
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
      message: t("playingAI"),
      state,
    });

    // O sorteio pode ter calhado ao bot: nesse caso e ele que abre o jogo.
    await this.playAITurnIfDue(roomId, state);
  }

  @SubscribeMessage('playerMove')
  async handleMove(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; column: number },
  ) {
    const userId = client.data.userId;

    if (this.spectators.has(userId)) {
      client.emit('warning', t("specNoPlay"));
      return;
    }

    // GameService re-checks this, but rejecting here keeps bad input out of it.
    if (!Number.isInteger(data.column) || data.column < 0 || data.column > 6) {
      client.emit('warning', t("invalidColumn"));
      return;
    }

    const state = this.gameService.MakeMove(data.roomId, userId, data.column);
    if (!state) {
      client.emit('warning', t("invalidPlay"));
      return;
    }

    this.server.to(data.roomId).emit('gameStateUpdated', state);

    if (state.isGameOver) {
      await this.endGame(data.roomId, state);
      return;
    }

    // Vs the AI the move above was ours, so the bot answers next.
    await this.playAITurnIfDue(data.roomId, state);
  }

  /*
    Faz a jogada do bot se for mesmo a vez dele. Chamado depois de cada jogada
    humana e tambem no arranque de um jogo vs bot: como a abertura e sorteada,
    o bot pode calhar jogar primeiro -- e sem isto ficava tudo a espera de um
    jogador que nao pode jogar.
  */
  private async playAITurnIfDue(roomId: string, state: GameState) {
    if (state.isGameOver) return;
    if (state.player2Id !== AI_PLAYER_ID || state.currentPlayer !== 2) return;

    // Pause first so the reply is not instant. It is still the bot's turn
    // while this runs, so the player cannot sneak a move in.
    await this.sleep(GameGateway.AI_THINK_TIME_MS);

    const afterAI = this.gameService.PlayerAIMove(roomId);
    if (!afterAI) return;

    this.server.to(roomId).emit('gameStateUpdated', afterAI);
    if (afterAI.isGameOver) await this.endGame(roomId, afterAI);
  }

  private async endGame(
    roomId: string,
    finalState: GameState,
    customMessage?: BackendMessage,
  ) {
    const message =
      customMessage ??
      (finalState.winnerId ? t("gameOver") : t("gameDraw"));

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
      if (await this.hasGameSockets(playerId)) return true;
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
