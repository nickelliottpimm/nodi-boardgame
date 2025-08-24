import type { Coord, Dir } from './types';
import { DIRS, inBounds } from './types';

// ---- Core types ----
export type Player = 'White' | 'Black';
export interface Counter { owner: Player; isKey: boolean }
export interface Piece { counters: [Counter] | [Counter, Counter]; arrowDir?: Dir }
export type Cell = { piece?: Piece }
export type Board = Cell[][]

export const isKing = (p: Piece) => p.counters.length === 2;
export const ownerOf = (p: Piece) => p.counters[0].owner;
export const pieceAt = (b: Board, pos: Coord) => b[pos.r][pos.c].piece;

// Empty 8×8 board
export function emptyBoard(): Board {
  return Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => ({} as Cell)));
}

// ---------- Rays / LOS ----------
export function raySquares(start: Coord, dir: Dir): Coord[] {
  const [dr, dc] = DIRS[dir];
  const out: Coord[] = [];
  let r = start.r + dr, c = start.c + dc;
  while (inBounds(r, c)) { out.push({ r, c }); r += dr; c += dc; }
  return out;
}

// Scatter validation: enemies on the two landing squares may be captured
// only if their TOTAL value is <= the king's current value.
// Allies on landing squares still make it illegal.
export function validateScatter(
  b: Board,
  from: Coord,
  base: Coord
): { l1: Coord; l2: Coord; can: boolean; reason?: string } {
  const p = pieceAt(b, from);
  if (!p || !isKing(p) || !p.arrowDir) return { l1: base, l2: base, can: false, reason: 'not-king' };

  const v = valueAt(b, from);
  if (v < 2) return { l1: base, l2: base, can: false, reason: 'too-low' };

  const [dr, dc] = DIRS[p.arrowDir];
  const l1 = { r: base.r + dr, c: base.c + dc };
  const l2 = { r: base.r + 2 * dr, c: base.c + 2 * dc };
  if (!inBounds(l1.r, l1.c) || !inBounds(l2.r, l2.c)) return { l1, l2, can: false, reason: 'offboard' };

  const q1 = pieceAt(b, l1);
  const q2 = pieceAt(b, l2);

  const me = ownerOf(p);

  // No allies allowed on landing squares
  if ((q1 && ownerOf(q1) === me) || (q2 && ownerOf(q2) === me)) {
    return { l1, l2, can: false, reason: 'ally-block' };
  }

  // If enemies present, their total value must be <= king value
  const totalEnemyValue =
    (q1 && ownerOf(q1) !== me ? valueAt(b, l1) : 0) +
    (q2 && ownerOf(q2) !== me ? valueAt(b, l2) : 0);

  // If no enemies at all, always allowed (pure split)
  if (!q1 && !q2) return { l1, l2, can: true };

  const can = totalEnemyValue <= v;
  return { l1, l2, can, reason: can ? undefined : 'capture-sum-exceeds' };
}


export function visibleSquares(b: Board, start: Coord, dir: Dir): Coord[] {
  const path = raySquares(start, dir);
  const out: Coord[] = [];
  for (const sq of path) {
    out.push(sq);
    if (b[sq.r][sq.c].piece) break;            // any piece (even value 0) blocks
  }
  return out;
}

// ---------- Values ----------
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const baseValue = (p: Piece) => p.counters.length;     // 1 or 2

function rayDelta(b: Board, pos: Coord): number {
  const target = pieceAt(b, pos);
  if (!target) return 0;
  let d = 0;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = b[r][c].piece;
    if (!p || !isKing(p) || !p.arrowDir) continue;
    const owner = ownerOf(p);
    const path = visibleSquares(b, { r, c }, p.arrowDir);
    if (path.some(s => s.r === pos.r && s.c === pos.c)) {
      d += owner === ownerOf(target) ? +1 : -1;
    }
  }
  return d;
}

export function computeValues(b: Board): number[][] {
  const vals = Array.from({ length: 8 }, () => Array(8).fill(0));
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = b[r][c].piece;
    if (!p) continue;
    vals[r][c] = clamp(baseValue(p) + rayDelta(b, { r, c }), 0, 3);
  }
  return vals;
}

export function valueAt(b: Board, pos: Coord): number {
  const p = pieceAt(b, pos);
  if (!p) return 0;
  return clamp(baseValue(p) + rayDelta(b, pos), 0, 3);
}

// ---------- Rotate ----------
export function canRotateInFreePhase(b: Board, pos: Coord): boolean {
  const p = pieceAt(b, pos);
  if (!p || !isKing(p)) return false;
  return valueAt(b, pos) >= 2; // must be 2+ at the instant
}

