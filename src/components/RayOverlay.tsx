// src/components/RayOverlay.tsx
import type { Coord } from "../game/types";
import { SQUARE } from "../game/types";

/** Draws a continuous line through ray squares. */
export function RayOverlay({
  rays,
  selected,
}: {
  rays: Coord[];
  selected: boolean;
}) {
  if (!rays || rays.length === 0) return null;

  // Build a single polyline from the centers of each ray square
  const points = rays
    .map(p => `${(p.c + 0.5) * SQUARE},${(p.r + 0.5) * SQUARE}`)
    .join(" ");

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
      <polyline
        points={points}
        fill="none"
        stroke={selected ? "white" : "rgba(255,255,255,0.35)"}
        strokeWidth={2}
      />
    </svg>
  );
}
