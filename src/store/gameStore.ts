// src/store/gameStore.ts
import { create } from "zustand";
import type { Board, Piece, Player } from "../game/rules";
import type { Coord } from "../game/types";
import {
  pieceAt,
  isKing,
  ownerOf,
  valueAt,
  isKeyPiece,
} from "../game/rules";
import { initialBoard } from "../game/setupBoard";
import { generateKingArrowMoves } from "../game/moveGen";

export type Highlight = {
  type: "move" | "combine" | "capture";
  to: Coord;
};

type GameSnapshot = {
  board: Board;
  turn: Player;
};

type GameState = {
  board: Board;
  turn: Player;                   // "Black" | "White"
  selected: Coord | null;
  highlights: Highlight[];
  scatterMode: boolean;           // reserved (UI may use)
  scatterSquares: Coord[];        // reserved (UI may use)

  // history
  history: GameSnapshot[];
  canUndo: boolean;

  // actions
  select: (pos: Coord | null) => void;
  actMove: (from: Coord, to: Coord, isCapture?: boolean) => void;
  actCombine: (from: Coord, onto: Coord) => void;
  actScatter: (from: Coord, l1: Coord, l2: Coord) => void;
  endTurn: () => void;

  undo: () => void;
  reset: () => void;
};

// utils
function inBounds(r: number, c: number) {
  return r >= 0 && r < 8 && c >= 0 && c < 8;
}
const ADJ: [number, number][] = [
  [-1, -1], [-1, 0], [-1, 1],
  [ 0, -1],          [ 0, 1],
  [ 1, -1], [ 1, 0], [ 1, 1],
];

function cloneBoard(b: Board): Board {
  return b.map(row =>
    row.map(cell =>
      cell
        ? { counters: cell.counters.map(c => ({ ...c })), arrowDir: cell.arrowDir }
        : null
    )
  );
}

export const useGame = create<GameState>((set, get) => ({
  board: initialBoard(),
  turn: "Black",              // Black starts
  selected: null,
  highlights: [],
  scatterMode: false,
  scatterSquares: [],
  history: [],
  canUndo: false,

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

    // one-step moves / combines / captures (value >= 1)
    if (val >= 1) {
      for (const [dr, dc] of ADJ) {
        const r = pos.r + dr, c = pos.c + dc;
        if (!inBounds(r, c)) continue;
        const q = { r, c };
        const t = pieceAt(board, q);
        if (!t) {
          hs.push({ type: "move", to: q });
        } else {
          const tOwner = ownerOf(t);
          if (tOwner === turn) {
            // combines only if both are singles and not keys
            if (!isKing(me) && !isKeyPiece(me) && !isKing(t) && !isKeyPiece(t)) {
              hs.push({ type: "combine", to: q });
            }
          } else {
            // capture shown; final legality uses value gate on commit
            hs.push({ type: "capture", to: q });
          }
        }
      }
    }

    // king arrow moves (V2=2-step, V3+=slide)
    if (isKing(me) && me.arrowDir) {
      const arrowHs = generateKingArrowMoves(board, pos, me, val, ownerOf(me));
      for (const a of arrowHs) hs.push({ type: a.type, to: a.to });
    }

    set({ selected: pos, highlights: hs });
  },

  actMove: (from, to, isCapture = false) => {
    const { board, turn, history } = get();
    const p = pieceAt(board, from);
    if (!p) return;

    const next = cloneBoard(board);
    if (isCapture) next[to.r][to.c] = null; // remove enemy
    next[to.r][to.c] = p;
    next[from.r][from.c] = null;

    // push history BEFORE applying turn change
    const snap: GameSnapshot = { board: cloneBoard(board), turn };
    set({
      history: [...history, snap],
      canUndo: true,
      board: next,
      selected: null,
      highlights: [],
    });
    get().endTurn();
  },

  actCombine: (from, onto) => {
    const { board, turn, history } = get();
    const a = pieceAt(board, from);
    const b = pieceAt(board, onto);
    if (!a || !b) return;
    if (isKing(a) || isKing(b) || isKeyPiece(a) || isKeyPiece(b)) return;
    if (ownerOf(a) !== ownerOf(b)) return;

    // arrow = move direction (from -> onto)
    const dr = Math.sign(onto.r - from.r);
    const dc = Math.sign(onto.c - from.c);
    const DIR_FROM_DELTA: Record<string, any> = {
      "-1,0": "N", "-1,1": "NE", "0,1": "E", "1,1": "SE",
      "1,0": "S", "1,-1": "SW", "0,-1": "W", "-1,-1": "NW",
    };
    const arrowDir = DIR_FROM_DELTA[`${dr},${dc}`];

    const next = cloneBoard(board);
    next[onto.r][onto.c] = {
      counters: [...b.counters, ...a.counters],
      arrowDir,
    };
    next[from.r][from.c] = null;

    const snap: GameSnapshot = { board: cloneBoard(board), turn };
    set({
      history: [...history, snap],
      canUndo: true,
      board: next,
      selected: null,
      highlights: [],
    });
    get().endTurn();
  },

  actScatter: (from, l1, l2) => {
    // Break a king at `from` into two singles landing on l1/l2 (captures if enemies there).
    const { board, turn, history } = get();
    const k = pieceAt(board, from);
    if (!k || !isKing(k)) return;
    const owner = ownerOf(k);

    const next = cloneBoard(board);
    // capture targets
    next[l1.r][l1.c] = null;
    next[l2.r][l2.c] = null;

    // place two singles for the owner
    next[l1.r][l1.c] = { counters: [{ owner }] };
    next[l2.r][l2.c] = { counters: [{ owner }] };

    // clear original king
    next[from.r][from.c] = null;

    const snap: GameSnapshot = { board: cloneBoard(board), turn };
    set({
      history: [...history, snap],
      canUndo: true,
      board: next,
      selected: null,
      highlights: [],
    });
    get().endTurn();
  },

  endTurn: () => {
    const { turn } = get();
    set({ turn: turn === "Black" ? "White" : "Black" });
  },

  undo: () => {
    const { history } = get();
    if (history.length === 0) return;
    const last = history[history.length - 1];
    set({
      board: cloneBoard(last.board),
      turn: last.turn,
      history: history.slice(0, -1),
      canUndo: history.length - 1 > 0,
      selected: null,
      highlights: [],
    });
  },

  reset: () => {
    set({
      board: initialBoard(),
      turn: "Black",
      selected: null,
      highlights: [],
      scatterMode: false,
      scatterSquares: [],
      history: [],
      canUndo: false,
    });
  },
}));
