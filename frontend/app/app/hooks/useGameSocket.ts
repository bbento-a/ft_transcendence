"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import type {
  BackendMessage,
  ForfeitCountdown,
  GameOverPayload,
  GameState,
  MatchFoundPayload,
  OpponentDisconnectedPayload,
  RoomSummary,
} from "../types/game";
import { AI_PLAYER_ID, Difficulty } from "../types/game";
import { useUser } from "@/context/AuthContext";

const ROWS = 6;
const COLS = 7;

// Quanto tempo, no maximo, o socket fica aberto a espera da confirmacao de uma
// saida antes de fechar na mesma. A pagina nunca espera por isto — so o fecho
// do socket espera —, por isso um servidor calado nao trava nada.
const LEAVE_ACK_TIMEOUT_MS = 1000;

// The single place that talks to the game gateway. A component calls this hook
// and drives the board from `state`, forwarding column clicks through `play`.
export function useGameSocket() {
  const socketRef = useRef<Socket | null>(null);

  // roomId in a ref: `play` reads it, and capturing it from state inside the
  // callback risks a stale value. The server sends roomId on every update.
  const roomRef = useRef<string | null>(null);

  // Saida pedida e ainda por confirmar. Resolve quando o servidor responde, e e
  // o que segura o fecho do socket na limpeza do efeito.
  const pendingLeaveRef = useRef<Promise<void> | null>(null);

  const [state, setState] = useState<GameState | null>(null);
  /*
    A mensagem de estado guardada como CHAVE (o que o gateway manda), nunca como
    frase. Traduzir aqui, no momento em que o evento chega, congelava o texto no
    idioma dessa altura: quem trocasse de idioma a espera de adversario ficava
    com o "Waiting for an opponent..." em ingles ate a proxima mensagem chegar,
    porque o socket nao volta a emitir nada. Quem traduz e a pagina, a cada
    renderizacao.
  */
  const [status, setStatus] = useState<BackendMessage | null>(null);
  const [connected, setConnected] = useState(false);
  // Quem somos: id (para saber se somos o player 1 ou 2) e nome. Vem do
  // AuthContext, que ja carregou o /api/auth/me uma vez — NAO voltamos a
  // pedi-lo aqui. Cada montagem deste hook (navegacao, StrictMode em dev) fazia
  // mais um /api/auth/me e isso estoirava o rate limit (429).
  const { user } = useUser();
  const myId = user?.id ?? null;
  const myName = user?.username ?? null;

  // Nada aqui traduz: o gateway manda chaves (ver BackendMessage) e elas
  // atravessam este hook intactas ate a pagina que as mostra. Assim os handlers
  // do socket, que sao registados uma unica vez, nunca dependem do idioma -- e
  // trocar de idioma nao reabre o socket nem deixa texto velho no ecra.

  // Lobby: every open room, refreshed by the server whenever one changes.
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  // Ja recebemos a lista de salas pelo menos uma vez? Distingue "ainda a
  // carregar" de "carregou e esta vazia", para o lobby nao dar flash do
  // "no rooms available" enquanto o socket liga (ex.: no F5).
  const [roomsLoaded, setRoomsLoaded] = useState(false);
  // Id of a room we just created, so the lobby can navigate into it.
  const [createdRoomId, setCreatedRoomId] = useState<string | null>(null);
  // A room we never really left (closed tab, lost connection). The lobby sends
  // us back into it rather than listing it as somebody else's game.
  const [resumeRoomId, setResumeRoomId] = useState<string | null>(null);
  // The room we asked for does not exist: the game page returns to the lobby.
  const [roomUnavailable, setRoomUnavailable] = useState(false);
  // True once the server confirms we are really inside a room. The board waits
  // for this, so a wrong URL never flashes a game on its way back to the lobby.
  const [inRoom, setInRoom] = useState(false);
  // Who dropped out and how long they have left before forfeiting; null when
  // nobody is missing. The name and the count are kept together because they are
  // only meaningful side by side, and `status` gets overwritten by other events.
  const [forfeit, setForfeit] = useState<ForfeitCountdown | null>(null);

  // Rematch offers standing since the last game ended. A rematch needs both, so
  // the button reads "Rematch", "Waiting..." or "Accept rematch" accordingly.
  const [iWantRematch, setIWantRematch] = useState(false);
  const [opponentWantsRematch, setOpponentWantsRematch] = useState(false);

  useEffect(() => {
    // No URL => same origin; nginx proxies /socket.io/. withCredentials sends
    // the auth cookie in the handshake so the gateway can identify us.
    const socket = io({ withCredentials: true });
    socketRef.current = socket;

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    // Waiting for an opponent, or watching a game: either way we are in a room.
    socket.on("statusWait", (msg: BackendMessage) => {
      setInRoom(true);
      setStatus(msg);
    });
    socket.on("warning", (msg: BackendMessage) => setStatus(msg));

    socket.on("MatchFound", (d: MatchFoundPayload) => {
      setInRoom(true);
      roomRef.current = d.room;
      setState(d.state);
      setStatus(null);
      // A new game is running (first match or rematch): the offers are spent.
      setIWantRematch(false);
      setOpponentWantsRematch(false);
    });

    socket.on("rematchRequested", () => setOpponentWantsRematch(true));

    socket.on("gameStateUpdated", (s: GameState) => {
      setInRoom(true);
      roomRef.current = s.roomId;
      setState(s);
      setStatus(null);
    });

    socket.on("gameOver", (d: GameOverPayload) => {
      setForfeit(null);
      setState((prev) =>
        prev ? { ...prev, board: d.board, isGameOver: true, winnerId: d.winner } : prev
      );
    });

    socket.on("opponentDisconnected", (d: OpponentDisconnectedPayload) => {
      setStatus(d.message);
      setForfeit({ message: d.message, secondsLeft: d.secondsLeft });
    });
    socket.on("opponentReconnected", (msg: BackendMessage) => {
      setStatus(msg);
      setForfeit(null); // they made it back, stop the clock
    });

    // The opponent walked out. The room reopened around us, so we drop the
    // board and wait for someone new instead of leaving the page.
    socket.on("gameAborted", (msg: BackendMessage) => {
      setInRoom(true);
      setState(null);
      setStatus(msg);
      setForfeit(null);
      setIWantRematch(false);
      setOpponentWantsRematch(false);
    });

    // --- lobby ---
    socket.on("roomList", (list: RoomSummary[]) => {
      setRooms(list);
      setRoomsLoaded(true);
    });
    socket.on("roomCreated", (d: { roomId: string }) => setCreatedRoomId(d.roomId));
    socket.on("resumeRoom", (d: { roomId: string }) => setResumeRoomId(d.roomId));
    socket.on("roomUnavailable", () => setRoomUnavailable(true));

    // Cleanup: React dev mode mounts twice; without this we leak sockets and
    // leave phantom rooms behind in the gateway.
    //
    // Com uma saida acabada de pedir, o socket so fecha depois de o servidor a
    // confirmar. Sao alguns ms com dois sockets nossos abertos — o gateway ja
    // conta com isso e e o que evita
    // que o pacote do "leaveRoom" morra com a ligacao.
    return () => {
      const pendingLeave = pendingLeaveRef.current;
      pendingLeaveRef.current = null;
      socketRef.current = null;

      if (pendingLeave) pendingLeave.then(() => socket.disconnect());
      else socket.disconnect();
    };
  }, []);

  // Tick the forfeit clock down once a second. One timeout per second rather
  // than an interval, so it stops cleanly the moment the count is cleared.
  useEffect(() => {
    if (!forfeit || forfeit.secondsLeft <= 0) return;
    const timer = setTimeout(
      () => setForfeit((f) => (f ? { ...f, secondsLeft: f.secondsLeft - 1 } : null)),
      1000
    );
    return () => clearTimeout(timer);
  }, [forfeit]);

  // Which player are we in this match? 1, 2, or null.
  const myPlayerNumber =
    state && myId
      ? state.player1Id === myId
        ? 1
        : state.player2Id === myId
          ? 2
          : null
      : null;

  const isMyTurn =
    !!state && !state.isGameOver && state.currentPlayer === myPlayerNumber;

  // FRONTEND validation — mirrors the backend's checks in game.gateway/service.
  // A move is only sent if all of these pass; the backend re-checks them too.
  const canPlay = useCallback(
    (column: number): boolean => {
      if (!state || state.isGameOver) return false;      // no game / finished
      if (!isMyTurn) return false;                        // not our turn
      if (!Number.isInteger(column) || column < 0 || column >= COLS) return false; // out of range
      if (state.board[0][column] !== 0) return false;     // column is full
      return true;
    },
    [state, isMyTurn]
  );

  // --- actions ---
  // Sem dificuldade o backend usa o DEFAULT_AI_DIFFICULTY dele; com ela, o
  // backend ainda valida contra a lista de niveis antes de aceitar.
  const playAI = useCallback((difficulty?: Difficulty) => {
    socketRef.current?.emit("playVsAI", difficulty ? { difficulty } : undefined);
  }, []);

  // Lobby actions.
  const getRooms = useCallback(() => socketRef.current?.emit("getRooms"), []);
  const createRoom = useCallback(() => socketRef.current?.emit("createRoom"), []);

  // The only way into a room. The server decides whether we return as a player,
  // join as the opponent, or watch — so the caller does not have to know.
  const enterRoom = useCallback((roomId: string) => {
    roomRef.current = roomId;
    socketRef.current?.emit("enterRoom", roomId);
  }, []);

  // Leaves whichever room we are actually in. That is not always the one in the
  // URL: a game vs the bot is reached through /ai but the server gives it a real
  // id, and leaving with "ai" would abandon nothing.
  //
  // Volta imediatamente: quem chama navega ja, sem esperar pelo servidor. O que
  // fica pendente e o fecho do socket — desmontar a pagina fecha-o, e fecha-lo
  // antes de o pacote sair deixava-nos "dentro" da sala do lado do servidor.
  const leaveRoom = useCallback(() => {
    const roomId = roomRef.current;
    const socket = socketRef.current;
    roomRef.current = null;
    if (!roomId || !socket) return;

    pendingLeaveRef.current = new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, LEAVE_ACK_TIMEOUT_MS);
      socket.emit("leaveRoom", roomId, () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }, []);

  // "Play again" once a game is over. Against the bot there is nobody to agree
  // with, so a fresh game starts at once; against a person the server holds the
  // offer until they press it too.
  const requestRematch = useCallback(() => {
    if (!state?.isGameOver) return;
    if (state.player2Id === AI_PLAYER_ID) {
      // Repete a dificuldade do jogo que acabou; sem ela o rematch caia no
      // default do backend em vez de manter o nivel escolhido.
      socketRef.current?.emit(
        "playVsAI",
        state.difficulty ? { difficulty: state.difficulty } : undefined,
      );
      return;
    }
    setIWantRematch(true);
    socketRef.current?.emit("requestRematch");
  }, [state]);

  const play = useCallback(
    (column: number) => {
      // Validate on the frontend before sending. Backend validates again.
      if (!canPlay(column)) return;
      socketRef.current?.emit("playerMove", { roomId: roomRef.current, column });
    },
    [canPlay]
  );

  return {
    state, status, connected, isMyTurn, myPlayerNumber, myName, canPlay, play, playAI,
    rooms, roomsLoaded, createdRoomId, resumeRoomId, roomUnavailable, inRoom, forfeit,
    getRooms, createRoom, enterRoom, leaveRoom,
    requestRematch, iWantRematch, opponentWantsRematch,
    ROWS, COLS,
  };
}
