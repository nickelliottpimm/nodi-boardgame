// src/engine/greedy.ts
import type { Board, Player } from "../game/rules";
import {
  pieceAt,
  legalMovesFor,
  valueAt,
  isKeyPiece,
  ownerOf,
  isKing,
  getRayForKing,
} from "../game/rules";
import { scatterBases, validateScatter } from "../game/scatter";

// ---------------------------------------------------------------------------
// Types (+ rotate + scatter)
export type AIMove =
  | { kind: "combine"; from: { r: number; c: number }; to: { r: number; c: number }; score: number }
  | { kind: "move"; from: { r: number; c: number }; to: { r: number; c: number }; score: number; capture?: boolean }
  | { kind: "rotate"; at: { r: number; c: number }; dir: "CW" | "CCW"; score: number }
  | { kind: "scatter"; from: { r: number; c: number }; l1: { r: number; c: number }; l2: { r: number; c: number }; score: number };

// ---------------------------------------------------------------------------
// Small helpers
type AllDir = "N"|"NE"|"E"|"SE"|"S"|"SW"|"W"|"NW";
const DIR_ORDER: AllDir[] = ["N","NE","E","SE","S","SW","W","NW"];
const ADJ: [number, number][] = [
  [-1,-1],[-1,0],[-1,1],
  [ 0,-1],       [ 0,1],
  [ 1,-1],[ 1,0],[ 1,1],
];

const other = (p: Player): Player => (p === "Black" ? "White" : "Black");

function cloneBoard(b: Board): Board {
  return b.map(row =>
    row.map(cell =>
      cell ? { counters: [...cell.counters], arrowDir: cell.arrowDir } : null
    )
  );
}

function inBounds(r: number, c: number) {
  return r >= 0 && r < 8 && c >= 0 && c < 8;
}

function keysRemaining(board: Board, side: Player): number {
  let n = 0;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = pieceAt(board, { r, c });
    if (p && ownerOf(p) === side && isKeyPiece(p)) n++;
  }
  return n;
}

function keySquares(board: Board, side: Player): Array<{ r: number; c: number }> {
  const ks: Array<{ r: number; c: number }> = [];
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = pieceAt(board, { r, c });
    if (p && isKeyPiece(p) && ownerOf(p) === side) ks.push({ r, c });
  }
  return ks;
}

