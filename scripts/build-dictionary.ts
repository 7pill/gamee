/**
 * Builds the word lists in data/dict/ from public sources. Run with `npm run dict`.
 * The output is committed, so this only needs re-running to change the word lists.
 *
 *   words-N.txt  every valid N-letter word (what players may play)
 *   start-N.txt  common N-letter words with enough moves to make a good start word
 */
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { neighbors, parseWordList } from "../src/shared/games/word-chain/dictionary.js";
import { MAX_WORD_LENGTH, MIN_WORD_LENGTH } from "../src/shared/games/word-chain/types.js";

const SOURCES = {
  // ENABLE: public-domain word list used by many word games.
  valid: "https://raw.githubusercontent.com/dolph/dictionary/master/enable1.txt",
  // ~10k most common English words (Google Trillion Word Corpus), with and without swear words.
  common: "https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-usa.txt",
  commonClean:
    "https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-usa-no-swears.txt",
};

/** A start word needs at least this many possible first moves. */
const MIN_START_MOVES = 3;

const OUT_DIR = fileURLToPath(new URL("../data/dict/", import.meta.url));

async function download(url: string): Promise<Set<string>> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download ${url}: ${res.status}`);
  return parseWordList(await res.text());
}

async function main() {
  const [valid, common, commonClean] = await Promise.all([
    download(SOURCES.valid),
    download(SOURCES.common),
    download(SOURCES.commonClean),
  ]);
  // Words in the full common list but not the clean one are swear words; keep them out of the game.
  const blocked = new Set([...common].filter((w) => !commonClean.has(w)));

  await mkdir(OUT_DIR, { recursive: true });
  for (let length = MIN_WORD_LENGTH; length <= MAX_WORD_LENGTH; length++) {
    const words = new Set(
      [...valid].filter((w) => w.length === length && /^[a-z]+$/.test(w) && !blocked.has(w)),
    );
    const starts = [...commonClean].filter(
      (w) => words.has(w) && neighbors(w, words).length >= MIN_START_MOVES,
    );
    await writeFile(`${OUT_DIR}words-${length}.txt`, [...words].sort().join("\n") + "\n");
    await writeFile(`${OUT_DIR}start-${length}.txt`, starts.sort().join("\n") + "\n");
    console.log(`${length} letters: ${words.size} valid words, ${starts.length} start words`);
  }
  console.log(`Blocked ${blocked.size} words. Output: ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
