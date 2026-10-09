import { useEffect, useState } from "react";
import type { RoomView } from "../../shared/protocol";
import { errorMessage } from "./errors";
import { socket } from "./socket";

export interface RoomConnection {
  room: RoomView | null;
  playerId: string | null;
  error: string | null;
  connected: boolean;
  /** serverTime − local time, in ms. Add it to Date.now() to get server time. */
  clockOffset: number;
}

/** Joins a room and keeps its state up to date. Rejoins automatically after a reconnect. */
export function useRoom(code: string, nickname: string): RoomConnection {
  const [room, setRoom] = useState<RoomView | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(socket.connected);
  const [clockOffset, setClockOffset] = useState(0);

  useEffect(() => {
    const join = () => {
      socket.emit("room:join", { roomCode: code, nickname }, (res) => {
        if (res.ok) {
          setPlayerId(res.playerId);
          setError(null);
        } else {
          setError(errorMessage(res.error));
        }
      });
    };
    const onState = (next: RoomView) => {
      if (next.code !== code) return;
      setRoom(next);
      setClockOffset(next.serverTime - Date.now());
    };
    const onConnect = () => {
      setConnected(true);
      join();
    };
    const onDisconnect = () => setConnected(false);

    socket.on("room:state", onState);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    if (socket.connected) join();
    return () => {
      socket.off("room:state", onState);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
    };
  }, [code, nickname]);

  return { room, playerId, error, connected, clockOffset };
}