function canSideCaptureSquare(board: Board, side: Player, target: { r: number; c: number }): boolean {
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

function canWeCaptureEnemyKey(board: Board, me: Player): boolean {
  const oppKeys = keySquares(board, other(me));
  if (oppKeys.length === 0) return true;
  for (const k of oppKeys) {
    if (canSideCaptureSquare(board, me, k)) return true;
  }
  return false;
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

function adjacentFriends(board: Board, side: Player, pos: { r: number; c: number }): number {
  let n = 0;
  for (const [dr, dc] of ADJ) {
    const rr = pos.r + dr, cc = pos.c + dc;
    if (!inBounds(rr, cc)) continue;
    const p = pieceAt(board, { r: rr, c: cc });
    if (p && ownerOf(p) === side) n++;
  }
  return n;
}

// --- piece “importance” (used for capture/recapture heuristics)
function importanceAt(board: Board, pos: { r: number; c: number }): number {
  const p = pieceAt(board, pos);
  if (!p) return 0;
  if (isKeyPiece(p)) return 3.2;
  if (isKing(p))    return 2.2;
  return 1.0;
}

// Apply a hypothetical move to a cloned board
function applyMoveClone(
  board: Board,
  side: Player,
  m:
    | { kind: "move"; from: { r: number; c: number }; to: { r: number; c: number }; capture?: boolean }
    | { kind: "combine"; from: { r: number; c: number }; onto: { r: number; c: number } }
    | { kind: "rotate"; at: { r: number; c: number }; dir: "CW" | "CCW" }
    | { kind: "scatter"; from: { r: number; c: number }; l1: { r: number; c: number }; l2: { r: number; c: number } }
): Board {
  void side;
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
    if (!p) return next;
    if (!isKing(p) || !(p as any).arrowDir) return next;
    const idx = DIR_ORDER.indexOf((p as any).arrowDir as AllDir);
    const nextDir = m.dir === "CW" ? DIR_ORDER[(idx + 1) % 8] : DIR_ORDER[(idx + 7) % 8];
    (p as any).arrowDir = nextDir;
    return next;
  }

  if (m.kind === "scatter") {
    const src = pieceAt(next, m.from);
    if (!src || !isKing(src)) return next;
    const own = ownerOf(src);
    next[m.from.r][m.from.c] = null;
    const t1 = pieceAt(next, m.l1);
    const t2 = pieceAt(next, m.l2);
    if (t1 && ownerOf(t1) !== own) next[m.l1.r][m.l1.c] = null;
    if (t2 && ownerOf(t2) !== own) next[m.l2.r][m.l2.c] = null;
    next[m.l1.r][m.l1.c] = { counters: [{ owner: own }] };
    next[m.l2.r][m.l2.c] = { counters: [{ owner: own }] };
    return next;
  }

  return next;
}

// --- immediate danger probe (blunder/recapture check)
function immediateCapturePenalty(
  boardAfter: Board,
  sideJustMoved: Player,
  squaresToCheck: Array<{ r: number; c: number }>
): number {
  const opp = other(sideJustMoved);
  let penalty = 0;
  for (const s of squaresToCheck) {
    if (canSideCaptureSquare(boardAfter, opp, s)) {
      const imp = importanceAt(boardAfter, s);
      const def = adjacentFriends(boardAfter, sideJustMoved, s);
      const damp = 1 / (1 + 0.6 * def);
      penalty += 1.6 * imp * damp;
    }
  }
  return penalty;
}

// If opponent can recapture landing square *and then we can recapture back*,
// reduce fear (trade-up sequences are often fine).
function recaptureRelief(
  boardAfterOurCapture: Board,
  us: Player,
  landing: { r: number; c: number }
): boolean {
  const opp = other(us);
  if (!canSideCaptureSquare(boardAfterOurCapture, opp, landing)) return false;
  return canSideCaptureSquare(boardAfterOurCapture, us, landing);
}

// --- approaching threat maps (for eval)
type Map8 = number[][];
function makeZeroMap(): Map8 { return Array.from({ length: 8 }, () => Array(8).fill(0)); }

function buildThreatMaps(board: Board, attacker: Player): { cap: Map8; prox: Map8 } {
  const cap = makeZeroMap();
  const prox = makeZeroMap();

  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const pos = { r, c };
    const p = pieceAt(board, pos);
    if (!p || ownerOf(p) !== attacker) continue;
    const lm = legalMovesFor(board, pos);

    for (const to of lm.captures) cap[to.r][to.c] += 1;
    for (const set of [lm.moves, lm.combines]) {
      for (const to of set) {
        for (const [dr, dc] of ADJ) {
          const rr = to.r + dr, cc = to.c + dc;
          if (inBounds(rr, cc)) prox[rr][cc] += 1;
        }
      }
    }
  }
  return { cap, prox };
}

// ---------------------------------------------------------------------------
// Position evaluator
function evaluateBoard(board: Board, me: Player): number {
  let score = 0;

  const opp = other(me);
  const oppMaps = buildThreatMaps(board, opp);
  const ourMaps = buildThreatMaps(board, me);

  // Material / keys / value / ray presence + threat modifiers
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const pos = { r, c };
    const p = pieceAt(board, pos);
    if (!p) continue;

    const mine = ownerOf(p) === me;
    const sign = mine ? 1 : -1;

    // Material
    score += sign * (isKing(p) ? 3 : 1);

    // Keys
    if (isKeyPiece(p)) score += sign * 5;

    // Effective value
    score += sign * (valueAt(board, pos) * 0.25);

    // Ray presence nudge
    if (isKing(p) && (p as any).arrowDir) score += sign * 0.15;

    // Threat pressure
    const nowCap = mine ? oppMaps.cap[r][c] : ourMaps.cap[r][c];
    const nowProx = mine ? oppMaps.prox[r][c] : ourMaps.prox[r][c];
    const imp = isKeyPiece(p) ? 1.8 : isKing(p) ? 1.2 : 0.8;
    score += sign * (-0.50 * nowCap * imp);
    score += sign * (-0.24 * nowProx * imp);
  }

  // Node coverage: ≥2 rays
  const coverMe = new Map<string, number>();
  const coverOp = new Map<string, number>();
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const pos = { r, c };
    const p = pieceAt(board, pos);
    if (!p || !isKing(p) || !(p as any).arrowDir) continue;
    const ray = getRayForKing(board, pos);
    const m = ownerOf(p) === me ? coverMe : coverOp;
    for (const sq of ray) {
      const key = `${sq.r},${sq.c}`;
      m.set(key, (m.get(key) ?? 0) + 1);
    }
  }
  for (const [, n] of coverMe) if (n >= 2) score += 0.4;
  for (const [, n] of coverOp) if (n >= 2) score -= 0.4;

  // Mobility + capture availability
  let myMoves = 0, opMoves = 0, myCaps = 0, opCaps = 0;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const pos = { r, c };
    const p = pieceAt(board, pos);
    if (!p) continue;
    const lm = legalMovesFor(board, pos);
    if (ownerOf(p) === me) {
      myMoves += lm.moves.length + lm.combines.length + lm.captures.length;
      myCaps  += lm.captures.length;
    } else {
      opMoves += lm.moves.length + lm.combines.length + lm.captures.length;
      opCaps  += lm.captures.length;
    }
  }
  score += 0.10 * (myMoves - opMoves);
  score += 0.30 * (myCaps - opCaps);

  if (canWeCaptureEnemyKey(board, me)) score += 1.8;
  if (canOppCaptureOurKey(board, me)) score -= 3.4;

  if (keysRemaining(board, other(me)) === 0) score += 1000;

  return score;
}

