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
import { scatterBases, validateScatter } from "../game/scatter";

// ---------------------------------------------------------------------------
// Types (rotate + scatter included)
export type AIMove =
  | {
      kind: "combine";
      from: { r: number; c: number };
      to: { r: number; c: number };
      score: number;
    }
  | {
      kind: "move";
      from: { r: number; c: number };
      to: { r: number; c: number };
      score: number;
      capture?: boolean;
    }
  | {
      kind: "rotate";
      at: { r: number; c: number };
      dir: "CW" | "CCW";
      score: number;
    }
  | {
      kind: "scatter";
      from: { r: number; c: number };
      l1: { r: number; c: number };
      l2: { r: number; c: number };
      score: number;
    };

// ---------------------------------------------------------------------------
// Small helpers (local to this file)
type AllDir = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";
const DIR_ORDER: AllDir[] = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

const other = (p: Player): Player => (p === "Black" ? "White" : "Black");

function cloneBoard(b: Board): Board {
  return b.map((row) =>
    row.map((cell) =>
      cell ? { counters: [...cell.counters], arrowDir: cell.arrowDir } : null
    )
  );
}

function keysRemaining(board: Board, side: Player): number {
  let n = 0;
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++) {
      const p = pieceAt(board, { r, c });
      if (p && ownerOf(p) === side && isKeyPiece(p)) n++;
    }
  return n;
}

function roughAdjEmpties(board: Board, pos: { r: number; c: number }): number {
  let n = 0;
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const r = pos.r + dr,
        c = pos.c + dc;
      if (r >= 0 && r < 8 && c >= 0 && c < 8 && !pieceAt(board, { r, c })) n++;
    }
  return n;
}

function dirFromDelta(
  a: { r: number; c: number },
  b: { r: number; c: number }
): AllDir {
  const dr = Math.sign(b.r - a.r);
  const dc = Math.sign(b.c - a.c);
  const map: Record<string, AllDir> = {
    "-1,0": "N",
    "-1,1": "NE",
    "0,1": "E",
    "1,1": "SE",
    "1,0": "S",
    "1,-1": "SW",
    "0,-1": "W",
    "-1,-1": "NW",
  };
  return map[`${dr},${dc}`];
}

// Apply a hypothetical move to a cloned board
function applyMoveClone(
  board: Board,
  _side: Player,
  m:
    | {
        kind: "move";
        from: { r: number; c: number };
        to: { r: number; c: number };
        capture?: boolean;
      }
    | {
        kind: "combine";
        from: { r: number; c: number };
        onto: { r: number; c: number };
      }
    | { kind: "rotate"; at: { r: number; c: number }; dir: "CW" | "CCW" }
    | {
        kind: "scatter";
        from: { r: number; c: number };
        l1: { r: number; c: number };
        l2: { r: number; c: number };
      }
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

  if (m.kind === "combine") {
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

  if (m.kind === "rotate") {
    const p = pieceAt(next, m.at);
    if (!p || !isKing(p) || !(p as any).arrowDir) return next;
    const idx = DIR_ORDER.indexOf((p as any).arrowDir as AllDir);
    const nextDir =
      m.dir === "CW" ? DIR_ORDER[(idx + 1) % 8] : DIR_ORDER[(idx + 7) % 8];
    (p as any).arrowDir = nextDir;
    return next;
  }

  if (m.kind === "scatter") {
    const p = pieceAt(next, m.from);
    if (!p || !isKing(p)) return next;
    const own = ownerOf(p);
    // remove king
    next[m.from.r][m.from.c] = null;
    // place singles
    next[m.l1.r][m.l1.c] = { counters: [{ owner: own }] };
    next[m.l2.r][m.l2.c] = { counters: [{ owner: own }] };
    return next;
  }

  return next;
}

// ---------------------------------------------------------------------------
// Position evaluator (weights conservative; easy to tune)
function evaluateBoard(board: Board, me: Player): number {
  let score = 0;

  // Material / keys / effective value / king presence
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++) {
      const pos = { r, c };
      const p = pieceAt(board, pos);
      if (!p) continue;

      const sign = ownerOf(p) === me ? 1 : -1;

      // Material (kings heavier)
      score += sign * (isKing(p) ? 3 : 1);

      // Keys
      if (isKeyPiece(p)) score += sign * 5;

      // Effective value (includes ray buffs)
      score += sign * (valueAt(board, pos) * 0.25);

      // Small nudge if king has a ray direction
      if (isKing(p) && (p as any).arrowDir) score += sign * 0.15;
    }

  // Mobility proxy
  let myMoves = 0,
    opMoves = 0;
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++) {
      const pos = { r, c };
      const p = pieceAt(board, pos);
      if (!p) continue;
      if (ownerOf(p) === me) myMoves += roughAdjEmpties(board, pos);
      else opMoves += roughAdjEmpties(board, pos);
    }
  score += 0.15 * (myMoves - opMoves);

  // --- Ray / Node control (cheap pass) ---
  const rayHits: number[][] = Array.from({ length: 8 }, () =>
    Array(8).fill(0)
  );
  const rayHitsOpp: number[][] = Array.from({ length: 8 }, () =>
    Array(8).fill(0)
  );

  const STEP: Record<AllDir, [number, number]> = {
    N: [-1, 0],
    NE: [-1, 1],
    E: [0, 1],
    SE: [1, 1],
    S: [1, 0],
    SW: [1, -1],
    W: [0, -1],
    NW: [-1, -1],
  };

  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++) {
      const pos = { r, c };
      const p = pieceAt(board, pos);
      if (!p || !isKing(p) || !(p as any).arrowDir) continue;

      const [dr, dc] = STEP[(p as any).arrowDir as AllDir];
      let rr = r + dr,
        cc = c + dc;
      while (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) {
        if (ownerOf(p) === me) rayHits[rr][cc]++;
        else rayHitsOpp[rr][cc]++;
        const hit = pieceAt(board, { r: rr, c: cc });
        if (hit) break; // stop at first blocker
        rr += dr;
        cc += dc;
      }
    }

  let nodeScore = 0;
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++) {
      nodeScore += 0.4 * (rayHits[r][c] - rayHitsOpp[r][c]); // control
      if (rayHits[r][c] >= 2) nodeScore += 0.8; // nodes: >=2 friendly rays
    }
  score += nodeScore;

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
        const next = applyMoveClone(board, side, {
          kind: "combine",
          from: pos,
          onto: to,
        });
        const base = evaluateBoard(next, side);
        const score = base + 0.6; // slight preference to form a king
        out.push({ kind: "combine", from: pos, to, score });
      }

      // captures
      for (const to of lm.captures) {
        const tgt = pieceAt(board, to);
        const next = applyMoveClone(board, side, {
          kind: "move",
          from: pos,
          to,
          capture: true,
        });
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

      // free-rotation candidates for kings at value >= 3 (pre-aim rays)
      if (isKing(p) && (p as any).arrowDir && valueAt(board, pos) >= 3) {
        for (const dir of ["CW", "CCW"] as const) {
          const next = applyMoveClone(board, side, {
            kind: "rotate",
            at: pos,
            dir,
          });
          const score = evaluateBoard(next, side);
          out.push({ kind: "rotate", at: pos, dir, score });
        }
      }

      // SCATTER candidates (if legal)
      if (isKing(p) && (p as any).arrowDir && valueAt(board, pos) >= 2) {
        const bases = scatterBases(board, pos);
        for (const base of bases) {
          const info = validateScatter(board, pos, base);
          if (!info || !info.can) continue;
          const next = applyMoveClone(board, side, {
            kind: "scatter",
            from: pos,
            l1: info.l1,
            l2: info.l2,
          });
          const score = evaluateBoard(next, side) + 0.4; // mild scatter kicker
          out.push({
            kind: "scatter",
            from: pos,
            l1: info.l1,
            l2: info.l2,
            score,
          });
        }
      }
    }
  }

  // Keep the list sorted (best first).
  out.sort((a, b) => b.score - a.score);
  return out;
}

