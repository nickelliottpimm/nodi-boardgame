// src/components/RayOverlay.tsx
import React from "react";
import type { Coord } from "../game/types";
import { SQUARE } from "../game/types";

export function RayOverlay({
  rays,
  selected,
}: {
  rays: Coord[];
  selected: boolean;
}) {
  if (!rays || rays.length === 0) return null;

  return (
    <svg
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        pointerEvents: "none",
        width: SQUARE * 8,
        height: SQUARE * 8,
      }}
    >
      {rays.map((r, i) => (
        <line
          key={i}
          x1={(r.c + 0.5) * SQUARE}
          y1={(r.r + 0.5) * SQUARE}
          x2={(r.c + 0.5) * SQUARE}
          y2={(r.r + 0.5) * SQUARE}
          stroke={selected ? "white" : "gray"}
          strokeWidth={2}
        />
      ))}
    </svg>
  );
}
