// src/engine/aiTypes.ts
import type { Coord } from "../game/types";

export type AIMove =
  | { kind: "move"; from: Coord; to: Coord; isCapture: boolean }
  | { kind: "combine"; from: Coord; to: Coord };
