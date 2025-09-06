// src/game/setupBoard.ts
import type { Board } from "./rules";

// helpers
function emptyBoard(): Board {
  return Array.from({ length: 8 }, () => Array(8).fill(null));
}
function W(isKey = false) {
  return { counters: [{ owner: "White" as const, isKey }] };
}
function B(isKey = false) {
  return { counters: [{ owner: "Black" as const, isKey }] };
}

/**
 * Desired initial layout (top row = r 0)
 *
 * Row strings legend:
 *  - 'w' = White single
 *  - 'W' = White KEY single
 *  - 'b' = Black single
 *  - 'B' = Black KEY single
 *  - '.' = empty
 *
 * Layout provided by you:
 *
 * row0: "wWwwwwWw"
 * row1: "wwwwwwww"
 * row2: "w.w.w.w."
 * row3: ".w...w.."
 * row4: "..b...b."
 * row5: ".b.b.b.b"
 * row6: "bbbbbbbb"
 * row7: "bbBbbBbb"
 */
const LAYOUT = [
  "wwWwwWww", // r0 (top)
  "wwwwwwww", // r1
  "w.w.w.w.", // r2
  ".w...w..", // r3
  "..b...b.", // r4
  ".b.b.b.b", // r5
  "bbbbbbbb", // r6
  "bbBbbBbb", // r7 (bottom)
];

export function initialBoard(): Board {
  const b = emptyBoard();
  for (let r = 0; r < 8; r++) {
    const row = LAYOUT[r];
    for (let c = 0; c < 8; c++) {
      const ch = row[c];
      if (ch === "w") b[r][c] = W(false);
      else if (ch === "W") b[r][c] = W(true);   // White key
      else if (ch === "b") b[r][c] = B(false);
      else if (ch === "B") b[r][c] = B(true);   // Black key
      else b[r][c] = null;
    }
  }
  return b;
}
