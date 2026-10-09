/** Every game in the hub. The main menu is built from this list. */
export interface GameDefinition {
  id: string;
  name: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
}

export const games: GameDefinition[] = [
  {
    id: "word-chain",
    name: "Word Chain",
    description: "Change one letter at a time to make a new word. No repeats. Last player standing wins.",
    minPlayers: 2,
    maxPlayers: 6,
  },
];

export function findGame(id: string | undefined): GameDefinition | undefined {
  return games.find((g) => g.id === id);
}
