# Word Games

An online hub of multiplayer word games. The first game is **Word Chain**: starting from a random word, players take turns changing one letter to make a new word, and words can't be repeated.

Stack: TypeScript everywhere. React + Vite for the client, Node + Express + Socket.IO for the server. Everything ships as one Docker image.

## Run with Docker

```sh
docker compose up --build        # http://localhost:3000
HOST_PORT=8080 docker compose up # use a different port
```

Or without compose:

```sh
docker build -t word-games .
docker run -p 3000:3000 word-games
```

`GET /health` returns `{"status":"ok", ...}` with the number of dictionary words loaded.

## Develop

Needs Node 20.19+.

```sh
npm install
npm run dev        # server on :3000 + Vite on http://localhost:5173 (proxies to the server)
npm test           # unit tests (Vitest)
npm run typecheck
npm run build      # → dist/client (static files) + dist/server (Node)
npm start          # run the production build
```

## Layout

```
src/shared/   code used by both client and server (game rules, types)
src/server/   Express + Socket.IO server; the server decides all game outcomes
src/client/   React app (menu, lobby, game screens)
data/dict/    word lists (generated, committed)
scripts/      build-dictionary.ts → `npm run dict` regenerates data/dict/
```

## Word Chain rules

- A move changes exactly one letter, in place (`cold → cord`, not `cold → clod`).
- The new word must be in the dictionary, have the same length, and not have been played this game.
- **Timed mode:** if your turn timer runs out, you're out. The host sets the time per turn.
- **Unlimited mode:** no timer. You're out only when you surrender.
- In both modes, surrendering (🏳️) or staying disconnected too long knocks you out. The last player left wins.
- If a word leaves no valid moves, the player who played it wins immediately.

## Adding a game

1. Put the game's rules in `src/shared/games/<id>/` as pure functions with tests.
2. Add an entry to `src/client/games/registry.ts`. The menu picks it up automatically.
3. Add the game's server room and client screens (coming with the rooms milestone).

## Word list sources

- Valid words: [ENABLE](https://github.com/dolph/dictionary) (public domain).
- Start words and swear-word filter: [google-10000-english](https://github.com/first20hours/google-10000-english).
