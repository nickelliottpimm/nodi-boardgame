// src/components/RayOverlay.tsx
import React from 'react';
import { SQUARE } from '../game/types';
import type { Coord } from '../game/types';

export function RayOverlay({
  origin,
  path,
  selected = false,
  opacity = 1
}: {
  origin: Coord;
  path: Coord[];
  selected?: boolean;
  opacity?: number;
}) {
  if (!path || path.length === 0) return null;

  const ox = origin.c * SQUARE + SQUARE / 2;
  const oy = origin.r * SQUARE + SQUARE / 2;
  const end = path[path.length - 1];
  const ex = end.c * SQUARE + SQUARE / 2;
  const ey = end.r * SQUARE + SQUARE / 2;

  return (
    <line
      x1={ox}
      y1={oy}
      x2={ex}
      y2={ey}
      stroke={selected ? '#ffffff' : 'rgba(200,200,200,0.5)'}
      strokeWidth={selected ? 3 : 2}
      opacity={opacity}
      strokeLinecap="round"
      pointerEvents="none"
    />
  );
}
