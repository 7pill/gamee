import { createServer } from "node:http";
import path from "node:path";
import express from "express";
import { Server } from "socket.io";
import type { Dictionary } from "./dictionary.js";
import { createDoubletsGame } from "./games/doublets.js";
import { RoomManager, type GameServer, type RoomOptions } from "./rooms.js";

export interface AppOptions extends RoomOptions {
  dictionary: Dictionary;
  /** Folder with the built React app. */
  clientDir: string;
  /** Random source for start words; injectable for tests. */
  random?: () => number;
}

const CLIENT_ID = /^[A-Za-z0-9_-]{16,64}$/;

export function createGameServer(options: AppOptions) {
  const app = express();
  const httpServer = createServer(app);
  const io: GameServer = new Server(httpServer);

  // Every client sends a random id it keeps in localStorage, so a player can reconnect to their seat.
  io.use((socket, next) => {
    const clientId = socket.handshake.auth?.clientId;
    if (typeof clientId !== "string" || !CLIENT_ID.test(clientId)) return next(new Error("invalid client id"));
    socket.data.clientId = clientId;
    next();
  });

  const rooms = new RoomManager(io, [createDoubletsGame(options.dictionary, options.random)], options);
  const wordCounts = Object.fromEntries([...options.dictionary.words].map(([length, words]) => [length, words.size]));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", rooms: rooms.roomCount, words: wordCounts });
  });

  // Serve the built React app; any other path falls back to index.html for client-side routing.
  app.use(express.static(options.clientDir));
  app.get("/{*path}", (_req, res) => {
    res.sendFile(path.join(options.clientDir, "index.html"));
  });

  return { app, httpServer, io, rooms };
}
