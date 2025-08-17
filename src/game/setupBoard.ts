// src/game/setupBoard.ts
import { emptyBoard } from './rules';
import type { Board, Counter } from './rules';

/** Tokens:
 * '.' empty | 'w' white | 'W' white KEY | 'b' black | 'B' black KEY
 * Row 0 = top, Col 0 = left
 */
const LAYOUT: string[] = [
  // row 0 (top)
  "wwWwwWww",

  // row 1
  "wwwwwwww",

  // row 2
  "w.w.w.w.",

  // row 3
  ".w...w..",

  // row 4
  "..b...b.",

  // row 5
  ".b.b.b.b",

  // row 6
  "bbbbbbbb",

  // row 7 (bottom)
  "bbBbbBbb",
];

export function initialBoard(): Board {
  const b = emptyBoard();
  const strip = (s: string) => s.replace(/[^.wWbB]/g, '');
  const rows = LAYOUT.map(strip);
  if (rows.length !== 8 || rows.some(r => r.length !== 8)) {
    console.warn('[setupBoard] LAYOUT must be 8 rows × 8 cols using . w W b B');
    return b;
  }
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const ch = rows[r][c];
      if (ch === '.') continue;
      const isWhite = ch === 'w' || ch === 'W';
      const isKey   = ch === 'W' || ch === 'B';
      const counter: Counter = { owner: isWhite ? 'White' : 'Black', isKey };
      b[r][c].piece = { counters: [counter] };
    }
  }
  return b;
}
