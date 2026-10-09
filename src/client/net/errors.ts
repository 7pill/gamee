import { MOVE_ERROR_MESSAGES } from "../../shared/games/doublets/types";
import { ROOM_ERROR_MESSAGES } from "../../shared/protocol";

// Error codes from the server → text for players. Add each new game's error messages here.
const MESSAGES: Record<string, string> = { ...ROOM_ERROR_MESSAGES, ...MOVE_ERROR_MESSAGES };

export function errorMessage(code: string): string {
  return MESSAGES[code] ?? "Something went wrong. Please try again.";
}

/** Message for a request that failed without an answer (timeout or no connection). */
export const NO_RESPONSE = "Can't reach the server. Check your connection and try again.";
