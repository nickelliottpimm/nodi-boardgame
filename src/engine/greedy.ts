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
// Types (+ rotate added)
export type AIMove =
  | { kind: "combine"; from: { r: number; c: number }; to: { r: number; c: number }; score: number }
  | { kind: "move"; from: { r: number; c: number }; to: { r: number; c: number }; score: number; capture?: boolean }
  | { kind: "rotate"; at: { r: number; c: number }; dir: "CW" | "CCW"; score: number };

// ---------------------------------------------------------------------------
// Small helpers (local to this file)
type AllDir = "N"|"NE"|"E"|"SE"|"S"|"SW"|"W"|"NW";
const DIR_ORDER: AllDir[] = ["N","NE","E","SE","S","SW","W","NW"];

const other = (p: Player): Player => (p === "Black" ? "White" : "Black");

function cloneBoard(b: Board): Board {
  return b.map(row =>
    row.map(cell =>
      cell ? { counters: [...cell.counters], arrowDir: cell.arrowDir } : null
    )
  );
}

// ---------------------------------------------------------------------------
// Pruning knobs + tie epsilon
const PRUNE = {
  MOVE_LIMIT: 24,      // our first-ply candidates
  REPLY_LIMIT: 6,      // opponent replies
  KEEP_CAPTURES: true, // always keep all captures
};
const NEAR_TIE_EPS = 0.15;

// --- Key utilities ----------------------------------------------------------
function keySquares(board: Board, side: Player): Array<{ r: number; c: number }> {
  const ks: Array<{ r: number; c: number }> = [];
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = pieceAt(board, { r, c });
    if (p && isKeyPiece(p) && ownerOf(p) === side) ks.push({ r, c });
  }
  return ks;
}

function canSideCaptureSquare(board: Board, side: Player, target: { r: number; c: number }): boolean {
  // Quick probe: generate capture destinations; if any equals target, return true
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const pos = { r, c };
    const p = pieceAt(board, pos);
    if (!p || ownerOf(p) !== side) continue;
    const lm = legalMovesFor(board, pos);
    for (const to of lm.captures) {
      if (to.r === target.r && to.c === target.c) return true;
    }
  }
  return false;
}

function canOppCaptureOurKey(board: Board, me: Player): boolean {
  const opp = other(me);
  for (const k of keySquares(board, me)) {
    if (canSideCaptureSquare(board, opp, k)) return true;
  }
  return false;
}

// Small stochastic tiebreak among near-equals
function pickNearTieRandom<T extends { score: number }>(arr: T[], eps = NEAR_TIE_EPS): T {
  if (!arr.length) return arr[0] as any;
  const best = arr[0].score;
  const near = arr.filter(m => best - m.score <= eps);
  return near[Math.floor(Math.random() * near.length)];
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

function dirFromDelta(a: { r: number; c: number }, b: { r: number; c: number }): AllDir {
  const dr = Math.sign(b.r - a.r);
  const dc = Math.sign(b.c - a.c);
  const map: Record<string, AllDir> = {
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
    | { kind: "rotate"; at: { r: number; c: number }; dir: "CW" | "CCW" }
): Board {
  void side; // param intentionally unused here
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

  // rotate (free orientation candidate at value >= 3)
  if (m.kind === "rotate") {
    const p = pieceAt(next, m.at);
    if (!p) return next;
    if (!isKing(p) || !(p as any).arrowDir) return next;
    const idx = DIR_ORDER.indexOf((p as any).arrowDir as AllDir);
    const nextDir = m.dir === "CW" ? DIR_ORDER[(idx + 1) % 8] : DIR_ORDER[(idx + 7) % 8];
    (p as any).arrowDir = nextDir;
    return next;
  }

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

      // NEW: free-rotation candidates for kings at value >= 3 (pre-aim rays)
      if (isKing(p) && (p as any).arrowDir && valueAt(board, pos) >= 3) {
        for (const dir of ["CW", "CCW"] as const) {
          const next = applyMoveClone(board, side, { kind: "rotate", at: pos, dir });
          const score = evaluateBoard(next, side);
          out.push({ kind: "rotate", at: pos, dir, score });
        }
      }
    }
  }

  // Keep sorted (best first) and prune: keep all captures, then top-N of the rest
  out.sort((a, b) => b.score - a.score);

  const captures = out.filter(m => m.kind === "move" && m.capture);
  const nonCaps  = out.filter(m => !(m.kind === "move" && m.capture));

  let pruned: AIMove[] = [];
  if (PRUNE.KEEP_CAPTURES) pruned.push(...captures);

  for (const m of nonCaps) {
    if (pruned.length >= PRUNE.MOVE_LIMIT) break;
    pruned.push(m);
  }

  pruned.sort((a, b) => b.score - a.score);
  return pruned;
}

