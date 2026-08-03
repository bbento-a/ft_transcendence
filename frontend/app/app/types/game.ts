// Mirror of the backend's GameState.
// Source of truth: backend/app/src/game/game.types.ts
// Frontend and backend are separate npm projects and cannot import from each
// other, so this is a hand-copy. Keep it in sync if the backend changes.

// The id the backend gives the bot, in place of a real user id.
export const AI_PLAYER_ID = "AI";

export interface GameState {
  roomId: string;
  board: number[][];      // 6 rows x 7 cols. 0 = empty, 1 = player1 (red), 2 = player2 (yellow)
  player1Id: string;
  player1Name: string;    // shown on the left side of the board
  player2Id: string;      // 'AI' when playing the bot
  player2Name: string;    // 'Bot' when playing the bot
  currentPlayer: number;  // 1 or 2 — whose turn it is
  isGameOver: boolean;
  winnerId: string | null;
  disconnectedPlayerId?: string | null;
  // Só existe em jogos contra a IA. Por agora quem decide é a constante
  // DEFAULT_AI_DIFFICULTY no backend (game.service.ts); quando houver ecrã de
  // escolha, basta emitir playVsAI com { difficulty }.
  difficulty?: "easy" | "medium" | "hard";
}

export interface MatchFoundPayload {
  room: string;
  message: string;
  state: GameState;
}

export interface GameOverPayload {
  winner: string | null;
  board: number[][];
  message: string;
}

// An opponent dropped out. They have `secondsLeft` to come back before the
// server hands the win to whoever stayed.
export interface OpponentDisconnectedPayload {
  message: string;
  secondsLeft: number;
}

// One box in the lobby. Mirror of the backend's RoomSummary.
// Source of truth: backend/app/src/game/game.room.ts
export interface RoomSummary {
  id: string;
  hostName: string;        // shown on the left of the box
  guestName: string | null; // right side; null while the room waits
  status: "waiting" | "playing";
}
