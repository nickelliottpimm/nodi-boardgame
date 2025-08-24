// src/game/rules.ts
import type { Coord, Dir } from "./types";
import { DIRS, inBounds } from "./types";

export type Player = "White" | "Black";

export interface Counter {
  owner: Player;
  isKey?: boolean;
}

export interface Piece {
  counters: Counter[];
  arrowDir?: Dir; // if king
}

export type Board = (Piece | null)[][];

/** Create an empty 8×8 board */
export function emptyBoard(): Board {
  return Array.from({ length: 8 }, () => Array(8).fill(null));
}

export function pieceAt(b: Board, pos: Coord): Piece | null {
  return inBounds(pos.r, pos.c) ? b[pos.r][pos.c] : null;
}

export function ownerOf(p: Piece): Player {
  return p.counters[0].owner;
}

export function isKing(p: Piece): boolean {
  return p.counters.length === 2;
}

export function isEmpty(b: Board, pos: Coord): boolean {
  return !pieceAt(b, pos);
}

/** Ability value used for movement gating (0–3+) */
export function valueAt(b: Board, pos: Coord): number {
  const p = pieceAt(b, pos);
  if (!p) return 0;

  // baseline = number of counters (1 or 2)
  let v = p.counters.length;

  // TODO: apply boosts/diminishes from rays (for now just baseline)
  return Math.max(0, Math.min(3, v));
}

/** Compute values board-wide (for UI overlay) */
export function computeValues(b: Board): number[][] {
  const out: number[][] = [];
  for (let r = 0; r < 8; r++) {
    out[r] = [];
    for (let c = 0; c < 8; c++) {
      out[r][c] = valueAt(b, { r, c });
    }
  }
  return out;
}

/** Returns arrow ray squares for a king */
export function getRayForKing(b: Board, from: Coord): Coord[] {
  const p = pieceAt(b, from);
  if (!p || !isKing(p) || !p.arrowDir) return [];

  const [dr, dc] = DIRS[p.arrowDir];
  const out: Coord[] = [];
  let r = from.r + dr,
    c = from.c + dc;

  while (inBounds(r, c)) {
    out.push({ r, c });
    if (pieceAt(b, { r, c })) break; // blocked by any piece
    r += dr;
    c += dc;
  }
  return out;
}

/** Legal moves for a given piece */
export function legalMovesFor(b: Board, from: Coord) {
  const p = pieceAt(b, from);
  if (!p) return { moves: [], combines: [], captures: [], scatters: [] };

  const val = valueAt(b, from);
  const me = ownerOf(p);

  const moves: Coord[] = [];
  const combines: Coord[] = [];
  const captures: Coord[] = [];

  // V0 can't move
  if (val === 0) {
    return { moves, combines, captures, scatters: [] };
  }

  // Step 1: normal one-step moves (all dirs)
  for (const [dr, dc] of Object.values(DIRS)) {
    const r = from.r + dr,
      c = from.c + dc;
    if (!inBounds(r, c)) continue;
    const q = pieceAt(b, { r, c });
    if (!q) {
      moves.push({ r, c });
    } else if (ownerOf(q) === me && !isKing(q) && !isKing(p)) {
      combines.push({ r, c });
    } else if (ownerOf(q) !== me) {
      const theirVal = valueAt(b, { r, c });
      if (val >= theirVal) captures.push({ r, c });
    }
  }

  // Step 2: arrow-based moves if king
  if (isKing(p) && p.arrowDir) {
    const [dr, dc] = DIRS[p.arrowDir];
    if (val >= 2) {
      // V2: move 2 forward
      const r = from.r + dr * 2,
        c = from.c + dc * 2;
      if (inBounds(r, c) && !pieceAt(b, { r, c })) {
        moves.push({ r, c });
      }
    }
    if (val >= 3) {
      // V3+: slide along ray until blocked
      let r = from.r + dr,
        c = from.c + dc;
      while (inBounds(r, c)) {
        const q = pieceAt(b, { r, c });
        if (!q) {
          moves.push({ r, c });
        } else {
          const theirVal = valueAt(b, { r, c });
          if (val >= theirVal && ownerOf(q) !== me) {
            captures.push({ r, c });
          }
          break;
        }
        r += dr;
        c += dc;
      }
    }
  }

  return { moves, combines, captures, scatters: [] };
}
