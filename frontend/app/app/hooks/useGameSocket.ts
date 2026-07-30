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
  // Our own id, to know if we are player 1 or 2 (which drives "is it my turn").
  const [myId, setMyId] = useState<string | null>(null);

  // Lobby: every open room, refreshed by the server whenever one changes.
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
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
  // Seconds an absent opponent still has before forfeiting; null when nobody is
  // missing. The server sets the starting value, we just count it down.
  const [forfeitSecondsLeft, setForfeitSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    // Who are we? The board only carries player ids, so we compare against ours.
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setMyId(d.id))
      .catch(() => {});

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
    });

    socket.on("gameStateUpdated", (s: GameState) => {
      setInRoom(true);
      roomRef.current = s.roomId;
      setState(s);
      setStatus("");
    });

    socket.on("gameOver", (d: GameOverPayload) => {
      setForfeitSecondsLeft(null);
      setState((prev) =>
        prev ? { ...prev, board: d.board, isGameOver: true, winnerId: d.winner } : prev
      );
    });

    socket.on("opponentDisconnected", (d: OpponentDisconnectedPayload) => {
      setStatus(d.message);
      setForfeitSecondsLeft(d.secondsLeft);
    });
    socket.on("opponentReconnected", (msg: string) => {
      setStatus(msg);
      setForfeitSecondsLeft(null); // they made it back, stop the clock
    });

    // The opponent walked out. The room reopened around us, so we drop the
    // board and wait for someone new instead of leaving the page.
    socket.on("gameAborted", (msg: string) => {
      setInRoom(true);
      setState(null);
      setStatus(msg);
      setForfeitSecondsLeft(null);
    });

    // --- lobby ---
    socket.on("roomList", (list: RoomSummary[]) => setRooms(list));
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
    if (forfeitSecondsLeft === null || forfeitSecondsLeft <= 0) return;
    const timer = setTimeout(
      () => setForfeitSecondsLeft((s) => (s === null ? null : s - 1)),
      1000
    );
    return () => clearTimeout(timer);
  }, [forfeitSecondsLeft]);

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

  const play = useCallback(
    (column: number) => {
      // Validate on the frontend before sending. Backend validates again.
      if (!canPlay(column)) return;
      socketRef.current?.emit("playerMove", { roomId: roomRef.current, column });
    },
    [canPlay]
  );

  return {
    state, status, connected, isMyTurn, myPlayerNumber, canPlay, play, playAI,
    rooms, createdRoomId, resumeRoomId, roomUnavailable, inRoom, forfeitSecondsLeft,
    getRooms, createRoom, enterRoom, leaveRoom,
    ROWS, COLS,
  };
}
