// src/components/Board.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import cn from "classnames";
import { SQUARE, DIRS } from "../game/types";
import type { Coord } from "../game/types";
import type { Board, Player } from "../game/rules";
import {
  isKing,
  pieceAt,
  valueAt,
  legalMovesFor,
  getRayForKing,
  ownerOf,
  isKeyPiece,
} from "../game/rules";
import { scatterBases, validateScatter } from "../game/scatter";
import { PieceView } from "./Piece";
import { RayOverlay } from "./RayOverlay";
import { useGame } from "../store/gameStore";
import { enumerateMoves, pickWithLookahead } from "../engine/greedy";

type AllDir = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";
const DIR_ORDER: AllDir[] = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

// Toolbar styles
const BTN_W = 120;
const BTN_H = 34;

const GROUP_STYLE: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  padding: "8px 10px",
  border: "1px solid #2c2c2c",
  borderRadius: 8,
  background: "#161616",
  minWidth: 160,
};
const ROW_STYLE: React.CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  minHeight: BTN_H,
};
const SLOT_STYLE: React.CSSProperties = {
  display: "flex",
  gap: 8,
  minHeight: BTN_H,
};
const BTN: React.CSSProperties = {
  width: BTN_W,
  height: BTN_H,
  background: "#2a2a2a",
  color: "#ddd",
  border: "1px solid #3a3a3a",
  borderRadius: 6,
  cursor: "pointer",
};
const BTN_ACTIVE: React.CSSProperties = {
  ...BTN,
  background: "#3a3a3a",
  borderColor: "#5a5a5a",
};
const BTN_PRIMARY: React.CSSProperties = {
  ...BTN,
  background: "#2f4cff",
  borderColor: "#3b57ff",
  color: "#fff",
};

function dirToAngle(dir: AllDir) {
  switch (dir) {
    case "N": return 0;
    case "NE": return 45;
    case "E": return 90;
    case "SE": return 135;
    case "S": return 180;
    case "SW": return 225;
    case "W": return 270;
    case "NW": return 315;
  }
}
function nextCW(d: AllDir): AllDir {
  const i = DIR_ORDER.indexOf(d);
  return DIR_ORDER[(i + 1) % 8];
}
function coordEq(a: Coord, b: Coord) {
  return a.r === b.r && a.c === b.c;
}

type AnimState =
  | null
  | { kind: "move"; from: Coord; to: Coord; owner: Player }
  | { kind: "scatter"; from: Coord; l1: Coord; l2: Coord; owner: Player };

function fullValueAt(board: Board, pos: Coord): number {
  const p = pieceAt(board, pos);
  if (!p) return 0;
  let total = p.counters.length;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const qPos = { r, c };
      const q = pieceAt(board, qPos);
      if (!q || !isKing(q) || !q.arrowDir) continue;
      const ray = getRayForKing(board, qPos);
      const hits = ray.some((s) => s.r === pos.r && s.c === pos.c);
      if (hits) total += ownerOf(q) === ownerOf(p) ? 1 : -1;
    }
  }
  return total;
}

