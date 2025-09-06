// src/game/rules.ts
import { DIRS } from "./types";
import type { Coord, Dir } from "./types";

/** Players */
export type Player = "Black" | "White";

// create an empty 8×8 board
export function emptyBoard(): Board {
  return Array.from({ length: 8 }, () => Array(8).fill(null));
}


/** A single counter (token) on a piece */
export type Counter = {
  owner: Player;
  isKey?: boolean;
};

/** A board piece (single or king). Kings have 2 counters and an arrowDir. */
export type Piece = {
  counters: Counter[];      // length 1 = single; length 2 = king
  arrowDir?: Dir;           // only meaningful for kings
};

/** 8x8 board of pieces (null for empty) */
export type Board = (Piece | null)[][];

/** utils */
const inBounds = (r: number, c: number) => r >= 0 && r < 8 && c >= 0 && c < 8;

/** piece helpers */
export function pieceAt(b: Board, pos: Coord): Piece | null {
  if (!inBounds(pos.r, pos.c)) return null;
  return b[pos.r][pos.c];
}
export function isKing(p: Piece): boolean {
  return p.counters.length === 2;
}
export function ownerOf(p: Piece): Player {
  // all counters on a piece share the same owner
  return p.counters[0].owner;
}
/** identify key pieces (contain a key counter) */
export function isKeyPiece(p: Piece): boolean {
  return p.counters.some((c) => c.isKey);
}

/**
 * Ray squares for a king from `from` (NOT including origin).
 * Stops after hitting the first blocking square (which IS included).
 */
export function getRayForKing(b: Board, from: Coord): Coord[] {
  const p = pieceAt(b, from);
  if (!p || !isKing(p) || !p.arrowDir) return [];
  const [dr, dc] = DIRS[p.arrowDir];

  const out: Coord[] = [];
  let r = from.r + dr;
  let c = from.c + dc;

  while (inBounds(r, c)) {
    out.push({ r, c });
    if (pieceAt(b, { r, c })) break; // include blocker, then stop
    r += dr;
    c += dc;
  }
  return out;
}

/**
 * Ability value used for movement gating (0–3).
 * Base = number of counters (1 or 2), then ±1 for each allied/enemy ray that hits this square.
 * Self-ray does NOT count (we use getRayForKing on *other* kings only).
 * Values below 0 clamp to 0; above 3 clamp to 3 (rules say ≥3 functions as 3).
 */
export function valueAt(b: Board, pos: Coord): number {
  const p = pieceAt(b, pos);
  if (!p) return 0;

  // base from counters
  let v = p.counters.length;

  // accumulate rays from ALL kings on board (no self-boost: rays exclude origin by design)
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const q = b[r][c];
      if (!q || !isKing(q) || !q.arrowDir) continue;
      // if this ray hits 'pos', apply ±1
      const ray = getRayForKing(b, { r, c }); // no origin included
      if (ray.some((s) => s.r === pos.r && s.c === pos.c)) {
        v += ownerOf(q) === ownerOf(p) ? 1 : -1;
      }
    }
  }

  // clamp to movement ability band
  if (v <= 0) return 0;
  if (v >= 3) return 3;
  return v; // 1 or 2
}

/**
 * Basic legal destinations used by UI highlighting:
 *  - one-step moves/captures (value ≥ 1)
 *  - combines (single → adjacent friendly single) but *never* with key pieces
 *
 * King slides / scatter etc. are handled elsewhere (scatter/rotate flows).
 */
export function legalMovesFor(
  board: Board,
  from: Coord
): { moves: Coord[]; combines: Coord[]; captures: Coord[] } {
  const me = pieceAt(board, from);
  if (!me) return { moves: [], combines: [], captures: [] };

  const myOwner = ownerOf(me);
  const myVal = valueAt(board, from);

  const neigh: Coord[] = [
    { r: from.r - 1, c: from.c - 1 }, { r: from.r - 1, c: from.c     }, { r: from.r - 1, c: from.c + 1 },
    { r: from.r,     c: from.c - 1 },                                     { r: from.r,     c: from.c + 1 },
    { r: from.r + 1, c: from.c - 1 }, { r: from.r + 1, c: from.c     }, { r: from.r + 1, c: from.c + 1 },
  ];

  const moves: Coord[] = [];
  const captures: Coord[] = [];
  const combines: Coord[] = [];

  // (A) one-step moves/captures if we have at least value 1
  if (myVal >= 1) {
    for (const q of neigh) {
      if (!inBounds(q.r, q.c)) continue;
      const t = pieceAt(board, q);
      if (!t) {
        moves.push(q);
      } else {
        if (ownerOf(t) !== myOwner) {
          const tv = valueAt(board, q);
          if (tv <= myVal) captures.push(q);
        }
      }
    }
  }

  // (B) combines: only if "me" is a non-key single, onto a friendly non-key single, and we can move (value ≥ 1)
  if (myVal >= 1 && !isKing(me) && !isKeyPiece(me)) {
    for (const q of neigh) {
      if (!inBounds(q.r, q.c)) continue;
      const t = pieceAt(board, q);
      if (!t) continue;
      if (!isKing(t) && ownerOf(t) === myOwner && !isKeyPiece(t)) {
        combines.push(q);
      }
    }
  }

  return { moves, combines, captures };
}
