// Mirror of the backend's GameState.
// Source of truth: backend/app/src/game/game.types.ts
// Frontend and backend are separate npm projects and cannot import from each
// other, so this is a hand-copy. Keep it in sync if the backend changes.

export interface GameState {
  roomId: string;
  board: number[][];      // 6 rows x 7 cols. 0 = empty, 1 = player1 (red), 2 = player2 (yellow)
  player1Id: string;
  player2Id: string;      // 'AI' when playing the bot
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
