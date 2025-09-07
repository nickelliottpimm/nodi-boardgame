// src/store/gameStore.ts
import { create } from "zustand";
import type { Board, Coord, Piece, Player } from "../game/rules";
import {
  pieceAt,
  isKing,
  ownerOf,
  valueAt,
  isKeyPiece,
} from "../game/rules";
import { initialBoard } from "../game/setupBoard";
import { generateKingArrowMoves } from "../game/moveGen";

type Highlight = {
  type: "move" | "combine" | "capture" | "scatter";
  to: Coord;
};

type Snapshot = {
  board: Board;
  turn: Player;
};

type GameState = {
  board: Board;
  turn: Player;
  selected: Coord | null;
  highlights: Highlight[];

  // history for undo/reset
  history: Snapshot[];
  canUndo: boolean;
  undo: () => void;
  reset: () => void;

  // selection & actions
  select: (pos: Coord | null) => void;
  actMove: (from: Coord, to: Coord, isCapture?: boolean) => void;
  actCombine: (from: Coord, onto: Coord) => void;

  // scatter commits come from your scatter flow in Board.tsx
  actScatter: (from: Coord, l1: Coord, l2: Coord) => void;
};

function cloneBoard(b: Board): Board {
  return b.map(row =>
    row.map(cell =>
      cell
        ? { counters: [...cell.counters], arrowDir: cell.arrowDir }
        : null
    )
  );
}

function inBounds(r: number, c: number) {
  return r >= 0 && r < 8 && c >= 0 && c < 8;
}

const ADJ: [number, number][] = [
  [-1, -1], [-1, 0], [-1, 1],
  [ 0, -1],          [ 0, 1],
  [ 1, -1], [ 1, 0], [ 1, 1],
];

export const useGame = create<GameState>((set, get) => ({
  board: initialBoard(),
  turn: "Black", // Black starts
  selected: null,
  highlights: [],
  history: [],
  canUndo: false,

  undo: () => {
    const { history } = get();
    if (!history.length) return;
    const prev = history[history.length - 1];
    const rest = history.slice(0, -1);
    set({
      board: cloneBoard(prev.board),
      turn: prev.turn,
      selected: null,
      highlights: [],
      history: rest,
      canUndo: rest.length > 0,
    });
  },

  reset: () => {
    set({
      board: initialBoard(),
      turn: "Black",
      selected: null,
      highlights: [],
      history: [],
      canUndo: false,
    });
  },

  select: (pos) => {
    const { board, turn } = get();

    // deselect
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

    // 1-step moves / captures / combines (val >= 1)
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
            // combines only if both are singles and NOT keys
            if (!isKing(me) && !isKeyPiece(me) && !isKing(t) && !isKeyPiece(t)) {
              hs.push({ type: "combine", to: tPos });
            }
          } else {
            // capture candidate; value gate applied on commit
            hs.push({ type: "capture", to: tPos });
          }
        }
      }
    }

    // king arrow-directed moves (V2 2-step, V3+ slide)
    if (isKing(me) && me.arrowDir) {
      const arrowHs = generateKingArrowMoves(board, pos, me, val, turn);
      for (const a of arrowHs) hs.push({ type: a.type, to: a.to });
    }

    set({ selected: pos, highlights: hs });
  },

  actMove: (from, to, isCapture = false) => {
    const { board, turn, history } = get();
    const p = pieceAt(board, from);
    if (!p) return;

    const next = cloneBoard(board);

    // capture if flagged
    if (isCapture) next[to.r][to.c] = null;

    // move piece
    next[to.r][to.c] = p;
    next[from.r][from.c] = null;

    // push snapshot, toggle turn HERE (single source of truth)
    const snap: Snapshot = { board: cloneBoard(board), turn };
    set({
      board: next,
      turn: turn === "Black" ? "White" : "Black",
      selected: null,
      highlights: [],
      history: [...history, snap],
      canUndo: true,
    });
  },

  actCombine: (from, onto) => {
    const { board, turn, history } = get();
    const a = pieceAt(board, from);
    const b = pieceAt(board, onto);
    if (!a || !b) return;

    // must be friendly singles and NOT keys
    if (isKing(a) || isKing(b) || isKeyPiece(a) || isKeyPiece(b)) return;
    if (ownerOf(a) !== ownerOf(b)) return;

    // Arrow = direction of the move (from -> onto)
    const dr = Math.sign(onto.r - from.r);
    const dc = Math.sign(onto.c - from.c);
    const DIR_FROM_DELTA: Record<string, any> = {
      "-1,0": "N", "-1,1": "NE", "0,1": "E", "1,1": "SE",
      "1,0": "S", "1,-1": "SW", "0,-1": "W", "-1,-1": "NW",
    };
    const arrowDir = DIR_FROM_DELTA[`${dr},${dc}`];

    const next = cloneBoard(board);
    // create king on 'onto'
    next[onto.r][onto.c] = {
      counters: [...b.counters, ...a.counters],
      arrowDir,
    };
    // clear 'from'
    next[from.r][from.c] = null;

    const snap: Snapshot = { board: cloneBoard(board), turn };
    set({
      board: next,
      turn: turn === "Black" ? "White" : "Black",
      selected: null,
      highlights: [],
      history: [...history, snap],
      canUndo: true,
    });
  },

  actScatter: (from, l1, l2) => {
    const { board, turn, history } = get();
    const me = pieceAt(board, from);
    if (!me || !isKing(me)) return;

    const next = cloneBoard(board);

    // Remove any enemies on l1/l2 (scatter capture)
    const t1 = pieceAt(next, l1);
    const t2 = pieceAt(next, l2);
    if (t1 && ownerOf(t1) !== ownerOf(me)) next[l1.r][l1.c] = null;
    if (t2 && ownerOf(t2) !== ownerOf(me)) next[l2.r][l2.c] = null;

    // Remove the king
    next[from.r][from.c] = null;

    // Place two singles with same owner as the king on l1/l2
    const owner = ownerOf(me);
    next[l1.r][l1.c] = { counters: [{ owner }] };
    next[l2.r][l2.c] = { counters: [{ owner }] };

    const snap: Snapshot = { board: cloneBoard(board), turn };
    set({
      board: next,
      turn: turn === "Black" ? "White" : "Black",
      selected: null,
      highlights: [],
      history: [...history, snap],
      canUndo: true,
    });
  },
}));
