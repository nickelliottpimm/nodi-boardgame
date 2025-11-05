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

export type AIMove =
  | { kind: "combine"; from: { r: number; c: number }; to: { r: number; c: number }; score: number }
  | { kind: "move"; from: { r: number; c: number }; to: { r: number; c: number }; score: number; capture?: boolean };

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
        out.push({ kind: "combine", from: pos, to, score: 20 });
      }

      // captures
      for (const to of lm.captures) {
        const tgt = pieceAt(board, to);
        const keyBonus = tgt && isKeyPiece(tgt) ? 300 : 0;
        const valBonus = 10 * (tgt ? valueAt(board, to) : 0);
        const centerBonus = 2 * (3 - Math.abs(3.5 - to.r)) + 2 * (3 - Math.abs(3.5 - to.c));
        out.push({ kind: "move", from: pos, to, capture: true, score: 150 + keyBonus + valBonus + centerBonus });
      }

      // quiet moves
      for (const to of lm.moves) {
        const vTo = valueAt(board, to);
        const centerBonus = 2 * (3 - Math.abs(3.5 - to.r)) + 2 * (3 - Math.abs(3.5 - to.c));
        const rayBonus = isKing(p) ? 5 : 0;
        out.push({ kind: "move", from: pos, to, score: 5 + 3 * vTo + centerBonus + rayBonus });
      }
    }
  }
  return out;
}
