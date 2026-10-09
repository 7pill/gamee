import { useState } from "react";
import type { RoomView } from "../../shared/protocol";
import type { GameDefinition } from "../games/types";
import { errorMessage, NO_RESPONSE } from "../net/errors";
import { REQUEST_TIMEOUT_MS, socket } from "../net/socket";

export function Lobby({ room, playerId, game }: { room: RoomView; playerId: string; game: GameDefinition }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isHost = room.hostId === playerId;
  const online = room.players.filter((p) => p.connected).length;
  const canStart = online >= game.minPlayers;

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const res = await socket.timeout(REQUEST_TIMEOUT_MS).emitWithAck("game:start");
      if (!res.ok) setError(errorMessage(res.error));
    } catch {
      setError(NO_RESPONSE);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="lobby">
      <section className="panel">
        <h2>
          Players ({room.players.length}/{game.maxPlayers})
        </h2>
        <ul className="player-list">
          {room.players.map((p) => (
            <li key={p.id} className="player">
              <span className={`dot${p.connected ? " online" : ""}`} title={p.connected ? "Online" : "Offline"} />
              <span>
                {p.name}
                {p.id === playerId && <span className="muted"> (you)</span>}
              </span>
              <span className="muted player-note">{p.id === room.hostId ? "host" : ""}</span>
            </li>
          ))}
        </ul>
        {room.players.length < game.minPlayers && (
          <p className="muted">Share the room code or invite link so friends can join.</p>
        )}
      </section>

      <section className="panel">
        <h2>Settings</h2>
        <game.SettingsForm
          settings={room.settings}
          editable={isHost}
          onChange={(settings) => socket.emit("room:settings", settings)}
        />
        {isHost ? (
          <>
            <button className="button start-button" onClick={start} disabled={!canStart || busy}>
              Start game
            </button>
            {!canStart && <p className="muted">Waiting for at least {game.minPlayers} players online…</p>}
          </>
        ) : (
          <p className="muted">Waiting for the host to start the game…</p>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}
