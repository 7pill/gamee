import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { MAX_NICKNAME_LENGTH, normalizeNickname, normalizeRoomCode } from "../../shared/protocol";
import { findGame } from "../games/registry";
import { errorMessage, NO_RESPONSE } from "../net/errors";
import { getNickname, saveNickname } from "../net/identity";
import { REQUEST_TIMEOUT_MS, socket } from "../net/socket";
import { useRoom } from "../net/useRoom";
import { Lobby } from "./Lobby";

export function RoomPage() {
  const code = normalizeRoomCode(useParams().code ?? "");
  const [nickname, setNickname] = useState(() => normalizeNickname(getNickname()));

  // Someone opening a shared link for the first time needs a nickname before joining.
  if (!nickname) {
    return (
      <NicknameForm
        code={code}
        onSubmit={(name) => {
          saveNickname(name);
          setNickname(name);
        }}
      />
    );
  }
  return <Room key={code} code={code} nickname={nickname} />;
}

function Room({ code, nickname }: { code: string; nickname: string }) {
  const { room, playerId, error, connected, clockOffset } = useRoom(code, nickname);
  const navigate = useNavigate();
  // After a game ends, each player looks at the result until they go back to the lobby.
  const [dismissedRound, setDismissedRound] = useState(-1);
  const [startError, setStartError] = useState<string | null>(null);

  if (error) {
    return (
      <section className="panel narrow">
        <h1>Room {code}</h1>
        <p className="error">{error}</p>
        <Link to="/" className="button secondary">
          Back to menu
        </Link>
      </section>
    );
  }
  if (!room || !playerId) return <p className="muted">{connected ? "Joining room…" : "Connecting…"}</p>;

  const game = findGame(room.gameId);
  if (!game) return <p>Unknown game.</p>;
  const isHost = room.hostId === playerId;
  const showBoard = room.game !== null && (room.status === "playing" || dismissedRound !== room.round);

  function leave() {
    socket.emit("room:leave");
    navigate(`/games/${room!.gameId}`);
  }

  async function sendAction(action: unknown) {
    return socket.timeout(REQUEST_TIMEOUT_MS).emitWithAck("game:action", action);
  }

  async function playAgain() {
    setStartError(null);
    try {
      const res = await socket.timeout(REQUEST_TIMEOUT_MS).emitWithAck("game:start");
      if (!res.ok) setStartError(errorMessage(res.error));
    } catch {
      setStartError(NO_RESPONSE);
    }
  }

  return (
    <div className="room">
      {!connected && (
        <p className="banner" role="status">
          Connection lost. Reconnecting…
        </p>
      )}
      <header className="room-header">
        <div>
          <span className="muted">{game.name} · Room</span> <strong className="room-code">{room.code}</strong>
        </div>
        <div className="room-actions">
          <CopyLinkButton code={room.code} />
          <button className="button secondary" onClick={leave}>
            Leave
          </button>
        </div>
      </header>

      {showBoard ? (
        <>
          <game.Board room={room} playerId={playerId} clockOffset={clockOffset} sendAction={sendAction} />
          {room.status === "lobby" && (
            <div className="after-game">
              {isHost && (
                <button className="button" onClick={playAgain}>
                  Play again
                </button>
              )}
              <button className="button secondary" onClick={() => setDismissedRound(room.round)}>
                {isHost ? "Change settings" : "Back to lobby"}
              </button>
              {startError && <p className="error">{startError}</p>}
            </div>
          )}
        </>
      ) : (
        <Lobby room={room} playerId={playerId} game={game} />
      )}
    </div>
  );
}

function CopyLinkButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const link = `${location.origin}/room/${code}`;
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // The clipboard API needs https; show the link so it can be copied by hand.
      setShowLink(true);
    }
  }
  if (showLink) {
    return <input className="link-input" readOnly value={link} onFocus={(e) => e.target.select()} autoFocus />;
  }
  return (
    <button className="button secondary" onClick={copy} title={link}>
      {copied ? "Link copied!" : "Copy invite link"}
    </button>
  );
}

function NicknameForm({ code, onSubmit }: { code: string; onSubmit: (name: string) => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);
  function submit(e: FormEvent) {
    e.preventDefault();
    const name = normalizeNickname(value);
    if (name) onSubmit(name);
    else setError(true);
  }
  return (
    <form className="panel narrow" onSubmit={submit}>
      <h1>Join room {code}</h1>
      <label className="field">
        <span>Your nickname</span>
        <input value={value} onChange={(e) => setValue(e.target.value)} maxLength={MAX_NICKNAME_LENGTH} autoFocus />
      </label>
      {error && <p className="error">{errorMessage("invalid-nickname")}</p>}
      <button className="button">Join</button>
    </form>
  );
}
