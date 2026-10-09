import path from "node:path";
import { createGameServer } from "./app.js";
import { loadDictionary } from "./dictionary.js";

const PORT = Number(process.env.PORT ?? 3000);

const { httpServer, io, rooms } = createGameServer({
  dictionary: await loadDictionary(process.env.DICT_DIR),
  clientDir: path.resolve("dist/client"),
  maxRooms: Number(process.env.MAX_ROOMS ?? 1000),
  reconnectGraceMs: Number(process.env.RECONNECT_GRACE_SECONDS ?? 60) * 1000,
});

httpServer.listen(PORT, () => {
  console.log(`gamee server listening on http://localhost:${PORT}`);
});

// Docker sends SIGTERM on `docker stop`; close cleanly instead of waiting to be killed.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    rooms.close();
    io.close();
    httpServer.close(() => process.exit(0));
  });
}
