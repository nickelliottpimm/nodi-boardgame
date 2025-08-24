// src/game/scatter.ts
import type { Coord } from './types';
import { DIRS, inBounds } from './types';
import { pieceAt, isKing, ownerOf, valueAt, isEmpty } from './rules';
import type { Board } from './rules';

/** Valid bases a king can scatter from.
 *  V2: only current square. V3+: current + any empty square slideable along arrow.
 */
export function scatterBases(b: Board, from: Coord): Coord[] {
  const p = pieceAt(b, from);
  if (!p || !isKing(p) || !p.arrowDir) return [];
  const v = valueAt(b, from);
  const out: Coord[] = [from];
  if (v < 3) return out;

  const [dr, dc] = DIRS[p.arrowDir];
  let r = from.r + dr, c = from.c + dc;
  while (inBounds(r, c) && isEmpty(b, { r, c })) {
    out.push({ r, c });
    r += dr; c += dc;
  }
  return out;
}

/** Given a base, compute l1/l2 (next two along arrow) and whether scatter is legal. */
export function validateScatter(
  b: Board,
  from: Coord,
  base: Coord
): { l1: Coord; l2: Coord; can: boolean; reason?: string } {
  const me = pieceAt(b, from);
  if (!me || !isKing(me) || !me.arrowDir) return { l1: base, l2: base, can: false, reason: 'Not a king' };

  const [dr, dc] = DIRS[me.arrowDir];
  const l1 = { r: base.r + dr, c: base.c + dc };
  const l2 = { r: base.r + 2*dr, c: base.c + 2*dc };

  if (!inBounds(l1.r, l1.c) || !inBounds(l2.r, l2.c)) {
    return { l1, l2, can: false, reason: 'Off board' };
  }

  const q1 = pieceAt(b, l1);
  const q2 = pieceAt(b, l2);

  if (q1 && ownerOf(q1) === ownerOf(me)) return { l1, l2, can: false, reason: 'Ally on l1' };
  if (q2 && ownerOf(q2) === ownerOf(me)) return { l1, l2, can: false, reason: 'Ally on l2' };

  // Budget: enemies total value <= king's current value (ability tier)
  const myVal = valueAt(b, from);
  let enemySum = 0;
  if (q1 && ownerOf(q1) !== ownerOf(me)) enemySum += valueAt(b, l1);
  if (q2 && ownerOf(q2) !== ownerOf(me)) enemySum += valueAt(b, l2);
  if (enemySum > myVal) return { l1, l2, can: false, reason: 'Over budget' };

  return { l1, l2, can: true };
}
