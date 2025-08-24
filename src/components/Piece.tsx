// src/components/Piece.tsx
import { SQUARE } from '../game/types';
import type { Coord } from '../game/types';
import type { Piece } from '../game/rules';
import { isKing, ownerOf } from '../game/rules';

function dirToAngle(dir: any) {
  switch (dir) {
    case 'N': return -90;
    case 'NE': return -45;
    case 'E': return 0;
    case 'SE': return 45;
    case 'S': return 90;
    case 'SW': return 135;
    case 'W': return 180;
    case 'NW': return -135;
    default: return 0;
  }
}

export function PieceView({ pos, piece, highlight } : {
  pos: Coord;
  piece: Piece;
  highlight?: string;
}) {
  const cx = pos.c * SQUARE + SQUARE / 2;
  const cy = pos.r * SQUARE + SQUARE / 2;
  const owner = ownerOf(piece);
  const fill = owner === 'Black' ? '#111' : '#eee';
  const stroke = owner === 'Black' ? '#eee' : '#111';

  return (
    <g transform={`translate(${cx} ${cy})`}>
      {/* body */}
      <circle r={SQUARE * 0.28} fill={fill} stroke={stroke} strokeWidth={2} />
      {/* highlight ring */}
      {highlight && <circle r={SQUARE * 0.30} fill="none" stroke="#3aa35a" strokeWidth={3} />}

      {/* arrow for king */}
      {isKing(piece) && piece.arrowDir && (
        <g transform={`rotate(${dirToAngle(piece.arrowDir)})`}>
          <path d="M -10,12 L 0,-14 L 10,12"
                fill="none" stroke={stroke} strokeWidth={3}
                strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}
    </g>
  );
}
