// src/game/moveGen.ts
import type { Board, Piece, Player } from "./rules";
import type { Coord } from "./types";
import { pieceAt, ownerOf, valueAt } from "./rules";

const DIRS: Record<string, [number, number]> = {
  N: [-1, 0],
  NE: [-1, 1],
  E: [0, 1],
  SE: [1, 1],
  S: [1, 0],
  SW: [1, -1],
  W: [0, -1],
  NW: [-1, -1],
};

export function generateKingArrowMoves(
  board: Board,
  pos: Coord,
  piece: Piece,
  val: number,
  turn: Player
) {
  const results: { type: "move" | "capture"; to: Coord }[] = [];
  if (!piece.arrowDir) return results;

  const [dr, dc] = DIRS[piece.arrowDir];

  if (val === 2) {
    // exactly two steps; mid must be empty
    const mid = { r: pos.r + dr, c: pos.c + dc };
    const dst = { r: pos.r + 2 * dr, c: pos.c + 2 * dc };
    const inBounds = (p: Coord) => p.r >= 0 && p.r < 8 && p.c >= 0 && p.c < 8;
    if (inBounds(mid) && inBounds(dst) && !pieceAt(board, mid)) {
      const t = pieceAt(board, dst);
      if (!t) {
        results.push({ type: "move", to: dst });
      } else if (ownerOf(t) !== turn && valueAt(board, dst) <= val) {
        results.push({ type: "capture", to: dst });
      }
    }
  } else if (val >= 3) {
    // slide any distance until blocked; capture first enemy if allowed
    let r = pos.r + dr, c = pos.c + dc;
    while (r >= 0 && r < 8 && c >= 0 && c < 8) {
      const q = { r, c };
      const t = pieceAt(board, q);
      if (!t) {
        results.push({ type: "move", to: q });
      } else {
        if (ownerOf(t) !== turn && valueAt(board, q) <= val) {
          results.push({ type: "capture", to: q });
        }
        break;
      }
      r += dr; c += dc;
    }
  }

  return results;
}
