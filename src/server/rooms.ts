import { randomBytes, randomInt } from "node:crypto";
import type { Server, Socket } from "socket.io";
import {
  ROOM_CODE_LENGTH,
  normalizeNickname,
  normalizeRoomCode,
  type Ack,
  type ClientToServerEvents,
  type RoomError,
  type RoomView,
  type ServerToClientEvents,
  type SocketData,
} from "../shared/protocol.js";
import type { GameServerDefinition, GameSession, LeaveReason } from "./games/types.js";

export type GameServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

// No I, L, O: easy to confuse with 1 and 0 when reading a code aloud.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ";

export interface RoomOptions {
  maxRooms: number;
  /** How long a disconnected player keeps their seat before being removed (and knocked out of a game). */
  reconnectGraceMs: number;
}

interface RoomPlayer {
  /** Public id, shown to other players. */
  id: string;
  /** Secret id from the player's browser; never sent to other clients. */
  clientId: string;
  name: string;
  socketId: string | null;
  awayTimer: NodeJS.Timeout | null;
}

interface Room {
  code: string;
  game: GameServerDefinition;
  hostId: string;
  players: RoomPlayer[];
  settings: unknown;
  status: "lobby" | "playing";
  round: number;
  session: GameSession | null;
}

/** Owns every room and wires Socket.IO events to them. All state lives in memory. */
export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  /** Which room each connected socket is in (socket id → room code). */
  private readonly socketRooms = new Map<string, string>();
  private readonly games: Map<string, GameServerDefinition>;

  constructor(
    private readonly io: GameServer,
    games: GameServerDefinition<any>[],
    private readonly options: RoomOptions,
  ) {
    this.games = new Map(games.map((g) => [g.id, g]));
    io.on("connection", (socket) => this.onConnection(socket));
  }

  get roomCount(): number {
    return this.rooms.size;
  }

  /** Stops all timers (used on shutdown and in tests). */
  close(): void {
    for (const room of this.rooms.values()) {
      room.session?.dispose();
      for (const p of room.players) if (p.awayTimer) clearTimeout(p.awayTimer);
    }
    this.rooms.clear();
  }

  private onConnection(socket: GameSocket): void {
    socket.on("room:create", (payload, ack) => {
      const res = this.createRoom(socket, payload);
      safeAck(ack, res);
    });
    socket.on("room:join", (payload, ack) => {
      safeAck(ack, this.joinRoom(socket, payload?.roomCode, payload?.nickname));
    });
    socket.on("room:leave", () => {
      const found = this.findBySocket(socket);
      if (found) this.removePlayer(found.room, found.player, "left");
    });
    socket.on("room:settings", (settings) => {
      const found = this.findBySocket(socket);
      if (!found || found.room.hostId !== found.player.id || found.room.status !== "lobby") return;
      found.room.settings = found.room.game.sanitizeSettings(settings);
      this.broadcast(found.room);
    });
    socket.on("game:start", (ack) => safeAck(ack, this.startGame(socket)));
    socket.on("game:action", (action, ack) => {
      const found = this.findBySocket(socket);
      if (!found) return safeAck(ack, fail("not-in-room"));
      const { room, player } = found;
      if (room.status !== "playing" || !room.session) return safeAck(ack, fail("game-not-running"));
      safeAck(ack, room.session.handleAction(player.id, action));
    });
    socket.on("disconnect", () => {
      const found = this.findBySocket(socket);
      if (!found) return;
      const { room, player } = found;
      this.socketRooms.delete(socket.id);
      player.socketId = null;
      player.awayTimer = setTimeout(() => this.removePlayer(room, player, "disconnected"), this.options.reconnectGraceMs);
      this.broadcast(room);
    });
  }

  private createRoom(socket: GameSocket, payload: { gameId?: unknown; nickname?: unknown } | undefined) {
    const game = this.games.get(String(payload?.gameId));
    if (!game) return fail("unknown-game");
    if (!normalizeNickname(payload?.nickname)) return fail("invalid-nickname");
    if (this.rooms.size >= this.options.maxRooms) return fail("too-many-rooms");

    const room: Room = {
      code: this.newRoomCode(),
      game,
      hostId: "",
      players: [],
      settings: game.sanitizeSettings(undefined),
      status: "lobby",
      round: 0,
      session: null,
    };
    this.rooms.set(room.code, room);
    const joined = this.joinRoom(socket, room.code, payload?.nickname);
    return joined.ok ? { ...joined, roomCode: room.code } : joined;
  }

  private joinRoom(socket: GameSocket, roomCode: unknown, nickname: unknown): Ack<{ playerId: string }> {
    const room = this.rooms.get(normalizeRoomCode(String(roomCode ?? "")));
    if (!room) return fail("room-not-found");

    // Rejoining: same browser, seat kept. Takes over from any older connection (e.g. another tab).
    const existing = room.players.find((p) => p.clientId === socket.data.clientId);
    if (existing) {
      this.leaveCurrentRoom(socket, room);
      if (existing.awayTimer) clearTimeout(existing.awayTimer);
      existing.awayTimer = null;
      if (existing.socketId && existing.socketId !== socket.id) this.detachSocket(existing.socketId, room.code);
      existing.socketId = socket.id;
      this.attachSocket(socket, room.code);
      this.broadcast(room);
      return { ok: true, playerId: existing.id };
    }

    const name = normalizeNickname(nickname);
    if (!name) return fail("invalid-nickname");
    if (room.status === "playing") return fail("game-in-progress");
    if (room.players.length >= room.game.maxPlayers) return fail("room-full");

    this.leaveCurrentRoom(socket, room);
    const player: RoomPlayer = {
      id: randomBytes(6).toString("hex"),
      clientId: socket.data.clientId,
      name,
      socketId: socket.id,
      awayTimer: null,
    };
    room.players.push(player);
    if (!room.hostId) room.hostId = player.id;
    this.attachSocket(socket, room.code);
    this.broadcast(room);
    return { ok: true, playerId: player.id };
  }

  private startGame(socket: GameSocket): Ack {
    const found = this.findBySocket(socket);
    if (!found) return fail("not-in-room");
    const { room, player } = found;
    if (room.hostId !== player.id) return fail("not-host");
    if (room.status !== "lobby") return fail("game-in-progress");
    // Only players who are connected right now take part.
    const players = room.players.filter((p) => p.socketId).map((p) => ({ id: p.id, name: p.name }));
    if (players.length < room.game.minPlayers) return fail("not-enough-players");

    room.session?.dispose();
    const session = room.game.createSession(players, room.settings, () => {
      if (room.session !== session) return;
      if (session.isOver()) room.status = "lobby";
      this.broadcast(room);
    });
    room.session = session;
    room.status = "playing";
    room.round++;
    this.broadcast(room);
    return { ok: true };
  }

  private removePlayer(room: Room, player: RoomPlayer, reason: LeaveReason): void {
    if (player.awayTimer) clearTimeout(player.awayTimer);
    if (player.socketId) this.detachSocket(player.socketId, room.code);
    room.players = room.players.filter((p) => p !== player);

    if (room.players.length === 0) {
      room.session?.dispose();
      this.rooms.delete(room.code);
      return;
    }
    if (room.hostId === player.id) {
      room.hostId = (room.players.find((p) => p.socketId) ?? room.players[0]).id;
    }
    // The session broadcasts through onChange; still broadcast here for the player list change.
    if (room.status === "playing") room.session?.removePlayer(player.id, reason);
    this.broadcast(room);
  }

  /** A socket is in at most one room; joining another room leaves the previous one. */
  private leaveCurrentRoom(socket: GameSocket, except: Room): void {
    const found = this.findBySocket(socket);
    if (found && found.room !== except) this.removePlayer(found.room, found.player, "left");
  }

  private findBySocket(socket: GameSocket): { room: Room; player: RoomPlayer } | null {
    const room = this.rooms.get(this.socketRooms.get(socket.id) ?? "");
    const player = room?.players.find((p) => p.socketId === socket.id);
    return room && player ? { room, player } : null;
  }

  private attachSocket(socket: GameSocket, code: string): void {
    this.socketRooms.set(socket.id, code);
    socket.join(code);
  }

  private detachSocket(socketId: string, code: string): void {
    this.socketRooms.delete(socketId);
    this.io.sockets.sockets.get(socketId)?.leave(code);
  }

  private broadcast(room: Room): void {
    const view: RoomView = {
      code: room.code,
      gameId: room.game.id,
      hostId: room.hostId,
      players: room.players.map((p) => ({ id: p.id, name: p.name, connected: p.socketId !== null })),
      settings: room.settings,
      status: room.status,
      round: room.round,
      game: room.session?.publicState() ?? null,
      serverTime: Date.now(),
    };
    this.io.to(room.code).emit("room:state", view);
  }

  private newRoomCode(): string {
    for (;;) {
      let code = "";
      for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
      if (!this.rooms.has(code)) return code;
    }
  }
}

function fail(error: RoomError): { ok: false; error: RoomError } {
  return { ok: false, error };
}

/** Clients may omit the ack callback; never let that crash the handler. */
function safeAck<T>(ack: ((res: T) => void) | undefined, res: T): void {
  if (typeof ack === "function") ack(res);
}
