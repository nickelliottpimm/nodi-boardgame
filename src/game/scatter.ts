// src/game/scatter.ts
import type { Coord } from './types';
import { DIRS, inBounds } from './types';

import type { Board } from './rules';
import { pieceAt, isKing, ownerOf, valueAt } from './rules';

/** Internal: all empty squares you can slide through along `dir` starting after `from`. */
function slidePath(b: Board, from: Coord, dir: keyof typeof DIRS): Coord[] {
  const [dr, dc] = DIRS[dir];
  const out: Coord[] = [];
  let r = from.r + dr;
  let c = from.c + dc;
  while (inBounds(r, c) && !pieceAt(b, { r, c })) {
    out.push({ r, c });
    r += dr;
    c += dc;
  }
  return out;
}

/** For UI: selectable scatter bases.
 * V2: only the current square.
 * V3+: current square + any empty square you can slide to along the arrow.
 */
export function scatterBases(b: Board, from: Coord): Coord[] {
  const p = pieceAt(b, from);
  if (!p || !isKing(p) || !p.arrowDir) return [];
  const v = valueAt(b, from);
  if (v === 2) return [from];
  return [from, ...slidePath(b, from, p.arrowDir)];
}

/** Validate scatter for a king at `from`, given a chosen `base` along its arrow.
 * Landing squares are base+1 and base+2 along the arrow.
 * Allies on landing squares block. If enemies present, their TOTAL value must be <= king value.
 */
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
  const l1: Coord = { r: base.r + dr, c: base.c + dc };
  const l2: Coord = { r: base.r + 2 * dr, c: base.c + 2 * dc };

  if (!inBounds(l1.r, l1.c) || !inBounds(l2.r, l2.c)) {
    return { l1, l2, can: false, reason: 'offboard' };
  }

  const q1 = pieceAt(b, l1);
  const q2 = pieceAt(b, l2);
  const me = ownerOf(p);

  if ((q1 && ownerOf(q1) === me) || (q2 && ownerOf(q2) === me)) {
    return { l1, l2, can: false, reason: 'ally-block' };
  }

  const totalEnemyValue =
    (q1 && ownerOf(q1) !== me ? valueAt(b, l1) : 0) +
    (q2 && ownerOf(q2) !== me ? valueAt(b, l2) : 0);

  if (!q1 && !q2) return { l1, l2, can: true }; // pure split

  const can = totalEnemyValue <= v;
  return { l1, l2, can, reason: can ? undefined : 'capture-sum-exceeds' };
}
