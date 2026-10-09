import { Link, useParams } from "react-router";
import { findGame } from "./registry";

export function GamePage() {
  const game = findGame(useParams().gameId);
  if (!game) return <p>Unknown game.</p>;

  return (
    <section className="panel">
      <h1>{game.name}</h1>
      <p>{game.description}</p>
      <p className="muted">Online rooms are coming next.</p>
      <Link to="/" className="button secondary">
        Back to menu
      </Link>
    </section>
  );
}