// ---------------------------------------------------------------------------
// Depth-2 lookahead (minimax with pruning)
const OPP_REPLY_LIMIT_DEFAULT = 6;
const MOVE_LIMIT_DEFAULT = 24;

/**
 * Pick a move using shallow minimax (our move, then opponent reply).
 * Keeps it fast by pruning to the top N candidates from enumerateMoves.
 */
export function pickWithLookahead(
  board: Board,
  side: Player,
  opts?: { replyLimit?: number; moveLimit?: number }
): AIMove | null {
  const replyLimit = opts?.replyLimit ?? OPP_REPLY_LIMIT_DEFAULT;
  const moveLimit = opts?.moveLimit ?? MOVE_LIMIT_DEFAULT;

  const firstMoves = enumerateMoves(board, side).slice(0, moveLimit);
  if (!firstMoves.length) return null;

  let bestMove: AIMove | null = null;
  let bestScore = -Infinity;

  for (const m of firstMoves) {
    const nb = applyMoveClone(
      board,
      side,
      (m.kind === "combine"
        ? { kind: "combine", from: m.from as any, onto: (m as any).to }
        : m.kind === "move"
        ? {
            kind: "move",
            from: m.from as any,
            to: (m as any).to,
            capture: (m as any).capture,
          }
        : m.kind === "rotate"
        ? { kind: "rotate", at: (m as any).at, dir: (m as any).dir }
        : // scatter
          {
            kind: "scatter",
            from: (m as any).from,
            l1: (m as any).l1,
            l2: (m as any).l2,
          }) as any
    );

    // Fast terminal: if opponent has no keys after our move, snap-pick
    let oppKeys = 0;
    for (let r = 0; r < 8; r++)
      for (let c = 0; c < 8; c++) {
        const p = pieceAt(nb, { r, c });
        if (p && isKeyPiece(p) && ownerOf(p) === other(side)) oppKeys++;
      }
    if (oppKeys === 0) {
      return { ...(m as any), score: 9999 };
    }

    const baseAfterUs = evaluateBoard(nb, side);

    // Opponent replies (pruned)
    const replies = enumerateMoves(nb, other(side)).slice(0, replyLimit);

    // Opponent tries to minimize our evaluation
    let worstForUs = replies.length ? Infinity : 0;
    for (const r of replies) {
      const nb2 = applyMoveClone(
        nb,
        other(side),
        (r.kind === "combine"
          ? { kind: "combine", from: r.from as any, onto: (r as any).to }
          : r.kind === "move"
          ? {
              kind: "move",
              from: r.from as any,
              to: (r as any).to,
              capture: (r as any).capture,
            }
          : r.kind === "rotate"
          ? { kind: "rotate", at: (r as any).at, dir: (r as any).dir }
          : // scatter
            {
              kind: "scatter",
              from: (r as any).from,
              l1: (r as any).l1,
              l2: (r as any).l2,
            }) as any
      );
      const val = evaluateBoard(nb2, side);
      if (val < worstForUs) worstForUs = val;
    }

    const minimaxScore = baseAfterUs - worstForUs;
    if (minimaxScore > bestScore) {
      bestScore = minimaxScore;
      bestMove = { ...(m as any), score: minimaxScore };
    }
  }

  return bestMove;
}