// ---------------------------------------------------------------------------
// Main: enumerate and score candidates
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
        const nb = applyMoveClone(board, side, { kind: "combine", from: pos, onto: to });
        const base = evaluateBoard(nb, side);
        const risk = immediateCapturePenalty(nb, side, [to]);
        const def = adjacentFriends(nb, side, to);
        const score = base + 0.6 + 0.12 * def - 2.2 * risk;
        out.push({ kind: "combine", from: pos, to, score });
      }

      // captures (HEAVILY reward king captures + soften fear)
      for (const to of lm.captures) {
        const tgtBefore = pieceAt(board, to);
        const nb = applyMoveClone(board, side, { kind: "move", from: pos, to, capture: true });

        const base = evaluateBoard(nb, side);

        const tookKey   = !!(tgtBefore && isKeyPiece(tgtBefore));
        const tookKing  = !!(tgtBefore && isKing(tgtBefore));
        const tookVal   = tgtBefore ? valueAt(board, to) : 0;

        // Stronger bias to grab kings/keys
        let capBonus =
          3.2 +                                // generic capture bonus (up from 2.6)
          (tookKey ? 5.2 : 0) +                // keys = prime targets
          (tookKing ? 4.8 : 0) +               // BIG boost for king captures
          0.18 * tookVal +                     // value of target
          0.06 * ((3 - Math.abs(3.5 - to.r)) + (3 - Math.abs(3.5 - to.c)));

        // Recapture risk at landing
        let recPenalty = 0;
        if (canSideCaptureSquare(nb, other(side), to)) {
          const lossImp = importanceAt(nb, to);                 // lose our mover if recaptured
          const def     = adjacentFriends(nb, side, to);
          const damp    = 1 / (1 + 0.6 * def);
          recPenalty = 1.4 * lossImp * damp;                    // slightly softer baseline

          // If we just took a king/key, be much braver
          if (tookKing) recPenalty *= 0.35;
          else if (tookKey) recPenalty *= 0.5;

          // If we can recapture back on that square, be braver again
          if (recaptureRelief(nb, side, to)) recPenalty *= 0.6;

          // If we traded up on "importance", reduce penalty a touch
          const moverWasKing = isKing(p);
          const moverImp = moverWasKing ? 2.2 : isKeyPiece(p) ? 3.2 : 1.0;
          const targetImp = tookKey ? 3.2 : tookKing ? 2.2 : 1.0;
          if (targetImp > moverImp) recPenalty *= 0.8;
        }

        // Tactical override: king/key captures get a big shove so they win ties
        if (tookKing) capBonus += 6.0;
        else if (tookKey) capBonus += 3.5;

        const score = base + capBonus - recPenalty;
        out.push({ kind: "move", from: pos, to, capture: true, score });
      }

      // quiet moves
      for (const to of lm.moves) {
        const nb = applyMoveClone(board, side, { kind: "move", from: pos, to });
        const base = evaluateBoard(nb, side);
        const center = 0.05 * ((3 - Math.abs(3.5 - to.r)) + (3 - Math.abs(3.5 - to.c)));
        const risk = immediateCapturePenalty(nb, side, [to]);
        let kingStepPenalty = 0;
        if (isKing(p) && canSideCaptureSquare(nb, other(side), to)) kingStepPenalty = 0.5;
        const score = base + center - 1.0 * risk - kingStepPenalty;
        out.push({ kind: "move", from: pos, to, score });
      }

      // free-rotation at value >= 3
      if (isKing(p) && (p as any).arrowDir && valueAt(board, pos) >= 3) {
        for (const dir of ["CW", "CCW"] as const) {
          const nb = applyMoveClone(board, side, { kind: "rotate", at: pos, dir });
          const base = evaluateBoard(nb, side);
          const risk = immediateCapturePenalty(nb, side, [pos]);
          const score = base - 0.6 * risk;
          out.push({ kind: "rotate", at: pos, dir, score });
        }
      }

      // scatter (value >= 2)
      if (isKing(p) && (p as any).arrowDir && valueAt(board, pos) >= 2) {
        const bases = scatterBases(board, pos);
        for (const basePos of bases) {
          const v = validateScatter(board, pos, basePos);
          if (!v?.can) continue;
          const nb = applyMoveClone(board, side, { kind: "scatter", from: pos, l1: v.l1, l2: v.l2 });
          const baseEval = evaluateBoard(nb, side);
          const risk = immediateCapturePenalty(nb, side, [v.l1, v.l2]);
          const score = baseEval + 0.15 - 0.9 * risk;
          out.push({ kind: "scatter", from: pos, l1: v.l1, l2: v.l2, score });
        }
      }
    }
  }

  out.sort((a, b) => b.score - a.score);
  return out.slice(0, 32);
}

