// src/components/Piece.tsx
import { SQUARE } from "../game/types";
import type { Coord } from "../game/types";
import type { Piece } from "../game/rules";
import { isKing, ownerOf } from "../game/rules";

type AllDir = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";

function dirToAngle(dir: AllDir) {
  switch (dir) {
    case "N": return 0;
    case "NE": return 45;
    case "E": return 90;
    case "SE": return 135;
    case "S": return 180;
    case "SW": return 225;
    case "W": return 270;
    case "NW": return 315;
  }
}

export function PieceView({
  pos,
  piece,
  highlight,
  onClick,
  onMouseEnter,
  onMouseLeave,
}: {
  pos: Coord;
  piece: Piece;
  highlight?: string;
  onClick?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}) {
  const cx = pos.c * SQUARE + SQUARE / 2;
  const cy = pos.r * SQUARE + SQUARE / 2;
  const owner = ownerOf(piece);
  const radius = SQUARE * 0.42;

  const fillColor = owner === "Black" ? "#111" : "#eee";
  const strokeColor = owner === "Black" ? "#eee" : "#111";
  const isHighlighted = highlight === "selected";
  const isKey = piece.counters.some((c) => c.isKey);

  // Build an octagon path
  const octPoints = Array.from({ length: 8 }, (_, i) => {
    const ang = (Math.PI / 4) * i + Math.PI / 8; // flat-ish top
    const x = Math.cos(ang) * radius;
    const y = Math.sin(ang) * radius;
    return `${x},${y}`;
  }).join(" ");

  return (
    <g
      transform={`translate(${cx} ${cy})`}
      style={{ cursor: "pointer" }}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* Body: octagon */}
      <polygon
        points={octPoints}
        fill={fillColor}
        stroke={isHighlighted ? "lime" : strokeColor}
        strokeWidth={isHighlighted ? 4 : 2}
      />

      {/* Key marker: small grey dot at center (readable on both themes) */}
      {isKey && (
        <circle
          cx={0}
          cy={0}
          r={SQUARE * 0.10}
          fill="#999"
          stroke="none"
          style={{ pointerEvents: "none" }}
        />
      )}

      {/* Chevron arrow for kings: medium-grey by default for contrast */}
      {isKing(piece) && piece.arrowDir && (
        <g transform={`rotate(${dirToAngle(piece.arrowDir as AllDir)})`}>
          <path
            d="M -10,12 L 0,-14 L 10,12"
            fill="none"
            stroke="#777"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      )}
    </g>
  );
}
