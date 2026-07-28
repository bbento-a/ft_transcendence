"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import type { GameState, MatchFoundPayload, GameOverPayload } from "../types/game";

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

    socket.on("statusWait", (msg: string) => setStatus(msg));
    socket.on("warning", (msg: string) => setStatus(msg));

    socket.on("MatchFound", (d: MatchFoundPayload) => {
      roomRef.current = d.room;
      setState(d.state);
      setStatus("");
    });

    socket.on("gameStateUpdated", (s: GameState) => {
      roomRef.current = s.roomId;
      setState(s);
      setStatus("");
    });

    socket.on("gameOver", (d: GameOverPayload) => {
      setState((prev) =>
        prev ? { ...prev, board: d.board, isGameOver: true, winnerId: d.winner } : prev
      );
    });

    socket.on("opponentDisconnected", (msg: string) => setStatus(msg));
    socket.on("opponentReconnected", (msg: string) => setStatus(msg));

    // Cleanup: React dev mode mounts twice; without this we leak sockets and
    // leave phantom players in the gateway's waitlist.
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

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
  const findMatch = useCallback(() => socketRef.current?.emit("LookforMatch"), []);
  const spectate = useCallback(
    (roomId: string) => socketRef.current?.emit("joinSpectator", roomId),
    []
  );

  const play = useCallback(
    (column: number) => {
      // Validate on the frontend before sending. Backend validates again.
      if (!canPlay(column)) return;
      socketRef.current?.emit("playerMove", { roomId: roomRef.current, column });
    },
    [canPlay]
  );

  return {
    state, status, connected, isMyTurn, myPlayerNumber,
    playAI, findMatch, play, spectate, canPlay,
    ROWS, COLS,
  };
}
