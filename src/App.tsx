// src/App.tsx
import React, { useMemo, useState } from "react";
import { BoardView } from "./components/Board";
import { useGame } from "./store/gameStore";
import { computeValues } from "./game/rules";

export default function App() {
  const { board, undo, reset, canUndo } = useGame();
  const values = useMemo(() => computeValues(board), [board]);

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
        <BoardView values={values} />
    </div>

      {/* RULES Modal */}
      {showRules && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999
          }}
          onClick={() => setShowRules(false)}
        >
          <div
            style={{
              width: 680, maxWidth: "90vw", maxHeight: "80vh", overflowY: "auto",
              background: "#1d1d1d", border: "1px solid #2c2c2c", borderRadius: 10, padding: 16
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ margin: 0 }}>How to Play NODI</h2>
              <button onClick={() => setShowRules(false)}>Close</button>
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.5, marginTop: 10 }}>
              <p><strong>Goal:</strong> Capture both of your opponent’s <em>key</em> pieces.</p>
              <p><strong>Board:</strong> 8×8. Pieces are singles (value 1) or kings (stack of 2). Keys cannot stack.</p>
              <p><strong>Turns:</strong> Players alternate; only the side to move can act. Attacker wins ties on equal values.</p>
              <p><strong>Values:</strong> Base value = number of counters in the stack. Rays from allied kings pointing at a piece add +1; enemy rays subtract −1. The number you see on hover is the <em>full current value</em> (counters ± rays), which can be above 3 or below 0. Movement abilities still follow the 0–3+ ability tiers.</p>
              <ul>
                <li><strong>0:</strong> cannot move, cannot orient.</li>
                <li><strong>1:</strong> move 1 in any direction; cannot orient.</li>
                <li><strong>2:</strong> (king only) either move 1 <em>or</em> change arrow (uses the move), <em>or</em> move 2 along arrow, <em>or</em> scatter over the next two along arrow.</li>
                <li><strong>3+:</strong> (king only) either move 1, <em>or</em> freely re‑orient then move, <em>or</em> slide any distance along arrow until blocked, <em>or</em> scatter from any reachable base along the arrow (over the next two).</li>
              </ul>
              <p><strong>Kings & Arrows:</strong> Move a single onto a friendly single to form a king (top flips, revealing an arrow pointing in the move’s direction). The arrow projects a ray in a straight line; allies in that line get +1, enemies −1 (line‑of‑sight only).</p>
              <p><strong>Capturing:</strong> A piece can capture any enemy piece whose current value ≤ the attacker’s current value. For scatter capture, the sum of the two enemies’ values must be ≤ the king’s current value.</p>
              <p><strong>Scatter:</strong> Splits the two counters onto the next two squares along the arrow from a chosen base. V2: base = current square. V3+: choose any slide‑reachable base along the arrow. Allies can’t occupy landing squares.</p>
              <p><strong>Keys:</strong> Special singles that end the game when both are captured. Keys cannot form kings.</p>
              <p><strong>Hotkeys:</strong><br/>
                • <kbd>S</kbd> = Enter scatter mode  • <kbd>Enter</kbd> = Confirm scatter/rotation  • <kbd>Esc</kbd> = Cancel scatter/rotation<br/>
                • <kbd>R</kbd> = Rotate clockwise (press multiple times to cycle, then confirm)
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
