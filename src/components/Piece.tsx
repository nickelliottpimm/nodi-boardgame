import { SQUARE } from '../game/types';
import type { Coord } from '../game/types';
import { isKing, ownerOf } from '../game/rules';
import type { Piece } from '../game/rules';

export function PieceView({ pos, piece, highlight }:{ pos:Coord, piece:Piece, highlight?:'selected'|undefined }) {
  const x = pos.c*SQUARE + SQUARE/2;
  const y = pos.r*SQUARE + SQUARE/2;
  const owner = ownerOf(piece);
  const fill = owner === 'White' ? '#f2f2f2' : '#222';
  const stroke = owner === 'White' ? '#222' : '#f2f2f2';
  const size = SQUARE*0.36;

  return (
    <g className={`piece ${highlight||''}`}>
      {/* octagon */}
      <polygon
        points={octagonPoints(x, y, size)}
        fill={fill}
        stroke={stroke}
        strokeWidth={2}
      />
      {/* key marker (red ring) */}
      {piece.counters.some(c=>c.isKey) && (
        <circle cx={x} cy={y} r={size*0.35} fill="none" stroke="#e74c3c" strokeWidth={3}/>
      )}
      {/* king ring + chevron */}
      {isKing(piece) && (
        <>
          {piece.arrowDir && (
            <g transform={`translate(${x},${y}) rotate(${dirToDeg(piece.arrowDir)})`}>
              <polyline points="-12,6 0,-12 12,6" fill="none" stroke={owner==='White'?'#00bfa6':'#ff7a59'} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"/>
            </g>
          )}
        </>
      )}
    </g>
  );
}

function octagonPoints(cx:number, cy:number, r:number) {
  const k = 0.4142; // approx (sqrt(2)-1)
  const pts = [
    [cx-r*k, cy-r], [cx+r*k, cy-r],
    [cx+r, cy-r*k], [cx+r, cy+r*k],
    [cx+r*k, cy+r], [cx-r*k, cy+r],
    [cx-r, cy+r*k], [cx-r, cy-r*k],
  ];
  return pts.map(p=>p.join(',')).join(' ');
}

function dirToDeg(dir: 'N'|'NE'|'E'|'SE'|'S'|'SW'|'W'|'NW'){
  switch(dir){
    case 'N':  return 0;     // chevron polyline already points up
    case 'NE': return 45;
    case 'E':  return 90;
    case 'SE': return 135;
    case 'S':  return 180;
    case 'SW': return -135;  // or 225
    case 'W':  return -90;   // or 270
    case 'NW': return -45;
  }
}
