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
}

export type RoomStatus = 'waiting' | 'playing';

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
