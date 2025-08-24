// src/game/setupBoard.ts
import { emptyBoard } from './rules';
import type { Board, Piece, Player } from './rules';

// Your requested layout:
const LAYOUT = [
  "wwWwwWww", // row 0 (top)
  "wwwwwwww", // row 1
  "w.w.w.w.", // row 2
  ".w...w..", // row 3
  "..b...b.", // row 4
  ".b.b.b.b", // row 5
  "bbbbbbbb", // row 6
  "bbBbbBbb"  // row 7 (bottom)
];

function makeSingle(owner: Player, isKey = false): Piece {
  return { counters: [{ owner, isKey }] };
}

export function initialBoard(): Board {
  const b = emptyBoard();
  for (let r = 0; r < 8; r++) {
    const row = LAYOUT[r];
    for (let c = 0; c < 8; c++) {
      const ch = row[c];
      if (ch === '.') { b[r][c] = null; continue; }
      if (ch === 'w') { b[r][c] = makeSingle('White'); continue; }
      if (ch === 'W') { b[r][c] = makeSingle('White', true); continue; }
      if (ch === 'b') { b[r][c] = makeSingle('Black'); continue; }
      if (ch === 'B') { b[r][c] = makeSingle('Black', true); continue; }
    }
  }
  return b;
}
