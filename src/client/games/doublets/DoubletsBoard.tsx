import { useEffect, useRef, useState, type FormEvent } from "react";
import type { DoubletsView, EliminationReason, PlayerState } from "../../../shared/games/doublets/types";
import { errorMessage, NO_RESPONSE } from "../../net/errors";
import { useCountdown } from "../../net/useCountdown";
import type { BoardProps } from "../types";

const OUT_LABELS: Record<EliminationReason, string> = {
  timeout: "ran out of time",
  surrender: "surrendered 🏳️",
  disconnect: "disconnected",
};

export function DoubletsBoard({ room, playerId, clockOffset, sendAction }: BoardProps) {
  const game = room.game as DoubletsView;
  const current = game.history[game.history.length - 1].word;
  const previous = game.history.length > 1 ? game.history[game.history.length - 2].word : null;
  const turnPlayer = game.players[game.turn];
  const me = game.players.find((p) => p.id === playerId);
  const playing = game.status === "playing";
  const myTurn = playing && turnPlayer.id === playerId;
  const secondsLeft = useCountdown(game.turnDeadline, clockOffset);
  const nameOf = (id: string | null) => game.players.find((p) => p.id === id)?.name ?? "?";

  const [word, setWord] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmSurrender, setConfirmSurrender] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // New turn: clear the input and focus it if it's ours.
  useEffect(() => {
    setWord("");
    setError(null);
    if (myTurn) inputRef.current?.focus();
  }, [game.history.length, game.turn, myTurn]);

  async function send(action: unknown): Promise<boolean> {
    setBusy(true);
    try {
      const res = await sendAction(action);
      if (!res.ok) setError(errorMessage(res.error));
      return res.ok;
    } catch {
      setError(NO_RESPONSE);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!word.trim()) return;
    if (!(await send({ type: "move", word }))) inputRef.current?.select();
  }

  async function surrender() {
    setConfirmSurrender(false);
    await send({ type: "surrender" });
  }

  return (
    <div className="board">
      <section className="panel board-main">
        <p className="turn-status" aria-live="polite">
          {playing ? (
            <>
              {myTurn ? <strong>Your turn</strong> : <span>{turnPlayer.name}'s turn</span>}
              {secondsLeft !== null && (
                <span className={`countdown${secondsLeft <= 5 ? " urgent" : ""}`}>{secondsLeft}s</span>
              )}
            </>
          ) : (
            <strong>Game over</strong>
          )}
        </p>

        <WordTiles word={current} previous={previous} />

        {playing && me?.alive && (
          <form className="move-form" onSubmit={submit}>
            <input
              ref={inputRef}
              value={word}
              onChange={(e) => {
                setWord(e.target.value.replace(/[^a-z]/gi, "").toLowerCase());
                setError(null);
              }}
              maxLength={game.settings.wordLength}
              disabled={!myTurn || busy}
              placeholder={myTurn ? "Your word" : "Wait for your turn"}
              aria-label="Your word"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
            />
            <button className="button" disabled={!myTurn || busy || word.length !== game.settings.wordLength}>
              Play
            </button>
          </form>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        {!playing && <GameResult game={game} playerId={playerId} nameOf={nameOf} />}

        {playing && me?.alive && (
          <div className="surrender">
            {confirmSurrender ? (
              <>
                <span>Give up this game?</span>
                <button className="button danger" onClick={surrender} disabled={busy}>
                  Yes, surrender
                </button>
                <button className="button secondary" onClick={() => setConfirmSurrender(false)}>
                  Keep playing
                </button>
              </>
            ) : (
              <button className="button secondary" onClick={() => setConfirmSurrender(true)}>
                🏳️ Surrender
              </button>
            )}
          </div>
        )}
        {playing && me && !me.alive && <p className="muted">You're out. Watch the rest of the game.</p>}
      </section>

      <aside className="board-side">
        <section className="panel">
          <h2>Players</h2>
          <ul className="player-list">
            {game.players.map((p) => (
              <PlayerRow
                key={p.id}
                player={p}
                isTurn={playing && p.id === turnPlayer.id}
                isMe={p.id === playerId}
                connected={room.players.find((rp) => rp.id === p.id)?.connected ?? false}
              />
            ))}
          </ul>
        </section>
        <section className="panel">
          <h2>Words played ({game.history.length})</h2>
          <ol className="history" reversed>
            {[...game.history].reverse().map((play) => (
              <li key={play.word}>
                <span className="history-word">{play.word}</span>
                <span className="muted">{play.playerId ? nameOf(play.playerId) : "start"}</span>
              </li>
            ))}
          </ol>
        </section>
      </aside>
    </div>
  );
}

/** The current word as letter tiles, with the letter that just changed highlighted. */
function WordTiles({ word, previous }: { word: string; previous: string | null }) {
  return (
    <div className="tiles" aria-label={`Current word: ${word}`}>
      {[...word].map((letter, i) => (
        // Keyed by word so the highlight animation replays on every move.
        <span key={`${word}-${i}`} className={`tile${previous && previous[i] !== letter ? " changed" : ""}`}>
          {letter}
        </span>
      ))}
    </div>
  );
}

function PlayerRow(props: { player: PlayerState; isTurn: boolean; isMe: boolean; connected: boolean }) {
  const { player, isTurn, isMe, connected } = props;
  return (
    <li className={`player${isTurn ? " turn" : ""}${player.alive ? "" : " out"}`}>
      <span className={`dot${connected ? " online" : ""}`} title={connected ? "Online" : "Offline"} />
      <span>
        {player.name}
        {isMe && <span className="muted"> (you)</span>}
      </span>
      <span className="muted player-note">{player.out ? OUT_LABELS[player.out] : isTurn ? "playing…" : ""}</span>
    </li>
  );
}

function GameResult(props: { game: DoubletsView; playerId: string; nameOf: (id: string | null) => string }) {
  const { game, playerId, nameOf } = props;
  const last = game.history[game.history.length - 1];
  const headline = game.winnerId === playerId ? "🏆 You win!" : game.winnerId ? `🏆 ${nameOf(game.winnerId)} wins!` : "No winner";
  const reason =
    game.endReason === "stuck"
      ? `"${last.word}" left no moves, so ${nameOf(last.playerId)} wins.`
      : "Last player standing.";
  return (
    <div className="result">
      <p className="result-headline">{headline}</p>
      <p className="muted">
        {reason} {game.history.length - 1} words played.
      </p>
    </div>
  );
}
