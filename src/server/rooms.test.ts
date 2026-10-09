import type { AddressInfo } from "node:net";
import { io as connect, type Socket } from "socket.io-client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseWordList } from "../shared/games/doublets/dictionary.js";
import type { DoubletsView } from "../shared/games/doublets/types.js";
import type { Ack, ClientToServerEvents, RoomView, ServerToClientEvents } from "../shared/protocol.js";
import { createGameServer } from "./app.js";
import type { Dictionary } from "./dictionary.js";

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const words4 = parseWordList("cold\ncord\ncard\nward\nword\nbold");
const dictionary: Dictionary = {
  words: new Map([[4, words4]]),
  startWords: new Map([[4, ["cold"]]]),
};

const GRACE_MS = 150;
let server: ReturnType<typeof createGameServer>;
let url: string;
const sockets: ClientSocket[] = [];

beforeEach(async () => {
  server = createGameServer({ dictionary, clientDir: "/nonexistent", maxRooms: 2, reconnectGraceMs: GRACE_MS });
  await new Promise<void>((resolve) => server.httpServer.listen(0, resolve));
  url = `http://localhost:${(server.httpServer.address() as AddressInfo).port}`;
});

afterEach(async () => {
  for (const s of sockets.splice(0)) s.disconnect();
  server.rooms.close();
  await new Promise((resolve) => server.io.close(resolve));
});

let nextId = 0;
/** A browser: `clientId` stays the same across reconnects, like the id kept in localStorage. */
async function client(clientId = `client-${String(nextId++).padStart(12, "0")}`) {
  const socket: ClientSocket = connect(url, { auth: { clientId }, transports: ["websocket"], forceNew: true });
  sockets.push(socket);
  const states: RoomView[] = [];
  socket.on("room:state", (room) => states.push(room));
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("connect_error", reject);
  });
  return {
    socket,
    clientId,
    latest: () => states[states.length - 1],
    game: () => states[states.length - 1].game as DoubletsView,
    create: (nickname: string) =>
      socket.emitWithAck("room:create", { gameId: "doublets", nickname }) as Promise<
        Ack<{ roomCode: string; playerId: string }>
      >,
    join: (roomCode: string, nickname: string) =>
      socket.emitWithAck("room:join", { roomCode, nickname }) as Promise<Ack<{ playerId: string }>>,
    start: () => socket.emitWithAck("game:start") as Promise<Ack>,
    act: (action: unknown) => socket.emitWithAck("game:action", action) as Promise<Ack>,
  };
}

/** Waits for in-flight broadcasts to arrive. */
const settle = (ms = 50) => new Promise((resolve) => setTimeout(resolve, ms));

async function roomWithTwo() {
  const alice = await client();
  const created = await alice.create("Alice");
  if (!created.ok) throw new Error(created.error);
  const bob = await client();
  const joined = await bob.join(created.roomCode.toLowerCase(), "Bob");
  if (!joined.ok) throw new Error(joined.error);
  await settle();
  return { alice, bob, code: created.roomCode, aliceId: created.playerId, bobId: joined.playerId };
}

