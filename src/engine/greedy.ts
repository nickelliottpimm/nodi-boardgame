// src/engine/greedy.ts
import type { Board, Player } from "../game/rules";
import type { Coord } from "../game/types";
import { pieceAt, ownerOf, legalMovesFor, valueAt } from "../game/rules";
import { evalFor } from "./eval";
import type { AIMove } from "./aiTypes";

function cloneBoard(b: Board): Board {
  return b.map(row =>
    row.map(cell =>
      cell ? ({ counters: [...cell.counters], arrowDir: cell.arrowDir }) : null
    )
  );
}

function applyAIMove(board: Board, mv: AIMove): Board {
  const next = cloneBoard(board);
  const from = mv.from, to = mv.to;
  const moving = next[from.r][from.c];
  if (!moving) return next;

  if (mv.kind === "combine") {
    const onto = next[to.r][to.c];
    if (!onto) return next;
    next[to.r][to.c] = {
      counters: [...onto.counters, ...moving.counters],
      arrowDir: onto.arrowDir ?? moving.arrowDir, // fine for eval purposes
    };
    next[from.r][from.c] = null;
    return next;
  }

  // move / capture
  if (mv.isCapture) next[to.r][to.c] = null;
  next[to.r][to.c] = moving;
  next[from.r][from.c] = null;
  return next;
}

// Exported so worker can still call the simple picker name if you want
export function allSimpleMoves(board: Board, side: Player): AIMove[] {
  const out: AIMove[] = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = pieceAt(board, { r, c });
      if (!p || ownerOf(p) !== side) continue;
      const { moves, captures, combines } = legalMovesFor(board, { r, c });

      // basic one-step moves
      for (const to of moves) out.push({ kind: "move", from: { r, c }, to, isCapture: false });
      // captures
      for (const to of captures) out.push({ kind: "move", from: { r, c }, to, isCapture: true });
      // combines
      for (const to of combines) out.push({ kind: "combine", from: { r, c }, to });
    }
  }
  return out;
}

// Light move-ordering to avoid dumb left-to-right stacking:
// 1) captures first
// 2) moves that increase destination value for us
// 3) combines last (often good, but not always)
function orderMoves(board: Board, side: Player, moves: AIMove[]): AIMove[] {
  return moves
    .map((m) => {
      let score = 0;
      if (m.kind === "move" && m.isCapture) score += 100;
      if (m.kind === "move" && !m.isCapture) {
        const destVal = valueAt(board, m.to);
        score += destVal * 2; // prefer moving into stronger nodes
      }
      if (m.kind === "combine") score += 10; // not zero, but behind captures & strong moves
      return { m, key: score };
    })
    .sort((a, b) => b.key - a.key)
    .map(x => x.m);
}

// Depth-2 alpha-beta (us -> opponent), returns [score, move]
function search2(board: Board, me: Player): { move: AIMove | null; score: number } {
  // Ply 0 (our options)
  const myMoves = orderMoves(board, me, allSimpleMoves(board, me));
  if (myMoves.length === 0) return { move: null, score: evalFor(board, me) };

  let bestMove: AIMove | null = null;
  let alpha = -Infinity;
  const beta = Infinity;

  for (const m of myMoves) {
    const afterMe = applyAIMove(board, m);
    // Opponent turn
    const opp: Player = me === "Black" ? "White" : "Black";
    const oppMoves = orderMoves(afterMe, opp, allSimpleMoves(afterMe, opp));

    // If opponent has no reply, great — evaluate now
    if (oppMoves.length === 0) {
      const s = evalFor(afterMe, me);
      if (s > alpha) { alpha = s; bestMove = m; }
      continue;
    }

    // Min step: opponent chooses our worst outcome
    let worstForUs = Infinity;
    for (const om of oppMoves) {
      const afterOpp = applyAIMove(afterMe, om);
      const s = evalFor(afterOpp, me);
      if (s < worstForUs) worstForUs = s;
      // alpha-beta pruning at depth-2 is tiny but keep it tidy
      if (worstForUs <= alpha) break;
    }

    if (worstForUs > alpha) {
      alpha = worstForUs;
      bestMove = m;
    }
  }

  return { move: bestMove, score: alpha };
}

export function chooseGreedy(board: Board, side: Player): AIMove | null {
  // Kept the name for compatibility with your worker import
  return search2(board, side).move;
}
