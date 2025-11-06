// src/engine/worker.ts
/// <reference lib="webworker" />

import { enumerateMoves } from "./greedy";
import type { Board, Player } from "../game/rules";

// Infer the item type the enumerator returns (no need to export a type from greedy.ts)
type AIMove = ReturnType<typeof enumerateMoves>[number];

type RequestMsg = {
  type: "request";
  board: Board;
  turn: Player;
};

type ResponseMsg = {
  type: "response";
  move: AIMove | null;
};

self.addEventListener("message", (e: MessageEvent<RequestMsg>) => {
  const { type, board, turn } = e.data;
  if (type !== "request") return;

  const moves = enumerateMoves(board, turn); // -> AIMove[]
  let best: AIMove | null = null;

  // Pick the highest-score move (fallback: null if no legal moves)
  for (const m of moves) {
    if (!best || m.score > best.score) best = m;
  }

  (self as DedicatedWorkerGlobalScope).postMessage({
    type: "response",
    move: best,
  } as ResponseMsg);
});

// make this a module worker
export {};
