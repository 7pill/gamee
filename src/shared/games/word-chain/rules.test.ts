import { describe, expect, it } from "vitest";
import { neighbors, parseWordList } from "./dictionary.js";
import {
  applyMove,
  availableMoves,
  countDifferences,
  createGame,
  currentPlayer,
  currentWord,
  eliminatePlayer,
  pickStartWord,
  sanitizeSettings,
  validateMove,
} from "./rules.js";
import { DEFAULT_SETTINGS, type WordChainState } from "./types.js";

const WORDS = parseWordList(["cold", "cord", "card", "ward", "word", "wore", "core", "bold", "bolt", "zzzz"].join("\n"));
const settings = { ...DEFAULT_SETTINGS, wordLength: 4 };
const players = [
  { id: "a", name: "Alice" },
  { id: "b", name: "Bob" },
  { id: "c", name: "Cy" },
];

function newGame(startWord = "cold", ps = players): WordChainState {
  return createGame(ps, settings, startWord);
}

function play(state: WordChainState, playerId: string, word: string): WordChainState {
  const result = applyMove(state, playerId, word, WORDS);
  if (!result.ok) throw new Error(`Expected ${word} to be valid, got ${result.error}`);
  return result.state;
}

describe("dictionary", () => {
  it("parses word lists, ignoring blanks and case", () => {
    expect(parseWordList("Cold\n\n cord \r\nCARD")).toEqual(new Set(["cold", "cord", "card"]));
  });

  it("finds one-letter neighbours in the same position", () => {
    expect(neighbors("cold", WORDS).sort()).toEqual(["bold", "cord"]);
    expect(neighbors("zzzz", WORDS)).toEqual([]);
  });
});

describe("countDifferences", () => {
  it("counts differing positions", () => {
    expect(countDifferences("cold", "cold")).toBe(0);
    expect(countDifferences("cold", "cord")).toBe(1);
    expect(countDifferences("cold", "clod")).toBe(2);
  });
});

describe("sanitizeSettings", () => {
  it("falls back to defaults for junk input", () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings({ wordLength: "5", mode: "chaos", turnSeconds: NaN })).toEqual(DEFAULT_SETTINGS);
  });

  it("clamps and rounds numbers", () => {
    expect(sanitizeSettings({ wordLength: 99, mode: "unlimited", turnSeconds: 1 })).toEqual({
      wordLength: 6,
      mode: "unlimited",
      turnSeconds: 10,
    });
    expect(sanitizeSettings({ wordLength: 4.6, turnSeconds: 45.2 })).toMatchObject({ wordLength: 5, turnSeconds: 45 });
  });
});

describe("createGame", () => {
  it("starts with the start word and the first player's turn", () => {
    const state = newGame();
    expect(currentWord(state)).toBe("cold");
    expect(currentPlayer(state).id).toBe("a");
    expect(state.status).toBe("playing");
  });

  it("rejects bad player counts and mismatched start words", () => {
    expect(() => createGame([players[0]], settings, "cold")).toThrow();
    expect(() => createGame(players, settings, "cat")).toThrow();
  });

  it("picks start words using the given random source", () => {
    expect(pickStartWord(["aaa", "bbb", "ccc"], () => 0.5)).toBe("bbb");
    expect(() => pickStartWord([])).toThrow();
  });
});

describe("validateMove", () => {
  const state = newGame();

  it.each([
    ["b", "cord", "not-your-turn"],
    ["a", "c0rd", "invalid-characters"],
    ["a", "cords", "wrong-length"],
    ["a", "card", "not-one-letter"],
    ["a", "cold", "not-one-letter"],
    ["a", "cola", "not-a-word"],
  ] as const)("player %s playing %s → %s", (playerId, word, error) => {
    expect(validateMove(state, playerId, word, WORDS)).toEqual({ ok: false, error });
  });

  it("accepts valid words, ignoring case and whitespace", () => {
    expect(validateMove(state, "a", "  CORD ", WORDS)).toEqual({ ok: true, word: "cord" });
  });

  it("rejects words already played", () => {
    const s = play(play(newGame(), "a", "cord"), "b", "card");
    expect(validateMove(s, "c", "cord", WORDS)).toEqual({ ok: false, error: "already-used" });
  });
});

describe("applyMove", () => {
  it("records the play and passes the turn", () => {
    const s = play(newGame(), "a", "cord");
    expect(currentWord(s)).toBe("cord");
    expect(s.history).toEqual([
      { word: "cold", playerId: null },
      { word: "cord", playerId: "a" },
    ]);
    expect(currentPlayer(s).id).toBe("b");
  });

  it("does not mutate the previous state", () => {
    const before = newGame();
    play(before, "a", "cord");
    expect(before.history).toHaveLength(1);
    expect(before.turn).toBe(0);
  });

  it("wraps the turn back to the first player", () => {
    const s = play(play(play(newGame(), "a", "cord"), "b", "card"), "c", "ward");
    expect(currentPlayer(s).id).toBe("a");
  });

  it("lists available moves, excluding used words", () => {
    const s = play(newGame(), "a", "cord");
    expect(availableMoves(s, WORDS).sort()).toEqual(["card", "core", "word"]);
  });

  it("ends the game when the played word leaves no moves; the mover wins", () => {
    // bold → bolt: bolt's only neighbour is bold, which is used.
    const s = play(newGame("bold"), "a", "bolt");
    expect(s.status).toBe("over");
    expect(s.winnerId).toBe("a");
    expect(s.endReason).toBe("stuck");
    expect(validateMove(s, "b", "bold", WORDS)).toEqual({ ok: false, error: "game-over" });
  });
});

describe("eliminatePlayer", () => {
  it("passes the turn when the current player surrenders", () => {
    const s = eliminatePlayer(newGame(), "a", "surrender");
    expect(s.players[0]).toMatchObject({ alive: false, out: "surrender" });
    expect(currentPlayer(s).id).toBe("b");
    expect(s.status).toBe("playing");
  });

  it("keeps the turn when someone else is knocked out", () => {
    const s = eliminatePlayer(newGame(), "b", "disconnect");
    expect(currentPlayer(s).id).toBe("a");
  });

  it("skips eliminated players when passing the turn", () => {
    const s = play(eliminatePlayer(newGame(), "b", "surrender"), "a", "cord");
    expect(currentPlayer(s).id).toBe("c");
  });

  it("ends the game when one player is left", () => {
    const s = eliminatePlayer(eliminatePlayer(newGame(), "a", "timeout"), "c", "surrender");
    expect(s.status).toBe("over");
    expect(s.winnerId).toBe("b");
    expect(s.endReason).toBe("surrender");
  });

  it("ignores unknown, already-out players and finished games", () => {
    const s = eliminatePlayer(newGame(), "a", "timeout");
    expect(eliminatePlayer(s, "a", "surrender")).toBe(s);
    expect(eliminatePlayer(s, "nobody", "surrender")).toBe(s);
    const over = eliminatePlayer(s, "b", "timeout");
    expect(eliminatePlayer(over, "c", "timeout")).toBe(over);
  });
});
