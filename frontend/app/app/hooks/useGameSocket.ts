"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import type {
  GameState,
  MatchFoundPayload,
  GameOverPayload,
  OpponentDisconnectedPayload,
  RoomSummary,
} from "../types/game";
import { AI_PLAYER_ID } from "../types/game";
import { useUser } from "@/context/AuthContext";

const ROWS = 6;
const COLS = 7;

// The single place that talks to the game gateway. A component calls this hook
// and drives the board from `state`, forwarding column clicks through `play`.
export function useGameSocket() {
  const socketRef = useRef<Socket | null>(null);

  // roomId in a ref: `play` reads it, and capturing it from state inside the
  // callback risks a stale value. The server sends roomId on every update.
  const roomRef = useRef<string | null>(null);

  const [state, setState] = useState<GameState | null>(null);
  const [status, setStatus] = useState<string>("");
  const [connected, setConnected] = useState(false);
  // Quem somos: id (para saber se somos o player 1 ou 2) e nome. Vem do
  // AuthContext, que ja carregou o /api/auth/me uma vez — NAO voltamos a
  // pedi-lo aqui. Cada montagem deste hook (navegacao, StrictMode em dev) fazia
  // mais um /api/auth/me e isso estoirava o rate limit (429).
  const { user } = useUser();
  const myId = user?.id ?? null;
  const myName = user?.username ?? null;

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
  const [forfeit, setForfeit] = useState<OpponentDisconnectedPayload | null>(null);

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
    socket.on("statusWait", (msg: string) => {
      setInRoom(true);
      setStatus(msg);
    });
    socket.on("warning", (msg: string) => setStatus(msg));

    socket.on("MatchFound", (d: MatchFoundPayload) => {
      setInRoom(true);
      roomRef.current = d.room;
      setState(d.state);
      setStatus("");
      // A new game is running (first match or rematch): the offers are spent.
      setIWantRematch(false);
      setOpponentWantsRematch(false);
    });

    socket.on("rematchRequested", () => setOpponentWantsRematch(true));

    socket.on("gameStateUpdated", (s: GameState) => {
      setInRoom(true);
      roomRef.current = s.roomId;
      setState(s);
      setStatus("");
    });

    socket.on("gameOver", (d: GameOverPayload) => {
      setForfeit(null);
      setState((prev) =>
        prev ? { ...prev, board: d.board, isGameOver: true, winnerId: d.winner } : prev
      );
    });

    socket.on("opponentDisconnected", (d: OpponentDisconnectedPayload) => {
      setStatus(d.message);
      setForfeit(d);
    });
    socket.on("opponentReconnected", (msg: string) => {
      setStatus(msg);
      setForfeit(null); // they made it back, stop the clock
    });

    // The opponent walked out. The room reopened around us, so we drop the
    // board and wait for someone new instead of leaving the page.
    socket.on("gameAborted", (msg: string) => {
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
    return () => {
      socket.disconnect();
      socketRef.current = null;
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
  const playAI = useCallback(() => socketRef.current?.emit("playVsAI"), []);

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
  const leaveRoom = useCallback(() => {
    const roomId = roomRef.current;
    if (!roomId) return;
    socketRef.current?.emit("leaveRoom", roomId);
    roomRef.current = null;
  }, []);

  // "Play again" once a game is over. Against the bot there is nobody to agree
  // with, so a fresh game starts at once; against a person the server holds the
  // offer until they press it too.
  const requestRematch = useCallback(() => {
    if (!state?.isGameOver) return;
    if (state.player2Id === AI_PLAYER_ID) {
      socketRef.current?.emit("playVsAI");
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