describe("rooms", () => {
  it("rejects clients without a valid client id", async () => {
    const socket: ClientSocket = connect(url, { auth: { clientId: "x" }, transports: ["websocket"], forceNew: true });
    sockets.push(socket);
    const err = await new Promise<Error>((resolve) => socket.once("connect_error", resolve));
    expect(err.message).toBe("invalid client id");
  });

  it("creates and joins rooms by code (case-insensitive)", async () => {
    const { alice, bob, code, aliceId, bobId } = await roomWithTwo();
    expect(code).toMatch(/^[A-HJKMNP-Z]{5}$/);
    for (const c of [alice, bob]) {
      expect(c.latest()).toMatchObject({ code, hostId: aliceId, status: "lobby", round: 0, game: null });
      expect(c.latest().players).toEqual([
        { id: aliceId, name: "Alice", connected: true },
        { id: bobId, name: "Bob", connected: true },
      ]);
    }
    // Client ids are secret and must never be broadcast.
    expect(JSON.stringify(bob.latest())).not.toContain(alice.clientId);
  });

  it("validates create and join", async () => {
    const c = await client();
    expect(await c.create("   ")).toEqual({ ok: false, error: "invalid-nickname" });
    expect(await c.socket.emitWithAck("room:create", { gameId: "chess", nickname: "Al" })).toEqual({
      ok: false,
      error: "unknown-game",
    });
    expect(await c.join("ZZZZZ", "Al")).toEqual({ ok: false, error: "room-not-found" });

    await (await client()).create("A");
    await (await client()).create("B");
    expect(await c.create("C")).toEqual({ ok: false, error: "too-many-rooms" });
  });

  it("only lets the host change settings and start, and sanitizes settings", async () => {
    const { alice, bob } = await roomWithTwo();
    bob.socket.emit("room:settings", { wordLength: 5, mode: "unlimited" });
    await settle();
    expect(alice.latest().settings).toMatchObject({ wordLength: 4, mode: "timed" });
    expect(await bob.start()).toEqual({ ok: false, error: "not-host" });

    alice.socket.emit("room:settings", { wordLength: 4, mode: "unlimited", turnSeconds: 99999 });
    await settle();
    expect(bob.latest().settings).toEqual({ wordLength: 4, mode: "unlimited", turnSeconds: 300 });
  });

  it("needs two connected players to start", async () => {
    const alice = await client();
    await alice.create("Alice");
    expect(await alice.start()).toEqual({ ok: false, error: "not-enough-players" });
  });

  it("plays a full game: moves, errors, surrender, rematch", async () => {
    const { alice, bob, aliceId, bobId } = await roomWithTwo();
    expect(await alice.start()).toEqual({ ok: true });
    await settle();
    expect(bob.latest()).toMatchObject({ status: "playing", round: 1 });
    expect(bob.game().history).toEqual([{ word: "cold", playerId: null }]);
    expect(bob.game().turnDeadline).toBeGreaterThan(Date.now());

    expect(await bob.act({ type: "move", word: "cord" })).toEqual({ ok: false, error: "not-your-turn" });
    expect(await alice.act({ type: "move", word: "colt" })).toEqual({ ok: false, error: "not-a-word" });
    expect(await alice.act({ type: "move", word: "CORD" })).toEqual({ ok: true });
    await settle();
    expect(bob.game().history.map((p) => p.word)).toEqual(["cold", "cord"]);
    expect(bob.game().players[bob.game().turn].id).toBe(bobId);

    // A new player can't join mid-game.
    expect(await (await client()).join(alice.latest().code, "Late")).toEqual({ ok: false, error: "game-in-progress" });

    expect(await bob.act({ type: "surrender" })).toEqual({ ok: true });
    await settle();
    expect(alice.latest().status).toBe("lobby");
    expect(alice.game()).toMatchObject({ status: "over", winnerId: aliceId, endReason: "surrender" });

    expect(await alice.start()).toEqual({ ok: true });
    await settle();
    expect(bob.latest()).toMatchObject({ status: "playing", round: 2 });
    expect(bob.game().history).toHaveLength(1);
  });

  it("lets a player reconnect to their seat mid-game", async () => {
    const { alice, bob, code, bobId } = await roomWithTwo();
    await alice.start();
    bob.socket.disconnect();
    await settle();
    expect(alice.latest().players.find((p) => p.id === bobId)?.connected).toBe(false);

    const bobAgain = await client(bob.clientId);
    expect(await bobAgain.join(code, "ignored")).toEqual({ ok: true, playerId: bobId });
    await settle(GRACE_MS + 50);
    expect(alice.latest().players.find((p) => p.id === bobId)).toMatchObject({ name: "Bob", connected: true });
    expect(alice.game().players.every((p) => p.alive)).toBe(true);
  });

  it("knocks out a player who stays disconnected past the grace period", async () => {
    const { alice, bob, aliceId } = await roomWithTwo();
    await alice.start();
    bob.socket.disconnect();
    await settle(GRACE_MS + 50);
    expect(alice.latest().players.map((p) => p.id)).toEqual([aliceId]);
    expect(alice.game()).toMatchObject({ status: "over", winnerId: aliceId, endReason: "disconnect" });
  });

  it("passes host to another player when the host leaves, and deletes empty rooms", async () => {
    const { alice, bob, bobId } = await roomWithTwo();
    alice.socket.emit("room:leave");
    await settle();
    expect(bob.latest().hostId).toBe(bobId);
    expect(bob.latest().players).toHaveLength(1);
    expect(server.rooms.roomCount).toBe(1);

    bob.socket.emit("room:leave");
    await settle();
    expect(server.rooms.roomCount).toBe(0);
  });

  it("takes over the seat when the same browser joins from a second tab", async () => {
    const { alice, code, aliceId } = await roomWithTwo();
    const aliceTab2 = await client(alice.clientId);
    expect(await aliceTab2.join(code, "Alice")).toEqual({ ok: true, playerId: aliceId });
    // The old tab no longer controls the seat.
    expect(await alice.start()).toEqual({ ok: false, error: "not-in-room" });
    expect(await aliceTab2.start()).toEqual({ ok: true });
  });
});
