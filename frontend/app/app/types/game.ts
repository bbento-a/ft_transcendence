// Mirror of the backend's GameState.
// Source of truth: backend/app/src/game/game.types.ts
// Frontend and backend are separate npm projects and cannot import from each
// other, so this is a hand-copy. Keep it in sync if the backend changes.

// The id the backend gives the bot, in place of a real user id.
export const AI_PLAYER_ID = "AI";

// Niveis do bot. Espelho de DIFFICULTIES no backend (game.types.ts), que
// valida o que recebe — mandar algo fora desta lista so faz cair no default.
export type Difficulty = "easy" | "medium" | "hard";
export const DIFFICULTIES: readonly Difficulty[] = ["easy", "medium", "hard"];

// One square of the board.
// Source of truth: backend/app/src/game/game.types.ts
export interface BoardCell {
  row: number;
  column: number;
}

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
  lastMove: BoardCell | null;        // piece that just dropped; null before move 1
  winningCells: BoardCell[] | null;  // the 4-in-a-row; null unless won on the board
  disconnectedPlayerId?: string | null;
  // Só existe em jogos contra a IA. Escolhida no widget de dificuldade do
  // lobby e enviada em playVsAI com { difficulty }; sem escolha vale o
  // DEFAULT_AI_DIFFICULTY do backend (game.service.ts).
  difficulty?: Difficulty;
}

// Uma mensagem vinda do gateway. O servidor nao sabe em que idioma estamos —
// numa sala podem estar pessoas em idiomas diferentes —, por isso manda a chave
// da traducao (namespace "gameroomBackend") e os valores da frase, e somos nos
// que a traduzimos no useGameSocket.
// Source of truth: backend/app/src/game/game.types.ts
export interface BackendMessage {
  key: string;
  params?: Record<string, string>;
}

export interface MatchFoundPayload {
  room: string;
  message: BackendMessage;
  state: GameState;
}

export interface GameOverPayload {
  winner: string | null;
  board: number[][];
  message: BackendMessage;
}

// An opponent dropped out. They have `secondsLeft` to come back before the
// server hands the win to whoever stayed.
export interface OpponentDisconnectedPayload {
  message: BackendMessage;
  secondsLeft: number;
}

// O mesmo em forma de estado: guarda a CHAVE, nao a frase. Quem traduz e a
// pagina, no momento de mostrar -- guardar aqui texto ja traduzido deixava a
// contagem presa ao idioma que estava escolhido quando o adversario caiu.
export interface ForfeitCountdown {
  message: BackendMessage;
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
