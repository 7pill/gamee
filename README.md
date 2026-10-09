# gamee

An online hub of multiplayer word games. The first game is **Doublets**, after Lewis Carroll's word puzzle: starting from a random word, players take turns changing one letter to make a new word, and words can't be repeated.

Stack: TypeScript everywhere. React + Vite for the client, Node + Express + Socket.IO for the server. Everything ships as one Docker image.

## Run with Docker

```sh
docker compose up --build        # http://localhost:3000
HOST_PORT=8080 docker compose up # use a different port
```

Or without compose:

```sh
docker build -t gamee .
docker run -p 3000:3000 gamee
```

`GET /health` returns `{"status":"ok", ...}` with the number of open rooms and dictionary words loaded.

Environment variables:

| Variable | Default | |
|---|---|---|
| `PORT` | `3000` | Port the server listens on |
| `MAX_ROOMS` | `1000` | Rooms open at once; more are refused |
| `RECONNECT_GRACE_SECONDS` | `60` | How long a disconnected player keeps their seat |

Rooms live in server memory, so run **one** container. Restarting it ends all running games.

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

## Doublets rules

- A move changes exactly one letter, in place (`cold → cord`, not `cold → clod`).
- The new word must be in the dictionary, have the same length, and not have been played this game.
- **Timed mode:** if your turn timer runs out, you're out. The host sets the time per turn.
- **Unlimited mode:** no timer. You're out only when you surrender.
- In both modes, surrendering (🏳️) or staying disconnected too long knocks you out. The last player left wins.
- If a word leaves no valid moves, the player who played it wins immediately.

## How online play works

- Players pick a nickname, then create a room (gets a 5-letter code and invite link) or join one by code.
- The host picks the settings and starts the game. Only players online at that moment take part.
- The server checks every move and runs the turn timers; clients only send what the player tries to do.
- Each browser keeps a random id in localStorage. After a refresh or a dropped connection, the player gets their seat back. If they stay away longer than the grace period, they're out.

## Adding a game

1. Rules: `src/shared/games/<id>/`, pure functions with tests.
2. Server: a `GameServerDefinition` in `src/server/games/<id>.ts` (see `src/server/games/types.ts`), registered in `src/server/app.ts`.
3. Client: a settings form and a board component in `src/client/games/<id>/`, registered in `src/client/games/registry.ts`. The menu, rooms, lobby and reconnecting work automatically.

## Word list sources

- Valid words: [ENABLE](https://github.com/dolph/dictionary) (public domain).
- Start words and swear-word filter: [google-10000-english](https://github.com/first20hours/google-10000-english).
