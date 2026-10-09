import { Link } from "react-router";
import { games } from "../games/registry";

export function MainMenu() {
  return (
    <section>
      <h1>Pick a game</h1>
      <ul className="game-grid">
        {games.map((game) => (
          <li key={game.id}>
            <Link to={`/games/${game.id}`} className="game-card">
              <h2>{game.name}</h2>
              <p>{game.description}</p>
              <span className="muted">
                {game.minPlayers}–{game.maxPlayers} players · online
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
