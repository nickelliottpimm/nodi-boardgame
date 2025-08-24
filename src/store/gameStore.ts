// src/store/gameStore.ts
import { create } from 'zustand';
import type { Coord, Dir } from '../game/types';
import { DIRS } from '../game/types';
import type { Board, Piece, Player } from '../game/rules';
import { pieceAt, isKing } from "../game/rules";
import { initialBoard } from "../game/setupBoard";

type Move = {
  board: Board;
  turn: Player;
  selected: Coord | null;
};

type RotateDir = 'CW' | 'CCW';

function cloneBoard(b: Board): Board {
  return b.map(row =>
    row.map(cell =>
      cell ? { counters: cell.counters.map(c => ({ ...c })), arrowDir: cell.arrowDir } : null
    )
  );
}

function deltaToDir(dr: number, dc: number): Dir | null {
  if (dr === -1 && dc === 0) return 'N';
  if (dr === -1 && dc === 1) return 'NE';
  if (dr === 0 && dc === 1) return 'E';
  if (dr === 1 && dc === 1) return 'SE';
  if (dr === 1 && dc === 0) return 'S';
  if (dr === 1 && dc === -1) return 'SW';
  if (dr === 0 && dc === -1) return 'W';
  if (dr === -1 && dc === -1) return 'NW';
  return null;
}

function rotateCW(dir: Dir): Dir {
  const order: Dir[] = ['N','NE','E','SE','S','SW','W','NW'];
  const i = order.indexOf(dir);
  return order[(i + 1) % 8];
}

export interface GameState {
  board: Board;
  turn: Player;
  selected: Coord | null;
  history: Move[];
  canUndo: boolean;

  select: (pos: Coord | null) => void;
  reset: () => void;
  undo: () => void;

  endTurn: () => void;
  actMove: (from: Coord, to: Coord, isCapture: boolean) => void;
  actCombine: (from: Coord, to: Coord) => void;
  actRotateArrow: (at: Coord, dir: RotateDir, consumeTurn: boolean) => void;
  actScatter: (from: Coord, l1: Coord, l2: Coord) => void;
}

export const useGame = create<GameState>((set, get) => ({
  board: initialBoard(),
  turn: 'Black', // Black moves first
  selected: null,
  history: [],
  canUndo: false,

  select: (pos) => set({ selected: pos }),

  reset: () => set({
    board: initialBoard(),
    turn: 'Black',
    selected: null,
    history: [],
    canUndo: false,
  }),

  undo: () => {
    const { history } = get();
    if (!history.length) return;
    const prev = history[history.length - 1];
    set({
      board: cloneBoard(prev.board),
      turn: prev.turn,
      selected: prev.selected,
      history: history.slice(0, -1),
      canUndo: history.length - 1 > 0
    });
  },

  endTurn: () => {
    const { turn } = get();
    set({ turn: turn === 'White' ? 'Black' : 'White', selected: null });
  },

  actMove: (from, to, isCapture) => {
    const { board, turn, history, selected } = get();
    const b = cloneBoard(board);
    const p = pieceAt(b, from);
    if (!p) return;

    if (isCapture) b[to.r][to.c] = null;

    b[to.r][to.c] = p;
    b[from.r][from.c] = null;

    set({
      board: b,
      history: [...history, { board: cloneBoard(board), turn, selected }],
      canUndo: true,
      selected: to
    });
  },

  actCombine: (from, to) => {
    const { board, turn, history, selected } = get();
    const b = cloneBoard(board);
    const a = pieceAt(b, from);
    const target = pieceAt(b, to);
    if (!a || !target) return;
    // keys cannot stack
    if (a.counters.some(c => c.isKey) || target.counters.some(c => c.isKey)) return;

    const dr = to.r - from.r;
    const dc = to.c - from.c;
    const dir = deltaToDir(Math.sign(dr), Math.sign(dc)) || 'N';

    const merged: Piece = {
      counters: [...target.counters, ...a.counters],
      arrowDir: dir
    };
    b[to.r][to.c] = merged;
    b[from.r][from.c] = null;

    set({
      board: b,
      history: [...history, { board: cloneBoard(board), turn, selected }],
      canUndo: true,
      selected: to
    });
  },

  actRotateArrow: (at, dir, _consumeTurn) => {
    const { board, turn, history, selected } = get();
    const b = cloneBoard(board);
    const p = pieceAt(b, at);
    if (!p || !isKing(p) || !p.arrowDir) return;

    if (dir === 'CW') p.arrowDir = rotateCW(p.arrowDir);

    set({
      board: b,
      history: [...history, { board: cloneBoard(board), turn, selected }],
      canUndo: true
    });
  },

  actScatter: (from, l1, l2) => {
    const { board, turn, history, selected } = get();
    const b = cloneBoard(board);
    const king = pieceAt(b, from);
    if (!king || !isKing(king) || !king.arrowDir) return;

    // remove targets (capture)
    b[l1.r][l1.c] = null;
    b[l2.r][l2.c] = null;

    // split counters to singles
    const [c1, c2] = king.counters;
    b[l1.r][l1.c] = { counters: [{ ...c1 }] };
    b[l2.r][l2.c] = { counters: [{ ...c2 }] };
    b[from.r][from.c] = null;

    set({
      board: b,
      history: [...history, { board: cloneBoard(board), turn, selected }],
      canUndo: true,
      selected: null
    });
  },
}));