export function rotateArrow(p: Piece, dir: 'CW' | 'CCW' = 'CW') {
  if (!p.arrowDir) return;
  const order: Dir[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  let i = order.indexOf(p.arrowDir);
  i = dir === 'CW' ? (i + 1) % 8 : (i + 7) % 8;
  p.arrowDir = order[i];
}

// ---------- Legality / Moves ----------
export function legalMovesFor(b: Board, from: Coord): {
  moves: Coord[];
  combines: Coord[];
  captures: Coord[];
  scatters: any[];                 // kept for API shape; not used here
  rotations: ('CW'|'CCW'|'ANY')[];
} {
  const p = pieceAt(b, from);
  if (!p) return { moves: [], combines: [], captures: [], scatters: [], rotations: [] };

  const me = ownerOf(p);
  const myVal = valueAt(b, from);
  if (myVal <= 0) return { moves: [], combines: [], captures: [], scatters: [], rotations: [] };

  const moves: Coord[] = [];
  const combines: Coord[] = [];
  const captures: Coord[] = [];

  // helper: add 1-step destinations (8 directions)
  const STEP_DIRS = [
    [-1,  0], [-1,  1], [0, 1], [1, 1],
    [ 1,  0], [ 1, -1], [0,-1], [-1,-1]
  ] as const;

  const moverIsSingle = !isKing(p) && p.counters && p.counters.length === 1;
  const moverIsKey = moverIsSingle && !!p.counters[0].isKey;
  const moverIsSingleNonKey = moverIsSingle && !moverIsKey;

  // 1) One-step moves in any direction (all pieces with value ≥ 1)
  for (const [dr, dc] of STEP_DIRS) {
    const r = from.r + dr, c = from.c + dc;
    if (!inBounds(r, c)) continue;
    const q = pieceAt(b, { r, c });
    if (!q) {
      // empty = regular move
      moves.push({ r, c });
    } else {
      const them = ownerOf(q);
      if (them === me) {
        // ally: only allow COMBINE if mover is a single non-key and target is single non-key
        const qIsSingle = !isKing(q) && q.counters && q.counters.length === 1;
        const qIsKey = qIsSingle && !!q.counters[0].isKey;
        const qIsSingleNonKey = qIsSingle && !qIsKey;
        if (moverIsSingleNonKey && qIsSingleNonKey) {
          combines.push({ r, c });
        }
      } else {
        // enemy: capture allowed if their (current) value ≤ my value
        const theirVal = valueAt(b, { r, c });
        if (theirVal <= myVal) captures.push({ r, c });
      }
    }
  }

  // 2) King arrow-based movement
  if (isKing(p) && p.arrowDir) {
    const [dr, dc] = DIRS[p.arrowDir];

    // V2: exactly two along arrow (square 1 must be empty; land on empty or capture ≤ myVal)
    if (myVal === 2) {
      const s1 = { r: from.r + dr, c: from.c + dc };
      const s2 = { r: from.r + 2*dr, c: from.c + 2*dc };
      if (inBounds(s1.r, s1.c) && inBounds(s2.r, s2.c)) {
        const b1 = pieceAt(b, s1);
        if (!b1) {
          const b2 = pieceAt(b, s2);
          if (!b2) {
            moves.push(s2);
          } else {
            const them2 = ownerOf(b2);
            if (them2 !== me) {
              const theirVal2 = valueAt(b, s2);
              if (theirVal2 <= myVal) captures.push(s2);
            }
            // ally at s2 blocks, do nothing
          }
        }
      }
    }

    // V3+: slide any distance along arrow through empties; may capture the first blocker if enemy ≤ myVal
    if (myVal >= 3) {
      let r = from.r + dr, c = from.c + dc;
      while (inBounds(r, c)) {
        const q = pieceAt(b, { r, c });
        if (!q) {
          moves.push({ r, c });          // empty squares along the ray
          r += dr; c += dc;
          continue;
        }
        // blocker encountered
        const them = ownerOf(q);
        if (them !== me) {
          const theirVal = valueAt(b, { r, c });
          if (theirVal <= myVal) captures.push({ r, c });  // can capture the first blocker
        }
        break; // cannot go past a blocker (ally or enemy)
      }
    }
  }

  return {
    moves,
    combines,
    captures,
    scatters: [],     // scatter is handled via src/game/scatter.ts + Board.tsx
    rotations: []     // orientation handled in UI; keep empty
  };

  // King extras
  if (isKing(piece) && piece.arrowDir) {
    if (v >= 2) {
      // Move 2 along arrow
      const [dr, dc] = DIRS[piece.arrowDir];
      const s1 = { r: from.r + dr, c: from.c + dc };
      const s2 = { r: from.r + 2 * dr, c: from.c + 2 * dc };
      if (inBounds(s1.r, s1.c) && inBounds(s2.r, s2.c)) {
        if (!pieceAt(b, s1) && !pieceAt(b, s2)) {
          moves.push(s2);
        } else if (!pieceAt(b, s1) && pieceAt(b, s2) && ownerOf(pieceAt(b, s2)!) !== owner && canCapture(b, from, s2)) {
          captures.push(s2);
        }
      }
      // Scatter (two next squares in a straight line)
      scatters.push(...scat);
    }

    if (v === 3) {
      // Slide full length until blocked
      const path = slideSquares(b, from, piece.arrowDir);
      for (const sq of path) {
        if (!pieceAt(b, sq)) moves.push(sq);
        else if (ownerOf(pieceAt(b, sq)!) !== owner && canCapture(b, from, sq)) { captures.push(sq); break; }
        else break;
      }
    }
  }

  return { moves, captures, combines, scatters, rotations: ['ANY'] };
}

// Keys cannot stack; only single + single, same owner, non-key
export function canCombine(mover: Piece, target: Piece): boolean {
  return (
    mover.counters.length === 1 &&
    target.counters.length === 1 &&
    !mover.counters[0].isKey &&
    !target.counters[0].isKey &&
    ownerOf(mover) === ownerOf(target)
  );
}

export function canCapture(b: Board, from: Coord, to: Coord): boolean {
  const atkP = pieceAt(b, from);
  const defP = pieceAt(b, to);
  if (!atkP || !defP) return false;
  if (ownerOf(atkP) === ownerOf(defP)) return false;
  const atk = valueAt(b, from);
  const def = valueAt(b, to);
  return atk >= def; // attacker wins ties
}

export function getRayForKing(b: Board, pos: Coord) {
  const p = pieceAt(b, pos);
  if (!p || !isKing(p) || !p.arrowDir) return { segments: [] as { r: number; c: number; boost?: boolean; diminish?: boolean }[] };
  const owner = ownerOf(p);
  const path = visibleSquares(b, pos, p.arrowDir);
  const segments = path.map(sq => {
    const q = pieceAt(b, sq);
    return {
      r: sq.r, c: sq.c,
      boost: !!q && ownerOf(q) === owner,
      diminish: !!q && ownerOf(q) !== owner
    };
  });
  return { segments };
}

export function slideSquares(b: Board, from: Coord, dir: Dir): Coord[] {
  const out: Coord[] = [];
  const [dr, dc] = DIRS[dir];
  let r = from.r + dr, c = from.c + dc;
  while (inBounds(r, c) && !b[r][c].piece) { out.push({ r, c }); r += dr; c += dc; }
  return out;
}

export function scatterTargets(b: Board, from: Coord, piece: Piece): { base: Coord, l1: Coord, l2: Coord }[] {
  const dir = piece.arrowDir!;
  const [dr, dc] = DIRS[dir];
  const v = valueAt(b, from); // clamped 0..3
  const bases: Coord[] = (v === 2) ? [from] : [from, ...slideSquares(b, from, dir)];
  const results: { base: Coord, l1: Coord, l2: Coord }[] = [];

  for (const base of bases) {
    const a = { r: base.r + dr, c: base.c + dc };
    const b2 = { r: base.r + 2 * dr, c: base.c + 2 * dc };
    if (!inBounds(a.r, a.c) || !inBounds(b2.r, b2.c)) continue;

    const cells = [a, b2];
    let ok = true;
    let budget = v;
    for (const sq of cells) {
      const tp = pieceAt(b, sq);
      if (!tp) continue;
      if (ownerOf(tp) === ownerOf(piece)) { ok = false; break; }
      const defV = valueAt(b, sq);
      budget -= defV;
      if (budget < 0) { ok = false; break; }
    }
    if (!ok) continue;

    results.push({ base, l1: a, l2: b2 });
  }
// --- Scatter helpers used by Board.tsx ---

/** For UI: which base squares are selectable for scatter?
 * V2: only the current square. V3+: any empty square you can slide to along the arrow (plus current).
 */

/** Validate scatter for a king at `from`, using a chosen `base` along its arrow.
 * Landing squares are base+1 and base+2 along the arrow.
 * Allies on landing squares block. If enemies present, their TOTAL value must be <= king value.
 */


  // If enemies present, total enemy value must be <= king value
  const totalEnemyValue =
    (q1 && ownerOf(q1) !== me ? valueAt(b, l1) : 0) +
    (q2 && ownerOf(q2) !== me ? valueAt(b, l2) : 0);

  if (!q1 && !q2) return { l1, l2, can: true }; // pure split is always allowed

  const can = totalEnemyValue <= v;
  return { l1, l2, can, reason: can ? undefined : 'capture-sum-exceeds' };
}
