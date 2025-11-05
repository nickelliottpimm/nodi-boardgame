// src/store/gameStore.ts
import { create } from "zustand";
import type { Board, Player } from "../game/rules";
import { pieceAt, isKing, ownerOf, valueAt, isKeyPiece } from "../game/rules";
import type { Coord } from "../game/types";
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

type GameMode = "hotseat" | "vsAI";

// Direction helpers (used by rotate)
type AllDir = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";
const DIR_ORDER: AllDir[] = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
type RotateArg = "CW" | "CCW" | AllDir;

function cloneBoard(b: Board): Board {
  return b.map((row) =>
    row.map((cell) =>
      cell ? { counters: [...cell.counters], arrowDir: cell.arrowDir } : null
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

function other(p: Player): Player {
  return p === "Black" ? "White" : "Black";
}

function keysRemaining(board: Board, side: Player): number {
  let n = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = pieceAt(board, { r, c });
      if (!p) continue;
      if (ownerOf(p) === side && isKeyPiece(p)) n++;
    }
  }
  return n;
}

function winnerAfter(board: Board, mover: Player): Player | null {
  const opp = other(mover);
  return keysRemaining(board, opp) === 0 ? mover : null;
}

type GameState = {
  board: Board;
  turn: Player;
  selected: Coord | null;
  highlights: Highlight[];
  winner: Player | null;

  history: Snapshot[];
  canUndo: boolean;

  gameMode: GameMode;
  aiColor: Player;
  setGameMode: (mode: GameMode) => void;
  setAIColor: (side: Player) => void;

  undo: () => void;
  reset: () => void;

  select: (pos: Coord | null) => void;
  actMove: (from: Coord, to: Coord, isCapture?: boolean) => void;
  actCombine: (from: Coord, onto: Coord) => void;
  actScatter: (from: Coord, l1: Coord, l2: Coord) => void;
  actRotateArrow: (at: Coord, dir: RotateArg) => void;
};

export const useGame = create<GameState>((set, get) => ({
  board: initialBoard(),
  turn: "Black",
  selected: null,
  highlights: [],
  winner: null,

  history: [],
  canUndo: false,

  gameMode: "hotseat",
  aiColor: "White",
  setGameMode: (mode) => set({ gameMode: mode }),
  setAIColor: (side) => set({ aiColor: side }),

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
      winner: null,
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
      winner: null,
    });
  },

  select: (pos) => {
    const { board, turn, winner } = get();
    if (winner) return;

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
            if (!isKing(me) && !isKeyPiece(me) && !isKing(t) && !isKeyPiece(t)) {
              hs.push({ type: "combine", to: tPos });
            }
          } else {
            hs.push({ type: "capture", to: tPos });
          }
        }
      }
    }

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
    if (isCapture) next[to.r][to.c] = null;
    next[to.r][to.c] = p;
    next[from.r][from.c] = null;

    const snap: Snapshot = { board: cloneBoard(board), turn };
    const maybeWinner = winnerAfter(next, turn);

    set({
      board: next,
      turn: maybeWinner ? turn : other(turn),
      selected: null,
      highlights: [],
      history: [...history, snap],
      canUndo: true,
      winner: maybeWinner,
    });
  },

  actCombine: (from, onto) => {
    const { board, turn, history } = get();
    const a = pieceAt(board, from);
    const b = pieceAt(board, onto);
    if (!a || !b) return;
    if (isKing(a) || isKing(b) || isKeyPiece(a) || isKeyPiece(b)) return;
    if (ownerOf(a) !== ownerOf(b)) return;

    const dr = Math.sign(onto.r - from.r);
    const dc = Math.sign(onto.c - from.c);
    const DIR_FROM_DELTA: Record<string, AllDir> = {
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

    const snap: Snapshot = { board: cloneBoard(board), turn };
    set({
      board: next,
      turn: other(turn),
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

    const t1 = pieceAt(next, l1);
    const t2 = pieceAt(next, l2);
    if (t1 && ownerOf(t1) !== ownerOf(me)) next[l1.r][l1.c] = null;
    if (t2 && ownerOf(t2) !== ownerOf(me)) next[l2.r][l2.c] = null;

    next[from.r][from.c] = null;

    const owner = ownerOf(me);
    next[l1.r][l1.c] = { counters: [{ owner }] };
    next[l2.r][l2.c] = { counters: [{ owner }] };

    const snap: Snapshot = { board: cloneBoard(board), turn };
    const maybeWinner = winnerAfter(next, turn);

    set({
      board: next,
      turn: maybeWinner ? turn : other(turn),
      selected: null,
      highlights: [],
      history: [...history, snap],
      canUndo: true,
      winner: maybeWinner,
    });
  },

  actRotateArrow: (at, dir) => {
    const { board, turn, history } = get();
    const p = pieceAt(board, at);
    if (!p || !isKing(p) || !p.arrowDir) return;

    // compute next direction
    const idx = DIR_ORDER.indexOf(p.arrowDir as AllDir);
    let nextDir: AllDir;
    if (dir === "CW") nextDir = DIR_ORDER[(idx + 1) % 8];
    else if (dir === "CCW") nextDir = DIR_ORDER[(idx + 7) % 8];
    else nextDir = dir;

    const next = cloneBoard(board);
    const np = next[at.r][at.c];
    if (!np) return;
    np.arrowDir = nextDir;

    // Free rotate if resulting value ≥ 3
    const free = valueAt(next, at) >= 3;

    const snap: Snapshot = { board: cloneBoard(board), turn };
    set({
      board: next,
      turn: free ? turn : other(turn),
      selected: { ...at }, // keep it selected after rotate
      highlights: [],
      history: [...history, snap],
      canUndo: true,
    });
  },
}));
