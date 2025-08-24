// src/App.tsx
import { useMemo, useState } from "react";
import { BoardView } from "./components/Board";
import { useGame } from "./store/gameStore";
import { computeValues } from "./game/rules";

export default function App() {
  const { board, undo, reset, canUndo } = useGame();
  // Values overlay not passed into BoardView anymore (kept here if you want later)
  const _values = useMemo(() => computeValues(board), [board]);
  const [showRules, setShowRules] = useState(false);

  return (
    <div className="app" style={{ color: "#ddd", background: "#141414", minHeight: "100vh" }}>
      <header style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px" }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>NODI (Prototype)</h1>
        <div className="hud" style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
          <button onClick={reset}>Reset</button>
          <button onClick={undo} disabled={!canUndo}>Undo</button>
          <button onClick={() => setShowRules(true)}>Rules</button>
        </div>
      </header>

      <p style={{ margin: "0 12px 8px 12px", opacity: 0.9 }}>
        Tip: Take your opponents key pieces to win the game.
      </p>

      <div style={{ padding: 12 }}>
        <BoardView />
      </div>

      {showRules && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}
          onClick={() => setShowRules(false)}
        >
          <div
            style={{ width: 680, maxWidth: "90vw", maxHeight: "80vh", overflowY: "auto", background: "#1d1d1d", border: "1px solid #2c2c2c", borderRadius: 10, padding: 16 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ margin: 0 }}>How to Play NODI</h2>
              <button onClick={() => setShowRules(false)}>Close</button>
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.5, marginTop: 10 }}>
              <p><strong>Goal:</strong> Capture both of your opponent’s key pieces.</p>
              <p><strong>Values:</strong> Hover shows full value (counters ± rays). Ability tiers (0,1,2,3+) control what a piece may do.</p>
              <p><strong>Kings:</strong> Form by moving a single onto a friendly single. Arrow faces the move direction. Rays boost allies and diminish enemies in line‑of‑sight.</p>
              <p><strong>Scatter:</strong> Split a king over the next two squares along its arrow (with budget rules).</p>
              <p><strong>Hotkeys:</strong> S=Scatter, R=Rotate, Enter=Confirm, Esc=Cancel.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
