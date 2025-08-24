// src/components/RayOverlay.tsx
import { SQUARE } from '../game/types';
import type { Coord } from '../game/types';

export function RayOverlay({
  origin, path, selected, opacity = 1
}: {
  origin: Coord;
  path: Coord[];
  selected?: boolean;
  opacity?: number;
}) {
  if (!path.length) return null;
  const d = path.map((p, i) => {
    const x = p.c * SQUARE + SQUARE / 2;
    const y = p.r * SQUARE + SQUARE / 2;
    return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
  }).join(' ');
  return (
    <path
      d={d}
      stroke={selected ? 'white' : 'rgba(255,255,255,0.35)'}
      strokeWidth={2}
      fill="none"
      opacity={opacity}
      pointerEvents="none"
    />
  );
}
