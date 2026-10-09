import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseWordList, type WordSet } from "../shared/games/doublets/dictionary.js";
import { MAX_WORD_LENGTH, MIN_WORD_LENGTH } from "../shared/games/doublets/types.js";

export interface Dictionary {
  /** All valid words, by word length. */
  words: ReadonlyMap<number, WordSet>;
  /** Good start words, by word length. */
  startWords: ReadonlyMap<number, readonly string[]>;
}

/** Loads data/dict/ (built by `npm run dict`) into memory. */
export async function loadDictionary(dir = path.resolve("data/dict")): Promise<Dictionary> {
  const words = new Map<number, WordSet>();
  const startWords = new Map<number, readonly string[]>();
  for (let length = MIN_WORD_LENGTH; length <= MAX_WORD_LENGTH; length++) {
    words.set(length, parseWordList(await readFile(path.join(dir, `words-${length}.txt`), "utf8")));
    startWords.set(length, [...parseWordList(await readFile(path.join(dir, `start-${length}.txt`), "utf8"))]);
  }
  return { words, startWords };
}
