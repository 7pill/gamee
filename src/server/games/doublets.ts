import type { WordSet } from "../../shared/games/doublets/dictionary.js";
import {
  applyMove,
  createGame,
  currentPlayer,
  eliminatePlayer,
  pickStartWord,
  sanitizeSettings,
} from "../../shared/games/doublets/rules.js";
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  type DoubletsSettings,
  type DoubletsState,
  type DoubletsView,
} from "../../shared/games/doublets/types.js";
import type { Dictionary } from "../dictionary.js";
import type { ActionResult, GameServerDefinition, GameSession, LeaveReason } from "./types.js";

/** Longest input accepted from a client; real words are at most MAX_WORD_LENGTH. */
const MAX_INPUT_LENGTH = 32;

export function createDoubletsGame(
  dictionary: Dictionary,
  random: () => number = Math.random,
): GameServerDefinition<DoubletsSettings> {
  return {
    id: "doublets",
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    sanitizeSettings,
    createSession(players, settings, onChange) {
      const words = dictionary.words.get(settings.wordLength)!;
      const startWord = pickStartWord(dictionary.startWords.get(settings.wordLength)!, random);
      return new DoubletsSession(createGame(players, settings, startWord), words, onChange);
    },
  };
}

export class DoubletsSession implements GameSession {
  private turnDeadline: number | null = null;
  private turnTimer: NodeJS.Timeout | null = null;

  constructor(
    private state: DoubletsState,
    private readonly words: WordSet,
    private readonly onChange: () => void,
  ) {
    this.startTurnTimer();
  }

  handleAction(playerId: string, action: unknown): ActionResult {
    if (this.state.status !== "playing") return { ok: false, error: "game-not-running" };
    const a = (typeof action === "object" && action !== null ? action : {}) as Record<string, unknown>;

    if (a.type === "move" && typeof a.word === "string" && a.word.length <= MAX_INPUT_LENGTH) {
      const result = applyMove(this.state, playerId, a.word, this.words);
      if (!result.ok) return result;
      this.update(result.state);
      return { ok: true };
    }
    if (a.type === "surrender") {
      if (!this.state.players.some((p) => p.id === playerId && p.alive)) return { ok: false, error: "invalid-action" };
      this.update(eliminatePlayer(this.state, playerId, "surrender"));
      return { ok: true };
    }
    return { ok: false, error: "invalid-action" };
  }

  removePlayer(playerId: string, reason: LeaveReason): void {
    this.update(eliminatePlayer(this.state, playerId, reason === "left" ? "surrender" : "disconnect"));
  }

  publicState(): DoubletsView {
    return { ...this.state, turnDeadline: this.turnDeadline };
  }

  isOver(): boolean {
    return this.state.status === "over";
  }

  dispose(): void {
    if (this.turnTimer) clearTimeout(this.turnTimer);
    this.turnTimer = null;
  }

  private update(next: DoubletsState): void {
    if (next === this.state) return;
    const prev = this.state;
    this.state = next;
    // A new turn (someone moved, or the current player was knocked out) gets a fresh timer.
    if (next.turn !== prev.turn || next.history.length !== prev.history.length || next.status !== prev.status) {
      this.startTurnTimer();
    }
    this.onChange();
  }

  private startTurnTimer(): void {
    this.dispose();
    this.turnDeadline = null;
    if (this.state.status !== "playing" || this.state.settings.mode !== "timed") return;

    const ms = this.state.settings.turnSeconds * 1000;
    this.turnDeadline = Date.now() + ms;
    this.turnTimer = setTimeout(() => {
      this.update(eliminatePlayer(this.state, currentPlayer(this.state).id, "timeout"));
    }, ms);
  }
}
