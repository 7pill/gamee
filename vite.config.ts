/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const SERVER = "http://localhost:3000";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist/client",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    // In dev, the Vite server forwards API and WebSocket traffic to the Node server.
    proxy: {
      "/health": SERVER,
      "/socket.io": { target: SERVER, ws: true },
    },
  },
  test: {
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
  },
});
