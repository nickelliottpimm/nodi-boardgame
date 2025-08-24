import { create } from 'zustand';
import type { Board, Piece } from '../game/rules';
import { pieceAt, isKing, rotateArrow, ownerOf } from '../game/rules';
import { initialBoard } from '../game/setupBoard';

import type { Coord } from '../game/types';

selected: null as Coord | null,

// Map a (dr, dc) step into one of the 8 directions
function deltaToDir(dr: number, dc: number): 'N'|'NE'|'E'|'SE'|'S'|'SW'|'W'|'NW' {
  if (dr < 0 && dc === 0) return 'N';
  if (dr < 0 && dc > 0)  return 'NE';
  if (dr === 0 && dc > 0) return 'E';
  if (dr > 0 && dc > 0)  return 'SE';
  if (dr > 0 && dc === 0) return 'S';
  if (dr > 0 && dc < 0)  return 'SW';
  if (dr === 0 && dc < 0) return 'W';
  if (dr < 0 && dc < 0)  return 'NW';
  return 'N';
}

type State = {
  board: Board;
  turn: 'White'|'Black';
  selected?: Coord;
  freeOrientationPhase: boolean;
  history: { board: Board; turn: 'White'|'Black' }[];
  canUndo: boolean;
};

type Actions = {
  reset: ()=>void;
  undo: ()=>void;
  select: (pos:Coord)=>void;
  startFreeOrientation: ()=>void;
  endFreeOrientation: ()=>void;
  actRotateArrow: (pos:Coord, dir:'CW'|'CCW', freePhase:boolean)=>void;
  actMove: (from:Coord, to:Coord, isCapture?:boolean)=>void;
  actCombine: (from:Coord, to:Coord)=>void;
  actScatter: (from:Coord, l1:Coord, l2:Coord)=>void;
  endTurn: ()=>void;
};

function cloneBoard(b:Board): Board {
  return b.map(row => row.map(cell => cell.piece ? { piece: {
    counters: cell.piece!.counters.map(c=>({ ...c })) as any,
    arrowDir: cell.piece!.arrowDir
  }} : {}));
}

export const useGame = create<State & Actions>((set, get)=>({
  board: initialBoard(),
  turn: 'Black',
  selected: undefined,
  freeOrientationPhase: false,
  history: [],
  canUndo: false,

reset: () => set({
  board: initialBoard(),
  turn: 'Black',    // <— ensure resets to Black to move
  selected: null,
  canUndo: false,
  history: [],
}),

  undo: ()=> {
    const { history } = get();
    if (!history.length) return;
    const prev = history[history.length-1];
    set({
      board: cloneBoard(prev.board),
      turn: prev.turn,
      history: history.slice(0,-1),
      canUndo: history.length-1>0,
      selected: undefined,
      freeOrientationPhase: false
    });
  },

  select: (pos)=> set({ selected: pos }),

  startFreeOrientation: ()=> set({ freeOrientationPhase: true }),

  endFreeOrientation: ()=> set({ freeOrientationPhase: false }),

  actRotateArrow: (pos, dir, _freePhase)=> {
    const { board } = get();
    const cell = board[pos.r][pos.c];
    if (!cell.piece || !isKing(cell.piece)) return;
    rotateArrow(cell.piece, dir);
    set({ board: cloneBoard(board) });
  },

  actMove: (from, to, isCapture=false)=> {
    const { board } = get();
    const f = board[from.r][from.c].piece!;
    const t = board[to.r][to.c].piece;
    const histPush = { board: cloneBoard(board), turn: get().turn };
    if (isCapture && t) {
      board[to.r][to.c].piece = f;
      board[from.r][from.c].piece = undefined;
    } else {
      if (t) return; // combine path handles allies
      board[to.r][to.c].piece = f;
      board[from.r][from.c].piece = undefined;
    }
    set({ board: cloneBoard(board), history: [...get().history, histPush], canUndo: true, selected: undefined });
  },

actCombine: (from, to)=> {
  const { board } = get();
  const histPush = { board: cloneBoard(board), turn: get().turn };

const counter = { owner, isKey: false }; 
  const mover = board[from.r]?.[from.c]?.piece;
  const dest  = board[to.r]?.[to.c]?.piece;
  if (!mover || !dest) return;
  if (mover.counters.length !== 1 || dest.counters.length !== 1) return;
  if (mover.counters[0].isKey || dest.counters[0].isKey) return;
  if (mover.counters[0].owner !== dest.counters[0].owner) return;

  const dr = to.r - from.r;
  const dc = to.c - from.c;
  const dir = deltaToDir(dr, dc);

  const king: Piece = {
    counters: [ { ...dest.counters[0] }, { ...mover.counters[0] } ] as [any, any],
    arrowDir: dir,
  };

  board[to.r][to.c].piece = king;
  board[from.r][from.c].piece = undefined;

  set({
    board: cloneBoard(board),
    history: [...get().history, histPush],
    canUndo: true,
    selected: to,
  });
},

  actScatter: (from, l1, l2)=> {
    const { board } = get();
    const histPush = { board: cloneBoard(board), turn: get().turn };
    const king = board[from.r][from.c].piece!;
    board[from.r][from.c].piece = undefined;
    const a: Piece = { counters: [ { ...king.counters[0] } ] };
    const b: Piece = { counters: [ { ...king.counters[1] } ] };
    board[l1.r][l1.c].piece = a;
    board[l2.r][l2.c].piece = b;
    set({ board: cloneBoard(board), history: [...get().history, histPush], canUndo: true, selected: undefined });
  },

  endTurn: ()=> {
    const { board, turn } = get();
    const opp: 'White'|'Black' = turn==='White' ? 'Black' : 'White';
    let oppKeys = 0;
    for (let r=0;r<8;r++) for (let c=0;c<8;c++){
      const p = board[r][c].piece;
      if (p && p.counters.some(cn=>cn.isKey && cn.owner===opp)) oppKeys++;
    }
    const histPush = { board: cloneBoard(board), turn: get().turn };
    set({
      turn: opp,
      history: [...get().history, histPush],
      canUndo: true,
      selected: undefined,
      freeOrientationPhase: false
    });
    if (oppKeys===0) alert(`${turn} wins!`);
  },
}));
