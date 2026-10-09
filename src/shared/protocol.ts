// Socket.IO messages between client and server. Game-specific payloads (settings, game state,
// actions) are `unknown` here; each game defines their real types in src/shared/games/<id>/.

export const MAX_NICKNAME_LENGTH = 20;
export const ROOM_CODE_LENGTH = 5;

export interface PlayerInfo {
  id: string;
  name: string;
}

export interface RoomPlayerView {
  id: string;
  name: string;
  connected: boolean;
}

export interface RoomView {
  code: string;
  gameId: string;
  hostId: string;
  players: RoomPlayerView[];
  settings: unknown;
  /** "playing" while a game runs; back to "lobby" when it ends (the finished game stays in `game`). */
  status: "lobby" | "playing";
  /** Increases by one every time a game starts. */
  round: number;
  /** Public state of the current or last game, or null before the first game. */
  game: unknown;
  /** Server clock (ms since epoch) when this was sent, so clients can correct countdowns. */
  serverTime: number;
}

export type Ack<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export interface ClientToServerEvents {
  "room:create": (
    payload: { gameId: string; nickname: string },
    ack: (res: Ack<{ roomCode: string; playerId: string }>) => void,
  ) => void;
  /** Joins a room, or rejoins it after a reconnect (players are recognised by their client id). */
  "room:join": (payload: { roomCode: string; nickname: string }, ack: (res: Ack<{ playerId: string }>) => void) => void;
  "room:leave": () => void;
  "room:settings": (settings: unknown) => void;
  "game:start": (ack: (res: Ack) => void) => void;
  "game:action": (action: unknown, ack: (res: Ack) => void) => void;
}

export interface ServerToClientEvents {
  "room:state": (room: RoomView) => void;
}

export interface SocketData {
  /** Secret per-browser id sent in the handshake; used to recognise a player who reconnects. */
  clientId: string;
}

export type RoomError =
  | "invalid-nickname"
  | "unknown-game"
  | "too-many-rooms"
  | "room-not-found"
  | "room-full"
  | "game-in-progress"
  | "not-in-room"
  | "not-host"
  | "not-enough-players"
  | "game-not-running"
  | "invalid-action";

export const ROOM_ERROR_MESSAGES: Record<RoomError, string> = {
  "invalid-nickname": `Pick a nickname (1–${MAX_NICKNAME_LENGTH} characters).`,
  "unknown-game": "That game doesn't exist.",
  "too-many-rooms": "The server is full right now. Try again later.",
  "room-not-found": "Room not found. Check the code.",
  "room-full": "That room is full.",
  "game-in-progress": "A game is already running in that room. Wait for it to finish.",
  "not-in-room": "You're not in this room.",
  "not-host": "Only the host can do that.",
  "not-enough-players": "Not enough players to start.",
  "game-not-running": "No game is running.",
  "invalid-action": "That action isn't allowed.",
};

export function normalizeNickname(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const name = input.trim().replace(/\s+/g, " ");
  return name.length >= 1 && name.length <= MAX_NICKNAME_LENGTH ? name : null;
}

export function normalizeRoomCode(input: string): string {
  return input.trim().toUpperCase();
}
