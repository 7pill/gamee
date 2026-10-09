import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { MAX_NICKNAME_LENGTH, ROOM_CODE_LENGTH, normalizeNickname, normalizeRoomCode } from "../../shared/protocol";
import { errorMessage, NO_RESPONSE } from "../net/errors";
import { getNickname, saveNickname } from "../net/identity";
import { REQUEST_TIMEOUT_MS, socket } from "../net/socket";
import { findGame } from "./registry";

/** A game's start page: pick a nickname, then create a room or join one with a code. */
export function GamePage() {
  const game = findGame(useParams().gameId);
  const navigate = useNavigate();
  const [nickname, setNickname] = useState(getNickname);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!game) return <p>Unknown game.</p>;

  function checkNickname(): string | null {
    const name = normalizeNickname(nickname);
    if (!name) setError(errorMessage("invalid-nickname"));
    else saveNickname(name);
    return name;
  }

  async function create() {
    const name = checkNickname();
    if (!name) return;
    setBusy(true);
    try {
      const res = await socket
        .timeout(REQUEST_TIMEOUT_MS)
        .emitWithAck("room:create", { gameId: game!.id, nickname: name });
      if (res.ok) navigate(`/room/${res.roomCode}`);
      else setError(errorMessage(res.error));
    } catch {
      setError(NO_RESPONSE);
    } finally {
      setBusy(false);
    }
  }

  function join(e: FormEvent) {
    e.preventDefault();
    if (!checkNickname()) return;
    const roomCode = normalizeRoomCode(code);
    if (roomCode.length !== ROOM_CODE_LENGTH) return setError(`Room codes have ${ROOM_CODE_LENGTH} letters.`);
    navigate(`/room/${roomCode}`);
  }

  return (
    <section className="panel narrow">
      <h1>{game.name}</h1>
      <p>{game.description}</p>

      <label className="field">
        <span>Your nickname</span>
        <input
          value={nickname}
          onChange={(e) => {
            setNickname(e.target.value);
            setError(null);
          }}
          maxLength={MAX_NICKNAME_LENGTH}
          placeholder="e.g. Alex"
          autoFocus={!nickname}
        />
      </label>

      <div className="start-options">
        <div>
          <h2>New game</h2>
          <button className="button" onClick={create} disabled={busy}>
            Create room
          </button>
        </div>
        <form onSubmit={join}>
          <h2>Join a friend</h2>
          <div className="inline-form">
            <input
              value={code}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase());
                setError(null);
              }}
              maxLength={ROOM_CODE_LENGTH}
              placeholder="Room code"
              aria-label="Room code"
              className="code-input"
              autoCapitalize="characters"
            />
            <button className="button secondary">Join</button>
          </div>
        </form>
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <p>
        <Link to="/">← All games</Link>
      </p>
    </section>
  );
}
