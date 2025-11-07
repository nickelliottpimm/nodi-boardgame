// src/engine/greedy.ts
import type { Board, Player } from "../game/rules";
import {
  pieceAt,
  legalMovesFor,
  valueAt,
  isKeyPiece,
  ownerOf,
  isKing,
} from "../game/rules";

// ---------------------------------------------------------------------------
// Types (unchanged)
export type AIMove =
  | { kind: "combine"; from: { r: number; c: number }; to: { r: number; c: number }; score: number }
  | { kind: "move"; from: { r: number; c: number }; to: { r: number; c: number }; score: number; capture?: boolean };

// ---------------------------------------------------------------------------
// Small helpers (local to this file)
const other = (p: Player): Player => (p === "Black" ? "White" : "Black");

function cloneBoard(b: Board): Board {
  return b.map(row =>
    row.map(cell =>
      cell ? { counters: [...cell.counters], arrowDir: cell.arrowDir } : null
    )
  );
}

function keysRemaining(board: Board, side: Player): number {
  let n = 0;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = pieceAt(board, { r, c });
    if (p && ownerOf(p) === side && isKeyPiece(p)) n++;
  }
  return n;
}

function roughAdjEmpties(board: Board, pos: { r: number; c: number }): number {
  let n = 0;
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    if (!dr && !dc) continue;
    const r = pos.r + dr, c = pos.c + dc;
    if (r >= 0 && r < 8 && c >= 0 && c < 8 && !pieceAt(board, { r, c })) n++;
  }
  return n;
}

function dirFromDelta(a: { r: number; c: number }, b: { r: number; c: number }) {
  const dr = Math.sign(b.r - a.r);
  const dc = Math.sign(b.c - a.c);
  const map: Record<string, "N"|"NE"|"E"|"SE"|"S"|"SW"|"W"|"NW"> = {
    "-1,0": "N", "-1,1": "NE", "0,1": "E", "1,1": "SE",
    "1,0": "S", "1,-1": "SW", "0,-1": "W", "-1,-1": "NW",
  };
  return map[`${dr},${dc}`];
}

// Apply a hypothetical move to a cloned board
function applyMoveClone(
  board: Board,
  side: Player,
  m:
    | { kind: "move"; from: { r: number; c: number }; to: { r: number; c: number }; capture?: boolean }
    | { kind: "combine"; from: { r: number; c: number }; onto: { r: number; c: number } }
): Board {
  const next = cloneBoard(board);

  if (m.kind === "move") {
    const p = pieceAt(next, m.from);
    if (!p) return next;
    if (m.capture) next[m.to.r][m.to.c] = null;
    next[m.to.r][m.to.c] = p;
    next[m.from.r][m.from.c] = null;
    return next;
  }

  // combine
  const a = pieceAt(next, m.from);
  const b = pieceAt(next, m.onto);
  if (!a || !b) return next;
  next[m.onto.r][m.onto.c] = {
    counters: [...b.counters, ...a.counters],
    arrowDir: dirFromDelta(m.from, m.onto),
  };
  next[m.from.r][m.from.c] = null;
  return next;
}

// ---------------------------------------------------------------------------
// Position evaluator (weights are conservative; easy to tune)
function evaluateBoard(board: Board, me: Player): number {
  let score = 0;

  // Material / keys / effective value / king ray presence
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const pos = { r, c };
    const p = pieceAt(board, pos);
    if (!p) continue;

    const sign = ownerOf(p) === me ? 1 : -1;

    // Material (kings are heavier than singles)
    score += sign * (isKing(p) ? 3 : 1);

    // Keys matter a lot
    if (isKeyPiece(p)) score += sign * 5;

    // Effective value band (includes ray buffs)
    score += sign * (valueAt(board, pos) * 0.25);

    // Small nudge when a king has a ray on board
    if (isKing(p) && (p as any).arrowDir) score += sign * 0.15;
  }

  // Mobility proxy (cheap)
  let myMoves = 0, opMoves = 0;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const pos = { r, c };
    const p = pieceAt(board, pos);
    if (!p) continue;
    if (ownerOf(p) === me) myMoves += roughAdjEmpties(board, pos);
    else opMoves += roughAdjEmpties(board, pos);
  }
  score += 0.15 * (myMoves - opMoves);

  // Terminal: opponent out of keys
  if (keysRemaining(board, other(me)) === 0) score += 1000;

  return score;
}

// ---------------------------------------------------------------------------
// Main: enumerate and score candidates by resulting position quality
export function enumerateMoves(board: Board, side: Player): AIMove[] {
  const out: AIMove[] = [];

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const pos = { r, c };
      const p = pieceAt(board, pos);
      if (!p || ownerOf(p) !== side) continue;

      const lm = legalMovesFor(board, pos);

      // combines
      for (const to of lm.combines) {
        const next = applyMoveClone(board, side, { kind: "combine", from: pos, onto: to });
        const base = evaluateBoard(next, side);
        const score = base + 0.6; // slight preference to form a king
        out.push({ kind: "combine", from: pos, to, score });
      }

      // captures
      for (const to of lm.captures) {
        const tgt = pieceAt(board, to);
        const next = applyMoveClone(board, side, { kind: "move", from: pos, to, capture: true });
        const base = evaluateBoard(next, side);
        const capBonus = 1.5 + (tgt && isKeyPiece(tgt) ? 3 : 0);
        const score = base + capBonus;
        out.push({ kind: "move", from: pos, to, capture: true, score });
      }

      // quiet moves
      for (const to of lm.moves) {
        const next = applyMoveClone(board, side, { kind: "move", from: pos, to });
        const base = evaluateBoard(next, side);
        // tiny centralization nudge to break ties (very small)
        const center =
          0.03 * ((3 - Math.abs(3.5 - to.r)) + (3 - Math.abs(3.5 - to.c)));
        const score = base + center;
        out.push({ kind: "move", from: pos, to, score });
      }
    }
  }

  // Keep the list sorted (best first). Your worker/AI loop can pick out[0].
  out.sort((a, b) => b.score - a.score);
  return out;
}
