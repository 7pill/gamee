import { createServer } from "node:http";
import path from "node:path";
import express from "express";
import { Server } from "socket.io";
import { loadDictionary } from "./dictionary.js";

const PORT = Number(process.env.PORT ?? 3000);
const CLIENT_DIR = path.resolve("dist/client");

const dictionary = await loadDictionary(process.env.DICT_DIR);
const wordCounts = Object.fromEntries([...dictionary.words].map(([length, words]) => [length, words.size]));

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", words: wordCounts });
});

// Serve the built React app; any other path falls back to index.html for client-side routing.
app.use(express.static(CLIENT_DIR));
app.get("/{*path}", (_req, res) => {
  res.sendFile(path.join(CLIENT_DIR, "index.html"));
});

io.on("connection", (socket) => {
  // Rooms and game events are added in milestones 4–5.
  console.log(`socket connected: ${socket.id}`);
});

httpServer.listen(PORT, () => {
  console.log(`Word Games server listening on http://localhost:${PORT}`);
});

// Docker sends SIGTERM on `docker stop`; close cleanly instead of waiting to be killed.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    io.close();
    httpServer.close(() => process.exit(0));
  });
}
