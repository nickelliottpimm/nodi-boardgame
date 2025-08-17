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
export function legalMovesFor(b: Board, from: Coord) {
  const piece = pieceAt(b, from);
  if (!piece) return { moves: [], captures: [], combines: [], scatters: [], rotations: [] as ('CW'|'CCW'|'ANY')[] };

  const owner = ownerOf(piece);
  const v = valueAt(b, from);

  // 🚫 value-0 pieces cannot act at all
  if (v === 0) {
    return { moves: [], captures: [], combines: [], scatters: [], rotations: [] as ('CW'|'CCW'|'ANY')[] };
  }

  const moves: Coord[] = [];
  const captures: Coord[] = [];
  const combines: Coord[] = [];
  const scatters: { base: Coord, l1: Coord, l2: Coord }[] = [];

  const deltas = Object.values(DIRS);
  // 1-step move / capture / combine
  for (const [dr, dc] of deltas) {
    const to = { r: from.r + dr, c: from.c + dc };
    if (!inBounds(to.r, to.c)) continue;
    const tp = pieceAt(b, to);
    if (!tp) {
      moves.push(to);
    } else if (ownerOf(tp) === owner) {
      if (canCombine(piece, tp)) combines.push(to);
    } else {
      if (canCapture(b, from, to)) captures.push(to);
    }
  }

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
      const scat = scatterTargets(b, from, piece);
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
  return results;
}
