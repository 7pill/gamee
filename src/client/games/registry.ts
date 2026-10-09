import { MAX_PLAYERS, MIN_PLAYERS } from "../../shared/games/doublets/types";
import { DoubletsBoard } from "./doublets/DoubletsBoard";
import { DoubletsSettingsForm } from "./doublets/DoubletsSettingsForm";
import type { GameDefinition } from "./types";

/** Every game in the hub. The main menu is built from this list. */
export const games: GameDefinition[] = [
  {
    id: "doublets",
    name: "Doublets",
    description: "Change one letter at a time to make a new word. No repeats. Last player standing wins.",
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    SettingsForm: DoubletsSettingsForm,
    Board: DoubletsBoard,
  },
];

export function findGame(id: string | undefined): GameDefinition | undefined {
  return games.find((g) => g.id === id);
}
