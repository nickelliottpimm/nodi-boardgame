// src/game/scatter.ts
import { DIRS } from "./types";
import type { Coord } from "./types";
import { pieceAt, isKing, ownerOf, valueAt } from "./rules";

/** simple bounds check */
const inBounds = (r: number, c: number) => r >= 0 && r < 8 && c >= 0 && c < 8;

/**
 * Bases a king may scatter from.
 * V2: only the current square.
 * V3+: current square + any empty square you can slide to along the arrow (stop before first blocker).
 */
export function scatterBases(b: any, from: Coord): Coord[] {
  const me = pieceAt(b, from);
  if (!me || !isKing(me) || !me.arrowDir) return [];
  const v = valueAt(b, from);
  const bases: Coord[] = [from]; // always include current

  if (v >= 3) {
    const [dr, dc] = DIRS[me.arrowDir];
    let r = from.r + dr;
    let c = from.c + dc;
    while (inBounds(r, c)) {
      if (pieceAt(b, { r, c })) break; // cannot slide past a blocker
      bases.push({ r, c });
      r += dr;
      c += dc;
    }
  }
  return bases;
}

/**
 * Validate the scatter from a given base.
 * Returns a non-null object with landing squares and can/reason.
 *
 * Rules implemented:
 * - Two landings are exactly the next two squares from the base along the arrow.
 * - Landings must be on-board.
 * - You cannot land on a friendly piece.
 * - Captures: allowed if the sum of enemy values on the two landing squares <= king's current value.
 *   (For V2 specifically, that implies each enemy is value 1 at most, matching your earlier note.)
 */
export function validateScatter(
  b: any,
  from: Coord,
  base: Coord
): { l1: Coord; l2: Coord; can: boolean; reason?: string } {
  const me = pieceAt(b, from);
  if (!me || !isKing(me) || !me.arrowDir) {
    return { l1: from, l2: from, can: false, reason: "Not a king with an arrow." };
  }
  const myVal = valueAt(b, from);
  if (myVal < 2) {
    return { l1: from, l2: from, can: false, reason: "Value < 2 cannot scatter." };
  }

  // V2: base must be the king's current square.
  if (myVal === 2 && (base.r !== from.r || base.c !== from.c)) {
    return { l1: from, l2: from, can: false, reason: "V2 can only scatter from current square." };
  }

  // If V3+, ensure base is either current or reachable by sliding (but we leave that to scatterBases check).
  // Now compute the two landing squares from base.
  const [dr, dc] = DIRS[me.arrowDir];
  const l1 = { r: base.r + dr, c: base.c + dc };
  const l2 = { r: base.r + 2 * dr, c: base.c + 2 * dc };

  if (!inBounds(l1.r, l1.c) || !inBounds(l2.r, l2.c)) {
    return { l1, l2, can: false, reason: "Landing squares out of bounds." };
  }

  const t1 = pieceAt(b, l1);
  const t2 = pieceAt(b, l2);

  // Cannot land on friendly pieces.
  if ((t1 && ownerOf(t1) === ownerOf(me)) || (t2 && ownerOf(t2) === ownerOf(me))) {
    return { l1, l2, can: false, reason: "Cannot land on friendly piece." };
  }

  // Compute capture budget: sum of enemy values on the two landings
  let enemySum = 0;
  if (t1 && ownerOf(t1) !== ownerOf(me)) enemySum += valueAt(b, l1);
  if (t2 && ownerOf(t2) !== ownerOf(me)) enemySum += valueAt(b, l2);

  // For V2, your earlier special case was: may take two opposing pieces each with value 1 on the next two squares.
  // The general (updated) rule says: sum of enemy values <= myVal.
  // That subsumes the V2 case (since myVal=2), and allows mixes like (1 + 0) or (0 + 2) only if equal/under.
  if (enemySum > myVal) {
    return { l1, l2, can: false, reason: "Capture exceeds king value." };
  }

  return { l1, l2, can: true };
}
