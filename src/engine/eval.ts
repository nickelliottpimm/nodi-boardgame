// src/engine/eval.ts
import type { Board } from "../game/rules";
import {
  pieceAt,
  ownerOf,
  isKing,
  valueAt,
  legalMovesFor,
} from "../game/rules";

// Simple 8x8 center bonus table (small nudges toward central control)
const CENTER_BONUS: number[][] = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [0, 1, 1, 1, 1, 1, 1, 0],
  [0, 1, 2, 2, 2, 2, 1, 0],
  [0, 1, 2, 3, 3, 2, 1, 0],
  [0, 1, 2, 3, 3, 2, 1, 0],
  [0, 1, 2, 2, 2, 2, 1, 0],
  [0, 1, 1, 1, 1, 1, 1, 0],
  [0, 0, 0, 0, 0, 0, 0, 0],
];

// Positive = good for 'me', negative = good for opponent.
export function evalFor(board: Board, me: "Black" | "White"): number {
  let score = 0;
  let myMoves = 0;
  let theirMoves = 0;

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = pieceAt(board, { r, c });
      if (!p) continue;
      const side = ownerOf(p);
      const sign = side === me ? 1 : -1;

      // (1) Base = clamped ability value (0..3)
      let v = valueAt(board, { r, c }); // your rules already clamp 0..3

      // (2) Structure bonus (kings project rays / options)
      if (isKing(p)) v += 1.2; // slightly > single

      // (3) Centrality (very small)
      v += 0.15 * CENTER_BONUS[r][c];

      score += sign * v;

      // (4) Mobility (tiny): how many 1-step options exist from here
      const { moves, captures, combines } = legalMovesFor(board, { r, c });
      const mob = moves.length + captures.length + combines.length * 0.8;
      if (side === me) myMoves += mob;
      else theirMoves += mob;
    }
  }

  // Mobility term
  score += 0.1 * (myMoves - theirMoves);

  return score;
}