// ---------------------------------------------------------------------------
// Depth-2 lookahead (minimax with pruning)
const OPP_REPLY_LIMIT_DEFAULT = 6;
const MOVE_LIMIT_DEFAULT = 24;

export function pickWithLookahead(
  board: Board,
  side: Player,
  opts?: { replyLimit?: number; moveLimit?: number }
): AIMove | null {
  const replyLimit = opts?.replyLimit ?? OPP_REPLY_LIMIT_DEFAULT;
  const moveLimit  = opts?.moveLimit  ?? MOVE_LIMIT_DEFAULT;

  const firstMoves = enumerateMoves(board, side).slice(0, moveLimit);
  if (!firstMoves.length) return null;

  let bestMove: AIMove | null = null;
  let bestScore = -Infinity;

  for (const m of firstMoves) {
    const nb = applyMoveClone(board, side, (m.kind === "combine"
      ? { kind: "combine", from: m.from as any, onto: (m as any).to }
      : m.kind === "move"
      ? { kind: "move", from: m.from as any, to: (m as any).to, capture: (m as any).capture }
      : m.kind === "rotate"
      ? { kind: "rotate", at: (m as any).at, dir: (m as any).dir }
      : { kind: "scatter", from: (m as any).from, l1: (m as any).l1, l2: (m as any).l2 }
    ) as any);

    // If we just captured their last key, snap-pick
    if (keysRemaining(nb, other(side)) === 0) {
      return { ...m, score: 9999 };
    }

    const baseAfterUs = evaluateBoard(nb, side);
    const replies = enumerateMoves(nb, other(side)).slice(0, replyLimit);

    // Opponent tries to minimize our standing
    let worstForUs = replies.length ? Infinity : 0;
    for (const r of replies) {
      const nb2 = applyMoveClone(nb, other(side), (r.kind === "combine"
        ? { kind: "combine", from: r.from as any, onto: (r as any).to }
        : r.kind === "move"
        ? { kind: "move", from: r.from as any, to: (r as any).to, capture: (r as any).capture }
        : r.kind === "rotate"
        ? { kind: "rotate", at: (r as any).at, dir: (r as any).dir }
        : { kind: "scatter", from: (r as any).from, l1: (r as any).l1, l2: (r as any).l2 }
      ) as any);
      const val = evaluateBoard(nb2, side);
      if (val < worstForUs) worstForUs = val;
    }

    // Tactical preference: if `m` captured a king, shove the minimax score up
    let tactical = 0;
    if (m.kind === "move" && m.capture) {
      const tgtWas = pieceAt(board, (m as any).to);
      if (tgtWas && isKing(tgtWas)) tactical += 5.0;
      if (tgtWas && isKeyPiece(tgtWas)) tactical += 2.5;
    }

    const minimaxScore = baseAfterUs - worstForUs + tactical;
    if (minimaxScore > bestScore) {
      bestScore = minimaxScore;
      bestMove = { ...(m as any), score: minimaxScore };
    }
  }

  return bestMove;
}
