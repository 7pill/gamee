import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseWordList } from "../../shared/games/doublets/dictionary.js";
import { createGame } from "../../shared/games/doublets/rules.js";
import { DEFAULT_SETTINGS, type DoubletsSettings } from "../../shared/games/doublets/types.js";
import { DoubletsSession } from "./doublets.js";

const WORDS = parseWordList("cold\ncord\ncard\nward\nword\nbold");
const players = [
  { id: "a", name: "Alice" },
  { id: "b", name: "Bob" },
  { id: "c", name: "Cy" },
];

function newSession(settings: Partial<DoubletsSettings> = {}) {
  const onChange = vi.fn();
  const state = createGame(players, { ...DEFAULT_SETTINGS, ...settings }, "cold");
  return { session: new DoubletsSession(state, WORDS, onChange), onChange };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("DoubletsSession", () => {
  it("applies valid moves and reports errors for invalid ones", () => {
    const { session, onChange } = newSession();
    expect(session.handleAction("a", { type: "move", word: "cold" })).toEqual({ ok: false, error: "not-one-letter" });
    expect(session.handleAction("b", { type: "move", word: "cord" })).toEqual({ ok: false, error: "not-your-turn" });
    expect(onChange).not.toHaveBeenCalled();

    expect(session.handleAction("a", { type: "move", word: "cord" })).toEqual({ ok: true });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(session.publicState().history.map((p) => p.word)).toEqual(["cold", "cord"]);
  });

  it("rejects malformed actions", () => {
    const { session } = newSession();
    for (const action of [null, "move", { type: "move" }, { type: "move", word: 42 }, { type: "dance" }]) {
      expect(session.handleAction("a", action)).toEqual({ ok: false, error: "invalid-action" });
    }
    expect(session.handleAction("a", { type: "move", word: "x".repeat(1000) })).toEqual({
      ok: false,
      error: "invalid-action",
    });
  });

  it("knocks out the current player when their turn time runs out", () => {
    const { session, onChange } = newSession({ mode: "timed", turnSeconds: 30 });
    expect(session.publicState().turnDeadline).toBe(Date.now() + 30_000);

    vi.advanceTimersByTime(29_999);
    expect(onChange).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    const state = session.publicState();
    expect(state.players[0]).toMatchObject({ alive: false, out: "timeout" });
    expect(state.players[state.turn].id).toBe("b");
    expect(state.turnDeadline).toBe(Date.now() + 30_000);
  });

  it("restarts the timer after each move", () => {
    const { session } = newSession({ mode: "timed", turnSeconds: 30 });
    vi.advanceTimersByTime(20_000);
    session.handleAction("a", { type: "move", word: "cord" });
    vi.advanceTimersByTime(20_000);
    expect(session.publicState().players.every((p) => p.alive)).toBe(true);
    vi.advanceTimersByTime(10_000);
    expect(session.publicState().players[1]).toMatchObject({ alive: false, out: "timeout" });
  });

  it("keeps the current timer when a different player surrenders", () => {
    const { session } = newSession({ mode: "timed", turnSeconds: 30 });
    vi.advanceTimersByTime(20_000);
    session.handleAction("c", { type: "surrender" });
    vi.advanceTimersByTime(10_000);
    expect(session.publicState().players[0]).toMatchObject({ alive: false, out: "timeout" });
  });

  it("has no timer in unlimited mode", () => {
    const { session, onChange } = newSession({ mode: "unlimited" });
    expect(session.publicState().turnDeadline).toBeNull();
    vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("ends the game when everyone else surrenders or leaves", () => {
    const { session } = newSession();
    expect(session.handleAction("a", { type: "surrender" })).toEqual({ ok: true });
    expect(session.handleAction("a", { type: "surrender" })).toEqual({ ok: false, error: "invalid-action" });
    session.removePlayer("b", "disconnected");
    expect(session.isOver()).toBe(true);
    const state = session.publicState();
    expect(state).toMatchObject({ winnerId: "c", endReason: "disconnect", turnDeadline: null });
    expect(state.players[1].out).toBe("disconnect");
    expect(session.handleAction("c", { type: "move", word: "cord" })).toEqual({
      ok: false,
      error: "game-not-running",
    });
  });

  it("treats leaving as surrender", () => {
    const { session } = newSession();
    session.removePlayer("a", "left");
    expect(session.publicState().players[0].out).toBe("surrender");
  });

  it("stops the timer on dispose", () => {
    const { session, onChange } = newSession({ mode: "timed", turnSeconds: 10 });
    session.dispose();
    vi.advanceTimersByTime(60_000);
    expect(onChange).not.toHaveBeenCalled();
  });
});
