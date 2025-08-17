// src/App.tsx
import React, { useMemo } from "react";
import { BoardView } from "./components/Board";
import { useGame } from "./store/gameStore";
import { computeValues } from "./game/rules";

export default function App() {
  const { board, turn, undo, reset, canUndo } = useGame();
  const values = useMemo(() => computeValues(board), [board]);

  return (
    <div className="app">
      <header>
        <h1>NODI (Prototype)</h1>
        <div className="hud">
          <div><strong>Turn:</strong> {turn}</div>
          <button onClick={reset}>Reset</button>
          <button onClick={undo} disabled={!canUndo}>Undo</button>
        </div>
        <p className="tip">
          Tip: Combine friendly pieces to create kings. The king's arrow promotes or diminishes pieces by line-of-sight. Take your opponents two key pieces to win the game!
        </p>
      </header>

      <BoardView values={values} />

      <footer>
        <small>Keys can’t stack. All pieces block movement and line-of-sight. Attacker wins ties.</small>
      </footer>
    </div>
  );
}
