import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "../../shared/protocol";
import { getClientId } from "./identity";

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** One connection for the whole app. Socket.IO reconnects automatically when it drops. */
export const socket: GameSocket = io({ auth: { clientId: getClientId() } });

/** How long to wait for the server to answer a request. */
export const REQUEST_TIMEOUT_MS = 8000;