// ---------------------------------------------------------------------------
// Depth-2 lookahead (minimax with pruning + tactical overrides)
const OPP_REPLY_LIMIT_DEFAULT = PRUNE.REPLY_LIMIT;
const MOVE_LIMIT_DEFAULT = PRUNE.MOVE_LIMIT;

/**
 * Pick a move using shallow minimax (our move, then opponent reply).
 * Adds tactical overrides (snap key captures, key-threat defense) and
 * near-tie randomness to avoid robotic play.
 */
export function pickWithLookahead(
  board: Board,
  side: Player,
  opts?: { replyLimit?: number; moveLimit?: number }
): AIMove | null {
  const replyLimit = opts?.replyLimit ?? OPP_REPLY_LIMIT_DEFAULT;
  const moveLimit  = opts?.moveLimit  ?? MOVE_LIMIT_DEFAULT;

  // 0) Immediate tactic: if we can capture an enemy key right now, do it.
  const greedyAll = enumerateMoves(board, side);
  const keySnaps = greedyAll.filter(m => {
    if (m.kind !== "move" || !m.capture) return false;
    const tgt = pieceAt(board, (m as any).to);
    return !!tgt && isKeyPiece(tgt);
  });
  if (keySnaps.length) {
    keySnaps.forEach(m => (m.score += 50)); // big kicker to prioritize
    keySnaps.sort((a, b) => b.score - a.score);
    return keySnaps[0];
  }

  // 1) First-ply candidates (already pruned/sorted)
  const firstMoves = greedyAll.slice(0, moveLimit);
  if (!firstMoves.length) return null;

  // Is our key currently in danger?
  const keyThreatNow = canOppCaptureOurKey(board, side);

  type Scored = AIMove & { score: number };
  const scored: Scored[] = [];

  for (const m of firstMoves) {
    // Apply our move
    const nb = applyMoveClone(
      board,
      side,
      (m.kind === "combine"
        ? { kind: "combine", from: m.from as any, onto: (m as any).to }
        : m.kind === "move"
        ? { kind: "move", from: m.from as any, to: (m as any).to, capture: (m as any).capture }
        : { kind: "rotate", at: (m as any).at, dir: (m as any).dir }
      ) as any
    );

    // Fast terminal: opponent has no keys → insta win
    if (keysRemaining(nb, other(side)) === 0) {
      return { ...m, score: 9999 };
    }

    const baseAfterUs = evaluateBoard(nb, side);

    // Opponent replies (pruned)
    const replies = enumerateMoves(nb, other(side)).slice(0, replyLimit);

    // Opponent tries to minimize our standing:
    let worstForUs = replies.length ? Infinity : 0;
    for (const r of replies) {
      const nb2 = applyMoveClone(
        nb,
        other(side),
        (r.kind === "combine"
          ? { kind: "combine", from: r.from as any, onto: (r as any).to }
          : r.kind === "move"
          ? { kind: "move", from: r.from as any, to: (r as any).to, capture: (r as any).capture }
          : { kind: "rotate", at: (r as any).at, dir: (r as any).dir }
        ) as any
      );
      const val = evaluateBoard(nb2, side);
      if (val < worstForUs) worstForUs = val;
    }

    let score = baseAfterUs - worstForUs;

    // 2) If our key was threatened, prefer moves that remove the threat after our move.
    //    (Check threat in nb; it's enough to see if opponent *could* capture our key now.)
    if (keyThreatNow) {
      const remainsThreatened = canOppCaptureOurKey(nb, side);
      if (!remainsThreatened) score += 3.0;  // we neutralized
      else score -= 2.0;                     // we left it hanging
    }

    scored.push({ ...(m as any), score });
  }

  // Sort and apply near-tie randomization
  scored.sort((a, b) => b.score - a.score);
  return pickNearTieRandom(scored, NEAR_TIE_EPS);
}
