// src/engine/worker.ts
/// <reference lib="webworker" />
import type { Board, Player } from "../game/rules";
import { enumerateMoves } from "./greedy";
import type { AIMove } from "./aiTypes";

type RequestMsg = { type: "request"; board: Board; turn: Player };
type ReplyMsg   = { type: "reply"; move: AIMove | null };

self.onmessage = (e: MessageEvent<RequestMsg>) => {
  const { type, board, turn } = e.data;
  if (type !== "request") return;
  const best = enumerateMoves(board, turn);
  const reply: ReplyMsg = { type: "reply", move: best };
  (self as any).postMessage(reply);
};
