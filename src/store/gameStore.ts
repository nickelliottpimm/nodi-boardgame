// src/store/gameStore.ts
import { create } from "zustand";
import type { Board, Piece, Player } from "../game/rules";
import { pieceAt, isKing, ownerOf, valueAt, isKeyPiece } from "../game/rules";
import type { Coord } from "../game/types";
import { initialBoard } from "../game/setupBoard";
import { generateKingArrowMoves } from "../game/moveGen";

// small helpers
const inBounds = (r: number, c: number) => r >= 0 && r < 8 && c >= 0 && c < 8;
const ADJ: [number, number][] = [
  [-1, -1], [-1, 0], [-1, 1],
  [ 0, -1],          [ 0, 1],
  [ 1, -1], [ 1, 0], [ 1, 1],
];
const DIR_FROM_DELTA: Record<string, "N"|"NE"|"E"|"SE"|"S"|"SW"|"W"|"NW"> = {
  "-1,0": "N", "-1,1": "NE", "0,1": "E", "1,1": "SE",
  "1,0": "S", "1,-1": "SW", "0,-1": "W", "-1,-1": "NW",
};
const DIR_ORDER: ("N"|"NE"|"E"|"SE"|"S"|"SW"|"W"|"NW")[] =
  ["N","NE","E","SE","S","SW","W","NW"];
const nextCW = (d: typeof DIR_ORDER[number]) =>
  DIR_ORDER[(DIR_ORDER.indexOf(d) + 1) % 8];

export type Highlight = { type: "move" | "combine" | "capture" | "scatter"; to: Coord };

type GameState = {
  board: Board;
  turn: Player; // "Black" | "White"
  selected: Coord | null;
  highlights: Highlight[];

  // actions
  select: (pos: Coord | null) => void;
  actMove: (from: Coord, to: Coord, isCapture?: boolean) => void;
  actCombine: (from: Coord, onto: Coord) => void;
  actRotateArrow: (pos: Coord, dir: "CW" | "CCW", consumeTurn?: boolean) => void;
  actScatter: (from: Coord, l1: Coord, l2: Coord) => void;
  endTurn: () => void;
};

export const useGame = create<GameState>((set, get) => ({
  board: initialBoard(),
  turn: "Black", // Black starts
  selected: null,
  highlights: [],

  select: (pos) => {
    const { board, turn } = get();

    if (!pos) {
      set({ selected: null, highlights: [] });
      return;
    }
    const me = pieceAt(board, pos);
    if (!me || ownerOf(me) !== turn) {
      set({ selected: null, highlights: [] });
      return;
    }

    const val = valueAt(board, pos);
    const hs: Highlight[] = [];

    // 1-step moves / captures / combines
    if (val >= 1) {
      for (const [dr, dc] of ADJ) {
        const r = pos.r + dr, c = pos.c + dc;
        if (!inBounds(r, c)) continue;
        const tPos = { r, c };
        const t = pieceAt(board, tPos);
        if (!t) {
          hs.push({ type: "move", to: tPos });
        } else {
          const tOwner = ownerOf(t);
          if (tOwner === turn) {
            // combine only if both are singles and NOT keys
            if (!isKing(me) && !isKeyPiece(me) && !isKing(t) && !isKeyPiece(t)) {
              hs.push({ type: "combine", to: tPos });
            }
          } else {
            // capture if equal/lower value (UI shows; rules enforced on commit)
            hs.push({ type: "capture", to: tPos });
          }
        }
      }
    }

    // King arrow-directed moves (V2 two-step; V3+ slide)
    if (isKing(me) && me.arrowDir) {
      const arrowHs = generateKingArrowMoves(board, pos, me, val, turn);
      for (const a of arrowHs) hs.push({ type: a.type, to: a.to });
    }

    set({ selected: pos, highlights: hs });
  },

  actMove: (from, to, isCapture = false) => {
    const { board } = get();
    const p = pieceAt(board, from);
    if (!p) return;

    const next: Board = board.map(row =>
      row.map(cell => (cell ? { ...cell, counters: [...cell.counters], arrowDir: cell.arrowDir } : null))
    );

    if (isCapture) next[to.r][to.c] = null;
    next[to.r][to.c] = p;
    next[from.r][from.c] = null;

    // no turn toggle here; Board.tsx will call endTurn()
    set({ board: next, selected: null, highlights: [] });
  },

  actCombine: (from, onto) => {
    const { board } = get();
    const a = pieceAt(board, from);
    const b = pieceAt(board, onto);
    if (!a || !b) return;
    if (isKing(a) || isKing(b) || isKeyPiece(a) || isKeyPiece(b)) return;
    if (ownerOf(a) !== ownerOf(b)) return;

    const dr = Math.sign(onto.r - from.r);
    const dc = Math.sign(onto.c - from.c);
    const arrowDir = DIR_FROM_DELTA[`${dr},${dc}`];

    const next: Board = board.map(row =>
      row.map(cell => (cell ? { ...cell, counters: [...cell.counters], arrowDir: cell.arrowDir } : null))
    );

    next[onto.r][onto.c] = {
      counters: [...b.counters, ...a.counters],
      arrowDir,
    };
    next[from.r][from.c] = null;

    // no turn toggle here; Board.tsx will call endTurn()
    set({ board: next, selected: null, highlights: [] });
  },

  actRotateArrow: (pos, dir /* "CW"|"CCW" */, _consumeTurn) => {
    const { board } = get();
    const p = pieceAt(board, pos);
    if (!p || !isKing(p) || !p.arrowDir) return;

    const idx = DIR_ORDER.indexOf(p.arrowDir);
    const nextDir = dir === "CW"
      ? DIR_ORDER[(idx + 1) % 8]
      : DIR_ORDER[(idx + 7) % 8];

    const next: Board = board.map(row =>
      row.map(cell => (cell ? { ...cell, counters: [...cell.counters], arrowDir: cell.arrowDir } : null))
    );
    const np = pieceAt(next, pos)!;
    np.arrowDir = nextDir;

    // no turn toggle here; Board.tsx decides (V2 rotation consumes turn)
    set({ board: next });
  },

  actScatter: (from, l1, l2) => {
    const { board } = get();
    const k = pieceAt(board, from);
    if (!k || !isKing(k)) return;

    const me = ownerOf(k);

    const next: Board = board.map(row =>
      row.map(cell => (cell ? { ...cell, counters: [...cell.counters], arrowDir: cell.arrowDir } : null))
    );

    // remove captured enemies at l1/l2
    const t1 = pieceAt(next, l1);
    if (t1 && ownerOf(t1) !== me) next[l1.r][l1.c] = null;
    const t2 = pieceAt(next, l2);
    if (t2 && ownerOf(t2) !== me) next[l2.r][l2.c] = null;

    // place two singles of same owner (no keys produced by scatter)
    next[l1.r][l1.c] = { counters: [{ owner: me }] };
    next[l2.r][l2.c] = { counters: [{ owner: me }] };

    // clear original king
    next[from.r][from.c] = null;

    // no turn toggle here; Board.tsx will call endTurn()
    set({ board: next, selected: null, highlights: [] });
  },

  endTurn: () => {
    const { turn } = get();
    set({ turn: turn === "Black" ? "White" : "Black" });
  },
}));
