export type WordSet = ReadonlySet<string>;

const ALPHABET = "abcdefghijklmnopqrstuvwxyz";

/** Parses a newline-separated word list into a set of lowercase words. */
export function parseWordList(text: string): Set<string> {
  const words = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const word = line.trim().toLowerCase();
    if (word) words.add(word);
  }
  return words;
}

/** All words in `words` that differ from `word` by exactly one letter in the same position. */
export function neighbors(word: string, words: WordSet): string[] {
  const result: string[] = [];
  for (let i = 0; i < word.length; i++) {
    for (const letter of ALPHABET) {
      if (letter === word[i]) continue;
      const candidate = word.slice(0, i) + letter + word.slice(i + 1);
      if (words.has(candidate)) result.push(candidate);
    }
  }
  return result;
}
