import type { PlayerInfo } from "../../shared/protocol.js";

export type ActionResult = { ok: true } | { ok: false; error: string };

/** Why a player is leaving a running game. */
export type LeaveReason = "left" | "disconnected";

/** One running game. The room manager handles players and sockets; the session handles the rules. */
export interface GameSession {
  /** Applies an untrusted action from a player. */
  handleAction(playerId: string, action: unknown): ActionResult;
  /** The player left or stayed disconnected too long. */
  removePlayer(playerId: string, reason: LeaveReason): void;
  /** State sent to every client in the room. */
  publicState(): unknown;
  isOver(): boolean;
  /** Stops timers. Called when the session is replaced or the room closes. */
  dispose(): void;
}

/** Server side of a game. Register one per game in the room manager. */
export interface GameServerDefinition<Settings = unknown> {
  id: string;
  minPlayers: number;
  maxPlayers: number;
  /** Turns untrusted settings from the host into valid settings. */
  sanitizeSettings(input: unknown): Settings;
  /** `onChange` must be called whenever the session's state changes on its own (e.g. a timer). */
  createSession(players: PlayerInfo[], settings: Settings, onChange: () => void): GameSession;
}
