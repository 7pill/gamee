import { neighbors, type WordSet } from "./dictionary.js";
import {
  DEFAULT_SETTINGS,
  MAX_PLAYERS,
  MAX_TURN_SECONDS,
  MAX_WORD_LENGTH,
  MIN_PLAYERS,
  MIN_TURN_SECONDS,
  MIN_WORD_LENGTH,
  type EliminationReason,
  type MoveError,
  type PlayerInfo,
  type PlayerState,
  type WordChainSettings,
  type WordChainState,
} from "./types.js";

// All functions here are pure: they never mutate their input and return new state.

export function normalizeWord(input: string): string {
  return input.trim().toLowerCase();
}

/** Number of positions where two equal-length words differ. */
export function countDifferences(a: string, b: string): number {
  let diff = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff++;
  return diff;
}

/** Turns untrusted input (e.g. from a client) into valid settings, falling back to defaults. */
export function sanitizeSettings(input: unknown): WordChainSettings {
  const raw = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  return {
    wordLength: clampInt(raw.wordLength, MIN_WORD_LENGTH, MAX_WORD_LENGTH, DEFAULT_SETTINGS.wordLength),
    mode: raw.mode === "timed" || raw.mode === "unlimited" ? raw.mode : DEFAULT_SETTINGS.mode,
    turnSeconds: clampInt(raw.turnSeconds, MIN_TURN_SECONDS, MAX_TURN_SECONDS, DEFAULT_SETTINGS.turnSeconds),
  };
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function pickStartWord(startWords: readonly string[], random: () => number = Math.random): string {
  if (startWords.length === 0) throw new Error("No start words available");
  return startWords[Math.floor(random() * startWords.length)];
}

export function createGame(
  players: readonly PlayerInfo[],
  settings: WordChainSettings,
  startWord: string,
): WordChainState {
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
    throw new Error(`A game needs ${MIN_PLAYERS}-${MAX_PLAYERS} players`);
  }
  if (startWord.length !== settings.wordLength) {
    throw new Error(`Start word "${startWord}" does not match word length ${settings.wordLength}`);
  }
  return {
    settings,
    players: players.map((p) => ({ id: p.id, name: p.name, alive: true, out: null })),
    history: [{ word: normalizeWord(startWord), playerId: null }],
    turn: 0,
    status: "playing",
    winnerId: null,
    endReason: null,
  };
}

export function currentWord(state: WordChainState): string {
  return state.history[state.history.length - 1].word;
}

export function currentPlayer(state: WordChainState): PlayerState {
  return state.players[state.turn];
}

export function usedWords(state: WordChainState): Set<string> {
  return new Set(state.history.map((p) => p.word));
}

/** Valid words the current player could play right now. */
export function availableMoves(state: WordChainState, words: WordSet): string[] {
  const used = usedWords(state);
  return neighbors(currentWord(state), words).filter((w) => !used.has(w));
}

export type MoveCheck = { ok: true; word: string } | { ok: false; error: MoveError };

export function validateMove(
  state: WordChainState,
  playerId: string,
  input: string,
  words: WordSet,
): MoveCheck {
  if (state.status !== "playing") return { ok: false, error: "game-over" };
  if (currentPlayer(state).id !== playerId) return { ok: false, error: "not-your-turn" };

  const word = normalizeWord(input);
  if (!/^[a-z]+$/.test(word)) return { ok: false, error: "invalid-characters" };
  if (word.length !== state.settings.wordLength) return { ok: false, error: "wrong-length" };
  if (countDifferences(word, currentWord(state)) !== 1) return { ok: false, error: "not-one-letter" };
  if (usedWords(state).has(word)) return { ok: false, error: "already-used" };
  if (!words.has(word)) return { ok: false, error: "not-a-word" };
  return { ok: true, word };
}

export type MoveResult = { ok: true; state: WordChainState } | { ok: false; error: MoveError };

/**
 * Plays a word for the current player. If the new word leaves no valid moves,
 * the game ends and the player who played it wins ("stuck").
 */
export function applyMove(
  state: WordChainState,
  playerId: string,
  input: string,
  words: WordSet,
): MoveResult {
  const check = validateMove(state, playerId, input, words);
  if (!check.ok) return check;

  const next: WordChainState = {
    ...state,
    history: [...state.history, { word: check.word, playerId }],
    turn: nextAliveIndex(state.players, state.turn),
  };
  if (availableMoves(next, words).length === 0) {
    return { ok: true, state: { ...next, status: "over", winnerId: playerId, endReason: "stuck" } };
  }
  return { ok: true, state: next };
}

/**
 * Knocks a player out (timeout, surrender or disconnect). If it was their turn, play passes on.
 * When only one player is left, they win.
 */
export function eliminatePlayer(
  state: WordChainState,
  playerId: string,
  reason: EliminationReason,
): WordChainState {
  if (state.status !== "playing") return state;
  const index = state.players.findIndex((p) => p.id === playerId);
  if (index === -1 || !state.players[index].alive) return state;

  const players = state.players.map((p, i) => (i === index ? { ...p, alive: false, out: reason } : p));
  const alive = players.filter((p) => p.alive);
  if (alive.length <= 1) {
    return { ...state, players, status: "over", winnerId: alive[0]?.id ?? null, endReason: reason };
  }
  const turn = index === state.turn ? nextAliveIndex(players, state.turn) : state.turn;
  return { ...state, players, turn };
}

/** Index of the next alive player after `from`, wrapping around. */
function nextAliveIndex(players: readonly PlayerState[], from: number): number {
  for (let step = 1; step <= players.length; step++) {
    const i = (from + step) % players.length;
    if (players[i].alive) return i;
  }
  return from;
}
