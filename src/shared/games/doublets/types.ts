export const MIN_WORD_LENGTH = 3;
export const MAX_WORD_LENGTH = 6;
export const MIN_TURN_SECONDS = 10;
export const MAX_TURN_SECONDS = 300;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;

/** "timed": lose when your turn timer runs out or you surrender. "unlimited": lose only by surrendering. */
export type GameMode = "timed" | "unlimited";

export interface DoubletsSettings {
  wordLength: number;
  mode: GameMode;
  /** Seconds per turn. Only used in "timed" mode. */
  turnSeconds: number;
}

export const DEFAULT_SETTINGS: DoubletsSettings = {
  wordLength: 4,
  mode: "timed",
  turnSeconds: 30,
};

export type EliminationReason = "timeout" | "surrender" | "disconnect";
/** "stuck": the last word played left no valid moves, so the player who played it wins. */
export type EndReason = EliminationReason | "stuck";

export type { PlayerInfo } from "../../protocol.js";
import type { PlayerInfo } from "../../protocol.js";

export interface PlayerState extends PlayerInfo {
  alive: boolean;
  out: EliminationReason | null;
}

export interface Play {
  word: string;
  /** null for the start word. */
  playerId: string | null;
}

export interface DoubletsState {
  settings: DoubletsSettings;
  players: PlayerState[];
  /** Every word played so far, starting with the start word. The last entry is the current word. */
  history: Play[];
  /** Index into `players` of whose turn it is. */
  turn: number;
  status: "playing" | "over";
  winnerId: string | null;
  endReason: EndReason | null;
}

/** What clients see: the game state plus when the current turn runs out. */
export interface DoubletsView extends DoubletsState {
  /** Server time (ms since epoch) when the current turn ends; null in unlimited mode or after the game. */
  turnDeadline: number | null;
}

export type DoubletsAction = { type: "move"; word: string } | { type: "surrender" };

export type MoveError =
  | "game-over"
  | "not-your-turn"
  | "invalid-characters"
  | "wrong-length"
  | "not-one-letter"
  | "already-used"
  | "not-a-word";

export const MOVE_ERROR_MESSAGES: Record<MoveError, string> = {
  "game-over": "The game is over.",
  "not-your-turn": "It's not your turn.",
  "invalid-characters": "Use letters A–Z only.",
  "wrong-length": "The word must keep the same length.",
  "not-one-letter": "Change exactly one letter.",
  "already-used": "That word has already been played.",
  "not-a-word": "That's not in the dictionary.",
};
