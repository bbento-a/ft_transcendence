import { PlayerNumber } from './game.types';

// A lobby room: the "box" shown in /gamerooms.
// The host creates it and waits; the first person to enter becomes the guest and
// the game starts. Anyone entering after that watches as a spectator.
export interface GameRoom {
  id: string;
  hostId: string;
  hostName: string;
  guestId: string | null;
  guestName: string | null;
  status: RoomStatus;
  // Who has asked to play again since the last game ended. A rematch needs both
  // players, so this is cleared whenever a new game starts.
  rematchVotes: Set<string>;
  // Quem abriu o ultimo jogo desta sala (1 = host, 2 = convidado). A revanche
  // da a primeira jogada ao outro, para a vantagem de abrir nao ficar sempre
  // do mesmo lado. null enquanto nao se jogar nada aqui -- e volta a null com
  // um adversario novo, que recomeca com sorteio.
  lastStarter: PlayerNumber | null;
}

// 'finished' is a room whose game is over but whose players are still sitting in
// it deciding on a rematch. It is not offered in the lobby: there is nothing to
// join and nothing to watch until they agree.
export type RoomStatus = 'waiting' | 'playing' | 'finished';

// What the lobby actually needs. User ids stay on the server: the boxes only
// ever show names, so there is no reason to hand ids to every connected client.
export interface RoomSummary {
  id: string;
  hostName: string;
  guestName: string | null;
  status: RoomStatus;
}

export function toRoomSummary(room: GameRoom): RoomSummary {
  return {
    id: room.id,
    hostName: room.hostName,
    guestName: room.guestName,
    status: room.status,
  };
}
