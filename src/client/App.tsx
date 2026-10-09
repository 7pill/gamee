import { Link, Route, Routes } from "react-router";
import { GamePage } from "./games/GamePage";
import { MainMenu } from "./menu/MainMenu";
import { RoomPage } from "./room/RoomPage";

export function App() {
  return (
    <div className="app">
      <header className="app-header">
        <Link to="/" className="brand">
          gamee
        </Link>
      </header>
      <main className="app-main">
        <Routes>
          <Route path="/" element={<MainMenu />} />
          <Route path="/games/:gameId" element={<GamePage />} />
          <Route path="/room/:code" element={<RoomPage />} />
          <Route path="*" element={<p>Page not found.</p>} />
        </Routes>
      </main>
    </div>
  );
}