export function BoardView() {
  const {
    board,
    turn,
    selected,
    select,
    actMove,
    actCombine,
    actRotateArrow,
    actScatter,
    winner,
    gameMode,
    aiColor,
    setGameMode,
    setAIColor,
  } = useGame();

  const [hover, setHover] = useState<Coord | null>(null);
  const [showHelp, setShowHelp] = useState(true);

  // Scatter UI
  const [scatterMode, setScatterMode] = useState(false);
  const [scatterBase, setScatterBase] = useState<Coord | null>(null);

  // Rotate UI
  const [rotateMode, setRotateMode] = useState(false);
  const [previewDir, setPreviewDir] = useState<AllDir | null>(null);

  // Anim
  const [anim, setAnim] = useState<AnimState>(null);
  const [animGo, setAnimGo] = useState(false);
  const animTimer = useRef<number | null>(null);

  // Legal
  const legal = useMemo(() => {
    if (!selected || scatterMode || rotateMode) {
      return { moves: [] as Coord[], combines: [] as Coord[], captures: [] as Coord[] };
    }
    return legalMovesFor(board, selected);
  }, [board, selected, scatterMode, rotateMode]);

  const selectedPiece = selected ? pieceAt(board, selected) : null;
  const selectedIsKing = !!(selectedPiece && isKing(selectedPiece));
  const friendlySelected = !!(selectedPiece && ownerOf(selectedPiece) === turn); // must belong to current turn
  const canOrientNow = selected
    ? selectedIsKing && friendlySelected && valueAt(board, selected) >= 2
    : false;

  // Rays
  const rayLines = useMemo(() => {
    const lines: { path: Coord[]; selected: boolean }[] = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const pos = { r, c };
        const p = pieceAt(board, pos);
        if (!p || !isKing(p) || !p.arrowDir) continue;
        lines.push({
          path: [pos, ...getRayForKing(board, pos)],
          selected: !!(selected && selected.r === r && selected.c === c),
        });
      }
    }
    return lines;
  }, [board, selected]);

  // Hover value
  const hoverValue = useMemo(() => {
    if (!hover) return null;
    return fullValueAt(board, hover);
  }, [board, hover]);

  // AI loop
  useEffect(() => {
    if (winner) return;
    if (gameMode !== "vsAI") return;
    if (turn !== aiColor) return;
    if (rotateMode || scatterMode) return;

   const t = setTimeout(() => {
  const action =
    pickWithLookahead(board, aiColor, { replyLimit: 6, moveLimit: 24 }) ??
    (enumerateMoves(board, aiColor)[0] ?? null);

  if (!action) return;

  if (action.kind === "combine") actCombine(action.from, action.to);
  else if (action.kind === "rotate") actRotateArrow(action.at, action.dir);
  else actMove(action.from, action.to, !!action.capture);
}, 180);


    return () => clearTimeout(t);
  }, [
    board,
    turn,
    winner,
    gameMode,
    aiColor,
    rotateMode,
    scatterMode,
    actMove,
    actCombine,
    actRotateArrow,
  ]);

  // Click square
  function onSquareClick(r: number, c: number) {
    if (winner) return;
    if (gameMode === "vsAI" && turn === aiColor) return;

    const pos = { r, c };

    // Scatter base selection
    if (scatterMode) {
      if (!selected) return;
      const p = pieceAt(board, selected);
      if (!p || !isKing(p) || !p.arrowDir) return;
      const [dr, dc] = DIRS[p.arrowDir];
      const candidateBase = { r: r - dr, c: c - dc };
      const bases = scatterBases(board, selected);
      if (bases.some((b) => coordEq(b, candidateBase))) setScatterBase(candidateBase);
      return;
    }

    if (rotateMode) return;

    if (!selected) {
      const p = pieceAt(board, pos);
      if (p && ownerOf(p) === turn) select(pos);
      return;
    }

    const canMove = legal.moves.some((m) => coordEq(m, pos));
    const canCap  = legal.captures.some((m) => coordEq(m, pos));
    const canComb = legal.combines.some((m) => coordEq(m, pos));

    const mover = pieceAt(board, selected)!;
    const moverOwner = ownerOf(mover);

    // Do not allow acting with a piece that no longer belongs to the current turn
    if (moverOwner !== turn) {
      select(null as any);
      return;
    }

    if (canMove || canCap || canComb) {
      const owner = moverOwner;
      setAnim({ kind: "move", from: selected, to: pos, owner });
      setAnimGo(false);
      requestAnimationFrame(() => requestAnimationFrame(() => setAnimGo(true)));
      if (animTimer.current) window.clearTimeout(animTimer.current);
      animTimer.current = window.setTimeout(() => {
        if (canComb) actCombine(selected, pos);
        else actMove(selected, pos, canCap);
        setAnim(null);
      }, 180);
      return;
    }

    const p2 = pieceAt(board, pos);
    if (p2 && ownerOf(p2) === turn) {
      select(pos);
      return;
    }

    select(null as any);
  }

  // Rotate helpers
  function cycleCW() {
    if (!selected || !selectedIsKing) return;
    if (!friendlySelected) return;
    const cur = (selectedPiece as any)?.arrowDir as AllDir | null;
    setRotateMode(true);
    setPreviewDir((prev) => (prev ? nextCW(prev) : cur ? nextCW(cur) : "N"));
  }
  // Click a dot to enter rotate mode with that absolute direction
  function handleOrient(dir: AllDir) {
    if (!selected || !selectedIsKing) return;
    if (!friendlySelected) return;
    setRotateMode(true);
    setPreviewDir(dir);
  }
  function confirmRotation() {
    if (!selected || !selectedIsKing || !previewDir) {
      setRotateMode(false);
      setPreviewDir(null);
      return;
    }
    const prevTurn = turn; // track before
    actRotateArrow(selected, previewDir as any);
    const nextTurn = useGame.getState().turn; // read after store update
    // if the rotate consumed the turn (value-2), clear selection to block further actions
    if (nextTurn !== prevTurn) {
      select(null as any); // clear selection on turn flip
    }
    setRotateMode(false);
    setPreviewDir(null);
  }
  function cancelRotation() {
    setRotateMode(false);
    setPreviewDir(null);
  }

  // Scatter info
  const scatterInfo = useMemo(() => {
    if (!selected || !scatterMode) return null;
    const p = pieceAt(board, selected);
    if (!p || !isKing(p) || !p.arrowDir) return null;
    const bases = scatterBases(board, selected);
    if (bases.length === 0) return null;
    const base =
      scatterBase && bases.some((b) => coordEq(b, scatterBase)) ? scatterBase : bases[0];
    const val = validateScatter(board, selected, base) ?? { l1: base, l2: base, can: false };
    return { bases, base, ...val };
  }, [board, selected, scatterMode, scatterBase]);

  // Hotkeys
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!selected || winner) return;
      if (gameMode === "vsAI" && turn === aiColor) return;
      const selPiece = selected ? pieceAt(board, selected) : null;
      const selOwner = selPiece ? ownerOf(selPiece) : null;

      // Only allow hotkeys when the selected piece belongs to the current turn
      if (!selPiece || selOwner !== turn) return;

      if (e.key === "s" || e.key === "S") {
        setScatterMode(true);
        setScatterBase(selected);
      }
      if (e.key === "r" || e.key === "R") cycleCW();
      if (e.key === "Enter") {
        if (scatterMode && scatterInfo?.can) {
          const owner = ownerOf(pieceAt(board, selected)!);
          setAnim({
            kind: "scatter",
            from: selected,
            l1: scatterInfo.l1,
            l2: scatterInfo.l2,
            owner,
          });
          setAnimGo(false);
          requestAnimationFrame(() =>
            requestAnimationFrame(() => setAnimGo(true))
          );
          if (animTimer.current) window.clearTimeout(animTimer.current);
          animTimer.current = window.setTimeout(() => {
            actScatter(selected, scatterInfo.l1, scatterInfo.l2);
            setAnim(null);
            setScatterMode(false);
            setScatterBase(null);
          }, 200);
        } else if (rotateMode) {
          confirmRotation();
        }
      }
      if (e.key === "Escape") {
        if (scatterMode) {
          setScatterMode(false);
          setScatterBase(null);
        }
        if (rotateMode) cancelRotation();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    selected,
    scatterMode,
    scatterInfo,
    rotateMode,
    previewDir,
    board,
    winner,
    gameMode,
    turn,
    aiColor,
  ]);

  // Cleanup timer
  useEffect(() => {
    return () => {
      if (animTimer.current) window.clearTimeout(animTimer.current);
    };
  }, []);

  function centerOf(pos: Coord) {
    return {
      x: pos.c * SQUARE + SQUARE / 2,
      y: pos.r * SQUARE + SQUARE / 2,
    };
  }

  // Help text
  const helpLines = useMemo(() => {
    const out: string[] = [];
    const sel = selected;
    if (!selectedPiece || !sel) return out;
    const v = valueAt(board, sel);
    out.push(
      v === 0
        ? "Value 0: cannot move, cannot orient."
        : v === 1
        ? "Value 1: can move one space; cannot orient."
        : v === 2
        ? "Value 2: move one space OR re-orient (uses your move); move two along ray; scatter next two."
        : "Value 3+: move one space; free re-orient before moving; slide full ray; scatter from any slide base."
    );
    if (selectedIsKing)
      out.push("King: its ray boosts allies / diminishes enemies in line-of-sight.");
    else out.push("Single: can combine with adjacent friendly single to form a king.");
    if (isKeyPiece(selectedPiece)) {
      out.push("This is a key piece. Take your opponents key pieces to win the game.");
      out.push("Key pieces cannot combine to form kings.");
    } else {
      out.push("Keys can’t stack. All pieces block movement and line-of-sight.");
    }
    out.push("Hotkeys: S=Scatter, R=Rotate, Enter=Confirm, Esc=Cancel.");
    return out;
  }, [board, selected, selectedPiece, selectedIsKing]);

  // All destinations
  const allDestinations = useMemo(() => {
    if (!selected || scatterMode || rotateMode) return [] as Coord[];
    const list = [...legal.moves, ...legal.combines, ...legal.captures];
    const seen = new Set<string>();
    return list.filter((p) => {
      const k = `${p.r}-${p.c}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [legal, selected, scatterMode, rotateMode]);

  return (
    <div
      className="board-shell"
      style={{
        position: "relative",
        paddingLeft: 300,
        display: "block",
      }}
    >
      {/* Left info panel */}
      <div
        className="side-help"
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: 260,
          padding: "10px 12px",
          background: "#1d1d1d",
          border: "1px solid #2c2c2c",
          borderRadius: 8,
          color: "#ddd",
          height: SQUARE * 8,
          overflowY: "auto",
          overflowX: "hidden",
          opacity: showHelp ? 1 : 0,
          pointerEvents: showHelp ? "auto" : "none",
          transition: "opacity 120ms ease",
          marginRight: 40,
        }}
      >
        {/* Winner banner */}
        {winner && (
          <div
            style={{
              marginBottom: 8,
              padding: "8px 10px",
              border: "1px solid #2c2c2c",
              borderRadius: 8,
              background: "#231f1f",
              color: "#f4dada",
            }}
          >
            <strong>Game over:</strong> {winner} wins (both enemy keys captured).
          </div>
        )}

        {/* Mode & AI controls */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            <button
              style={{
                padding: "6px 10px",
                width: "100%",
                borderRadius: 6,
                border: "1px solid #333",
                background: gameMode === "hotseat" ? "#3a3a3a" : "#262626",
                color: "#ddd",
              }}
              onClick={() => setGameMode("hotseat")}
            >
              Hotseat
            </button>
            <button
              style={{
                padding: "6px 10px",
                width: "100%",
                borderRadius: 6,
                border: "1px solid #333",
                background: gameMode === "vsAI" ? "#3a3a3a" : "#262626",
                color: "#ddd",
              }}
              onClick={() => setGameMode("vsAI")}
            >
              vs AI
            </button>
          </div>

          {gameMode === "vsAI" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 11, opacity: 0.75 }}>AI plays</span>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                <button
                  style={{
                    padding: "6px 10px",
                    width: "100%",
                    borderRadius: 6,
                    border: "1px solid #333",
                    background: aiColor === "Black" ? "#3a3a3a" : "#262626",
                    color: "#ddd",
                  }}
                  onClick={() => setAIColor("Black")}
                >
                  Black
                </button>
                <button
                  style={{
                    padding: "6px 10px",
                    width: "100%",
                    borderRadius: 6,
                    border: "1px solid #333",
                    background: aiColor === "White" ? "#3a3a3a" : "#262626",
                    color: "#ddd",
                  }}
                  onClick={() => setAIColor("White")}
                >
                  White
                </button>
              </div>
            </div>
          )}
        </div>

        {selectedPiece ? (
          <>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <strong>
                Selected: {ownerOf(selectedPiece)}{" "}
                {isKeyPiece(selectedPiece) ? "Key " : ""}
                {selectedIsKing ? "King" : "Single"}
              </strong>
              <button onClick={() => setShowHelp(false)}>Hide</button>
            </div>

            <div style={{ marginTop: 8, fontSize: 14 }}>
              Current value (counters ± rays):{" "}
              <strong>{selected ? fullValueAt(board, selected) : "-"}</strong>
            </div>

            {/* Action Toolbar */}
            {selectedIsKing && (
              <div
                style={{
                  marginTop: 8,
                  marginBottom: 12,
                  display: "flex",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                {/* Rotate group */}
                {canOrientNow && (
                  <div style={GROUP_STYLE}>
                    <div style={ROW_STYLE}>
                      <button
                        style={rotateMode ? BTN_ACTIVE : BTN}
                        onClick={() => {
                          if (!friendlySelected) return;
                          const cur = (selectedPiece as any)?.arrowDir as AllDir | null;
                          if (!rotateMode) {
                            setRotateMode(true);
                            setPreviewDir(cur ? nextCW(cur) : "N");
                          } else {
                            setRotateMode(false);
                            setPreviewDir(null);
                          }
                        }}
                      >
                        Rotate
                      </button>
                    </div>
                    <div style={SLOT_STYLE}>
                      {rotateMode ? (
                        <>
                          <button style={BTN} onClick={cycleCW}>Cycle</button>
                          <button
                            style={BTN}
                            onClick={() => {
                              setRotateMode(false);
                              setPreviewDir(null);
                            }}
                          >
                            Cancel
                          </button>
                          <button style={BTN_PRIMARY} onClick={confirmRotation}>
                            Confirm
                          </button>
                        </>
                      ) : (
                        <>
                          <button style={{ ...BTN, visibility: "hidden" }}>Cycle</button>
                          <button style={{ ...BTN, visibility: "hidden" }}>Cancel</button>
                          <button style={{ ...BTN_PRIMARY, visibility: "hidden" }}>Confirm</button>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* Scatter group */}
                <div style={GROUP_STYLE}>
                  <div style={ROW_STYLE}>
                    <button
                      style={scatterMode ? BTN_ACTIVE : BTN}
                      onClick={() => {
                        if (!friendlySelected) return;
                        if (!scatterMode) {
                          if (!selected) return;
                          setScatterMode(true);
                          setScatterBase(selected);
                        } else {
                          setScatterMode(false);
                          setScatterBase(null);
                        }
                      }}
                    >
                      Scatter
                    </button>
                  </div>
                  <div style={SLOT_STYLE}>
                    {scatterMode ? (
                      <>
                        <button
                          style={BTN}
                          onClick={() => {
                            setScatterMode(false);
                            setScatterBase(null);
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          style={
                            scatterInfo?.can
                              ? BTN_PRIMARY
                              : { ...BTN_PRIMARY, opacity: 0.6, cursor: "not-allowed" }
                          }
                          disabled={!scatterInfo?.can}
                          onClick={() => {
                            if (!selected || !scatterInfo) return;
                            const owner = ownerOf(pieceAt(board, selected)!);
                            setAnim({
                              kind: "scatter",
                              from: selected,
                              l1: scatterInfo.l1,
                              l2: scatterInfo.l2,
                              owner,
                            });
                            setAnimGo(false);
                            requestAnimationFrame(() =>
                              requestAnimationFrame(() => setAnimGo(true))
                            );
                            if (animTimer.current) window.clearTimeout(animTimer.current);
                            animTimer.current = window.setTimeout(() => {
                              actScatter(selected, scatterInfo.l1, scatterInfo.l2);
                              setAnim(null);
                              setScatterMode(false);
                              setScatterBase(null);
                            }, 200);
                          }}
                        >
                          Confirm
                        </button>
                      </>
                    ) : (
                      <>
                        <button style={{ ...BTN, visibility: "hidden" }}>Cancel</button>
                        <button style={{ ...BTN_PRIMARY, visibility: "hidden" }}>
                          Confirm
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Help text */}
            <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.35 }}>
              {helpLines.map((t, i) => (
                <div key={i} style={{ marginBottom: 6 }}>
                  • {t}
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <strong>No piece selected</strong>
              <button onClick={() => setShowHelp(false)}>Hide</button>
            </div>
            <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.35, opacity: 0.85 }}>
              Click one of your pieces to see what it can do.
            </div>
          </>
        )}
      </div>

      {/* Bring-back button */}
      {!showHelp && (
        <div style={{ position: "absolute", left: 8, top: 8, zIndex: 2 }}>
          <button onClick={() => setShowHelp(true)}>Info</button>
        </div>
      )}

      {/* Board & overlays */}
      <div style={{ position: "relative", display: "inline-block" }}>
        <svg
          className="board"
          viewBox={`0 0 ${SQUARE * 8} ${SQUARE * 8}`}
          style={{ width: "min(92vmin, 100vw)", height: "auto" }}
        >
          {/* Squares */}
          {[...Array(8)].flatMap((_, r) =>
            [...Array(8)].map((__, c) => {
              const dark = (r + c) % 2 === 1;
              const isSel = !!(selected && selected.r === r && selected.c === c);
              return (
                <rect
                  key={`sq-${r}-${c}`}
                  x={c * SQUARE}
                  y={r * SQUARE}
                  width={SQUARE}
                  height={SQUARE}
                  className={cn("sq", { dark, sel: isSel })}
                  onMouseEnter={() => setHover({ r, c })}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => onSquareClick(r, c)}
                />
              );
            })
          )}

          {/* Rays */}
          <g>
            {rayLines.map((l, i) => (
              <RayOverlay key={`ray-${i}`} rays={l.path} selected={l.selected} />
            ))}
          </g>

          {/* Scatter bases */}
          {scatterMode && scatterInfo && scatterInfo.bases.length > 1 &&
            scatterInfo.bases.map((b, i) => (
              <rect
                key={`base-${i}`}
                x={b.c * SQUARE}
                y={b.r * SQUARE}
                width={SQUARE}
                height={SQUARE}
                fill="none"
                stroke={
                  scatterInfo.base.r === b.r && scatterInfo.base.c === b.c
                    ? "rgba(0,200,255,0.9)"
                    : "rgba(0,200,255,0.6)"
                }
                strokeDasharray="6 4"
                strokeWidth={2}
                onClick={() => setScatterBase(b)}
              />
            ))}

          {/* Scatter landings */}
          {scatterMode && scatterInfo && (
            <>
              {[scatterInfo.l1, scatterInfo.l2].map((p, i) => (
                <rect
                  key={`sc-${i}`}
                  x={p.c * SQUARE}
                  y={p.r * SQUARE}
                  width={SQUARE}
                  height={SQUARE}
                  fill={scatterInfo.can ? "rgba(0,200,0,0.28)" : "rgba(220,0,0,0.28)"}
                  stroke={scatterInfo.can ? "rgba(0,200,0,0.9)" : "rgba(220,0,0,0.9)"}
                  strokeWidth={2}
                  pointerEvents="none"
                />
              ))}
            </>
          )}

          {/* Pieces */}
          {board.map((row, r) =>
            row.map((p, c) =>
              p ? (
                <PieceView
                  key={`p-${r}-${c}`}
                  pos={{ r, c }}
                  piece={p}
                  highlight={
                    selected && selected.r === r && selected.c === c ? "selected" : undefined
                  }
                  onClick={() => onSquareClick(r, c)}
                  onMouseEnter={() => setHover({ r, c })}
                  onMouseLeave={() => setHover(null)}
                />
              ) : null
            )
          )}

          {/* Hover full value */}
          {hover && pieceAt(board, hover) && (
            <text
              x={hover.c * SQUARE + SQUARE / 2}
              y={hover.r * SQUARE + SQUARE / 2 + 6}
              textAnchor="middle"
              className="hoverVal"
              fill={ownerOf(pieceAt(board, hover)!) === "Black" ? "#fff" : "#111"}
            >
              {hoverValue}
            </text>
          )}

          {/* Rotation preview — white arrow */}
          {rotateMode && selected && selectedIsKing && previewDir && (() => {
            const cx = selected.c * SQUARE + SQUARE / 2;
            const cy = selected.r * SQUARE + SQUARE / 2;
            const angle = dirToAngle(previewDir);
            return (
              <g transform={`translate(${cx} ${cy}) rotate(${angle})`}>
                <path
                  d="M -10,12 L 0,-14 L 10,12"
                  fill="none"
                  stroke="#fff"
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>
            );
          })()}

          {/* Orientation dots — only when it's your turn and your piece */}
          {selected && selectedIsKing && canOrientNow && friendlySelected && !scatterMode && (() => {
            const cx = selected.c * SQUARE + SQUARE / 2;
            const cy = selected.r * SQUARE + SQUARE / 2;
            const radius = SQUARE * 0.42;
            const dirs = ["N","NE","E","SE","S","SW","W","NW"] as const;

            return (
              <g className="orient-dots">
                {dirs.map((d) => {
                  const [dr, dc] = DIRS[d];
                  const x = cx + dc * radius;
                  const y = cy + dr * radius;

                  const isPreview = previewDir === d;
                  return (
                    <g key={d} onClick={(e) => { e.stopPropagation(); handleOrient(d); }} style={{ cursor: "pointer" }}>
                      <circle
                        cx={x}
                        cy={y}
                        r={isPreview ? 7 : 6}
                        fill="#fff"
                        stroke="#000"
                        strokeWidth={1}
                      />
                      {isPreview && (
                        <circle
                          cx={x}
                          cy={y}
                          r={10}
                          fill="none"
                          stroke="#fff"
                          strokeWidth={1}
                          opacity={0.7}
                        />
                      )}
                    </g>
                  );
                })}
              </g>
            );
          })()}

          {/* GREEN highlights */}
          {selected && !scatterMode && !rotateMode && (() => {
            const seen = new Set<string>();
            return allDestinations.map((m, i) => {
              const k = `${m.r}-${m.c}`;
              if (seen.has(k)) return null;
              seen.add(k);
              return (
                <rect
                  key={`dest-${i}`}
                  x={m.c * SQUARE}
                  y={m.r * SQUARE}
                  width={SQUARE}
                  height={SQUARE}
                  fill="rgba(0,200,0,0.25)"
                  stroke="rgba(0,200,0,0.9)"
                  strokeWidth={2}
                  onClick={() => onSquareClick(m.r, m.c)}
                />
              );
            });
          })()}

          {/* Move animation */}
          {anim && anim.kind === "move" && (() => {
            const from = centerOf(anim.from);
            const to = centerOf(anim.to);
            return (
              <g
                style={{
                  transform: `translate(${from.x}px, ${from.y}px)`,
                  transition: "transform 180ms ease",
                  ...(animGo ? { transform: `translate(${to.x}px, ${to.y}px)` } : {}),
                }}
              >
                <circle
                  r={SQUARE * 0.24}
                  fill={anim.owner === "Black" ? "#111" : "#eee"}
                  stroke={anim.owner === "Black" ? "#eee" : "#111"}
                  strokeWidth={2}
                />
              </g>
            );
          })()}

          {/* Scatter animation */}
          {anim && anim.kind === "scatter" && (() => {
            const from = centerOf(anim.from);
            const t1 = centerOf(anim.l1);
            const t2 = centerOf(anim.l2);
            return (
              <>
                <g
                  style={{
                    transform: `translate(${from.x}px, ${from.y}px)`,
                    transition: "transform 200ms ease",
                    ...(animGo ? { transform: `translate(${t1.x}px, ${t1.y}px)` } : {}),
                  }}
                >
                  <circle
                    r={SQUARE * 0.24}
                    fill={anim.owner === "Black" ? "#111" : "#eee"}
                    stroke={anim.owner === "Black" ? "#eee" : "#111"}
                    strokeWidth={2}
                  />
                </g>
                <g
                  style={{
                    transform: `translate(${from.x}px, ${from.y}px)`,
                    transition: "transform 200ms ease",
                    ...(animGo ? { transform: `translate(${t2.x}px, ${t2.y}px)` } : {}),
                  }}
                >
                  <circle
                    r={SQUARE * 0.24}
                    fill={anim.owner === "Black" ? "#111" : "#eee"}
                    stroke={anim.owner === "Black" ? "#eee" : "#111"}
                    strokeWidth={2}
                  />
                </g>
              </>
            );
          })()}
        </svg>
      </div>
    </div>
  );
}
