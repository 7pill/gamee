// Per-browser values kept in localStorage. Storage can be unavailable (private mode, blocked
// cookies), so every access is guarded and falls back to in-memory values.

const CLIENT_ID_KEY = "gamee:clientId";
const NICKNAME_KEY = "gamee:nickname";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not persisted; fine for this page load.
  }
}

let clientId: string | null = null;

/** Secret random id that lets the server recognise this browser when it reconnects. */
export function getClientId(): string {
  clientId ??= read(CLIENT_ID_KEY);
  if (!clientId || !/^[A-Za-z0-9_-]{16,64}$/.test(clientId)) {
    // crypto.getRandomValues works on plain http too (randomUUID needs https).
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    clientId = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    write(CLIENT_ID_KEY, clientId);
  }
  return clientId;
}

export function getNickname(): string {
  return read(NICKNAME_KEY) ?? "";
}

export function saveNickname(nickname: string): void {
  write(NICKNAME_KEY, nickname);
}
