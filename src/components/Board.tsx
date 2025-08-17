// src/components/Board.tsx
import React, { useMemo, useState } from 'react';
import cn from 'classnames';
import { SQUARE, coordEq, DIRS, inBounds } from '../game/types';
import type { Coord } from '../game/types';
import { useGame } from '../store/gameStore';
import {
  isKing,
  pieceAt,
  valueAt,
  legalMovesFor,
  getRayForKing,
  ownerOf,
} from '../game/rules';
import { PieceView } from './Piece';
import { RayOverlay } from './RayOverlay';

const DIR_ORDER = ['N','NE','E','SE','S','SW','W','NW'] as const;
type AllDir = typeof DIR_ORDER[number];

function dirToAngle(dir: AllDir) {
  switch (dir) {
    case 'N': return -90;
    case 'NE': return -45;
    case 'E': return 0;
    case 'SE': return 45;
    case 'S': return 90;
    case 'SW': return 135;
    case 'W': return 180;
    case 'NW': return -135;
  }
}

export function BoardView({ values }: { values: number[][] }) {
  const {
    board,
    turn,
    selected,
    select,
    actMove,
    actRotateArrow,
    actCombine,
    actScatter,
    endTurn,
  } = useGame();

  const [hover, setHover] = useState<Coord | null>(null);
  const [scatterMode, setScatterMode] = useState(false);
  const [showHelp, setShowHelp] = useState(true);

  // legal moves (disabled in scatter mode)
  const legal = useMemo(() => {
    if (!selected || scatterMode) {
      return { moves: [], combines: [], captures: [], scatters: [], rotations: [] as ('CW'|'CCW'|'ANY')[] };
    }
    return legalMovesFor(board, selected);
  }, [board, selected, scatterMode]);

  // hover numeric value
  const hoverValue = useMemo(() => {
    if (!hover) return null;
    const p = pieceAt(board, hover);
    if (!p) return null;
    return valueAt(board, hover);
  }, [board, hover]);

  // orientation via 8 dots (available whenever value ≥ 2)
  function handleOrient(dir: AllDir) {
    if (!selected) return;
    const p = pieceAt(board, selected);
    if (!p || !isKing(p) || !p.arrowDir) return;
    if (ownerOf(p) !== turn) return;

    if (p.arrowDir !== dir) {
      const order = DIR_ORDER as unknown as string[];
      const cur = p.arrowDir as string;
      const target = dir as string;
      let steps = (order.indexOf(target) - order.indexOf(cur) + 8) % 8;
      for (let i = 0; i < steps; i++) actRotateArrow(selected, 'CW', false);
    }

    const v = valueAt(board, selected);
    if (v === 2 && !scatterMode) endTurn(); // V2: orient consumes action; V3+ free
  }

  // scatter targets (two immediate squares along arrow)
  const scatterTargets = useMemo(() => {
    if (!selected || !scatterMode) return null;
    const p = pieceAt(board, selected);
    if (!p || !isKing(p) || !p.arrowDir) return null;
    if (ownerOf(p) !== turn) return null;

    const v = valueAt(board, selected);
    if (v < 2) return null;

    const [dr, dc] = DIRS[p.arrowDir];
    const l1 = { r: selected.r + dr, c: selected.c + dc };
    const l2 = { r: selected.r + 2 * dr, c: selected.c + 2 * dc };
    if (!inBounds(l1.r, l1.c) || !inBounds(l2.r, l2.c)) return null;

    const q1 = pieceAt(board, l1);
    const q2 = pieceAt(board, l2);

    const selfOwner = ownerOf(p);
    // no allies on landing squares
    if ((q1 && ownerOf(q1) === selfOwner) || (q2 && ownerOf(q2) === selfOwner)) {
      return { l1, l2, can: false, budgetNeed: Infinity };
    }

    // capture budget equals current value
    let need = 0;
    if (q1 && ownerOf(q1) !== selfOwner) need += valueAt(board, l1);
    if (q2 && ownerOf(q2) !== selfOwner) need += valueAt(board, l2);
    const can = need <= v;

    return { l1, l2, can, budgetNeed: need };
  }, [board, selected, scatterMode, turn]);

  function onSquareClick(r: number, c: number) {
    const pos = { r, c };

    if (scatterMode) {
      if (scatterTargets && (coordEq(pos, scatterTargets.l1) || coordEq(pos, scatterTargets.l2))) {
        if (scatterTargets.can) {
          actScatter(selected!, scatterTargets.l1, scatterTargets.l2);
          setScatterMode(false);
          endTurn();
        }
        return;
      }
      setScatterMode(false);
      return;
    }

    if (!selected) {
      const p = pieceAt(board, pos);
      if (p && ownerOf(p) === turn) select(pos);
      return;
    }

    const foundMove = legal.moves.find(m => coordEq(m, pos));
    const foundCap  = legal.captures.find(m => coordEq(m, pos));
    const foundComb = legal.combines.find(m => coordEq(m, pos));
    const foundScat = legal.scatters.find(s => coordEq(s.l1, pos) || coordEq(s.l2, pos));

    if (foundMove) { actMove(selected, foundMove); endTurn(); return; }
    if (foundCap)  { actMove(selected, foundCap, true); endTurn(); return; }
    if (foundComb) { actCombine(selected, foundComb); endTurn(); return; }
    if (foundScat) { actScatter(selected, foundScat.l1, foundScat.l2); endTurn(); return; }

    const p2 = pieceAt(board, pos);
    if (p2 && ownerOf(p2) === turn) { select(pos); return; }

    select(null as any);
  }

  const selectedPiece = selected ? pieceAt(board, selected) : undefined;
  const selectedIsKing = !!(selectedPiece && isKing(selectedPiece));
  const selectedValue  = selected ? valueAt(board, selected) : 0;
  const canOrientNow   = selectedIsKing && selectedValue >= 2;

  // rays for ALL kings (grey), selected king (white)
  const rayLines = useMemo(() => {
    const lines: { origin: Coord; path: Coord[]; selected: boolean }[] = [];
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const pos = { r, c };
      const p = pieceAt(board, pos);
      if (!p || !isKing(p) || !p.arrowDir) continue;
      lines.push({
        origin: pos,
        path: getRayForKing(board, pos).segments,
        selected: !!(selected && selected.r === r && selected.c === c),
      });
    }
    return lines;
  }, [board, selected]);

  // help text
  const helpLines = useMemo(() => {
  if (!selectedPiece) return [];
  const v = selectedValue;
  const lines: string[] = [
    v === 0 ? 'Value 0: cannot move, cannot orient.' :
    v === 1 ? 'Value 1: can move one space; cannot orient.' :
    v === 2 ? 'Value 2: move one space OR re-orient (uses your move); move two along ray; scatter over next two along ray.' :
              'Value 3: move one space; free re-orient before moving; slide full length along ray; scatter over next two along ray.',
  ];
  if (selectedIsKing) lines.push('King: ray boosts allies / diminishes enemies in line-of-sight.');
  else lines.push('Single: may combine with adjacent friendly single to form a king.');

  if (pieceAt(board, selected!)?.kind === 'Key') {
    lines.push('This is a key piece. Take your opponent’s key pieces to win the game.');
  }

  lines.push('Keys cannot form kings.');
  return lines;
}, [selectedPiece, selectedIsKing, selectedValue, board, selected]);

  return (
    <div
      className="board-shell"
      style={{
        position: 'relative',
        paddingLeft: 280,           // reserve space so board never shifts
        display: 'block',
        minWidth: SQUARE * 8 + 280,
      }}
    >
      {/* Instructions panel overlays the reserved left area */}
      <div
        className="side-help"
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: 260,
          padding: '10px 12px',
          background: '#1d1d1d',
          border: '1px solid #2c2c2c',
          borderRadius: 8,
          color: '#ddd',
          height: SQUARE * 8,
          overflowY: 'auto',
          opacity: showHelp ? 1 : 0,
          pointerEvents: showHelp ? 'auto' : 'none',
          transition: 'opacity 120ms ease',
        }}
      >
        {selectedPiece ? (
          <>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <strong>Selected: {ownerOf(selectedPiece)} {selectedIsKing ? 'King' : 'Single'}</strong>
              <button onClick={() => setShowHelp(false)}>Hide</button>
            </div>
            <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.35 }}>
              {helpLines.map((t, i) => <div key={i} style={{ marginBottom: 6 }}>• {t}</div>)}
            </div>
            {selectedIsKing && (
              <div style={{ marginTop: 10 }}>
                <button
                  onClick={() => setScatterMode(m => !m)}
                  className={cn({ primary: scatterMode })}
                  title="Scatter over the next two squares along the arrow"
                >
                  {scatterMode ? 'Cancel Scatter' : 'Scatter'}
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <strong>No piece selected</strong>
              <button onClick={() => setShowHelp(false)}>Hide</button>
            </div>
            <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.35, opacity: 0.85 }}>
              Click one of your pieces to see what it can do.
            </div>
          </>
        )}
      </div>

      {/* Toggle when hidden (no layout shift) */}
      {!showHelp && (
        <div style={{ position:'absolute', left: 8, top: 8, zIndex: 2 }}>
          <button onClick={() => setShowHelp(true)}>Show Instructions</button>
        </div>
      )}

      {/* Board SVG */}
      <svg className="board" viewBox={`0 0 ${SQUARE * 8} ${SQUARE * 8}`}>
        {/* Base squares */}
        {[...Array(8)].flatMap((_, r) =>
          [...Array(8)].map((__, c) => {
            const dark = (r + c) % 2 === 1;
            const isSel = selected && selected.r === r && selected.c === c;
            return (
              <rect
                key={`${r}-${c}`}
                x={c * SQUARE} y={r * SQUARE}
                width={SQUARE} height={SQUARE}
                className={cn('sq', { dark, sel: !!isSel })}
                onMouseEnter={() => setHover({ r, c })}
                onMouseLeave={() => setHover(null)}
                onClick={() => onSquareClick(r, c)}
              />
            );
          })
        )}

        {/* Rays as lines for all kings */}
        <g>
          {rayLines.map((l, i) => (
            <RayOverlay
              key={`ray-${i}`}
              origin={l.origin}
              path={l.path}
              selected={l.selected}
              opacity={l.selected ? 1 : 0.9}
            />
          ))}
        </g>

        {/* Scatter highlights */}
        {scatterMode && scatterTargets && (
          ([scatterTargets.l1, scatterTargets.l2] as Coord[]).map((pos, i) => (
            <rect
              key={`scat-${i}`}
              x={pos.c * SQUARE}
              y={pos.r * SQUARE}
              width={SQUARE}
              height={SQUARE}
              fill={scatterTargets.can ? 'rgba(0,200,0,0.28)' : 'rgba(220,0,0,0.28)'}
              stroke={scatterTargets.can ? 'rgba(0,200,0,0.9)' : 'rgba(220,0,0,0.9)'}
              strokeWidth={2}
              onClick={() => onSquareClick(pos.r, pos.c)}
            />
          ))
        )}

        {/* Pieces */}
        {[...Array(8)].flatMap((_, r) =>
          [...Array(8)].map((__, c) => {
            const p = pieceAt(board, { r, c });
            if (!p) return null;
            const isSel = selected && selected.r === r && selected.c === c ? 'selected' : undefined;
            return <PieceView key={`p-${r}-${c}`} pos={{ r, c }} piece={p} highlight={isSel} />;
          })
        )}

        {/* Hover value */}
        {hover && hoverValue !== null && pieceAt(board, hover) && (
          <text
            x={hover.c * SQUARE + SQUARE / 2}
            y={hover.r * SQUARE + SQUARE / 2 + 6}
            textAnchor="middle"
            className="hoverVal"
            fill={ownerOf(pieceAt(board, hover)!) === 'Black' ? '#fff' : '#111'}
          >
            {hoverValue}
          </text>
        )}

        {/* Orientation dots (value ≥ 2) */}
        {selected && canOrientNow && (() => {
          const cx = selected.c * SQUARE + SQUARE / 2;
          const cy = selected.r * SQUARE + SQUARE / 2;
          const radius = SQUARE * 0.42;
          return (
            <g className="orient-dots">
              {DIR_ORDER.map((d) => {
                const ang = dirToAngle(d) * Math.PI / 180;
                const dx = Math.cos(ang) * radius;
                const dy = Math.sin(ang) * radius;
                const x = cx + dx;
                const y = cy + dy;
                return (
                  <circle
                    key={d}
                    cx={x}
                    cy={y}
                    r={6}
                    fill="white"
                    stroke="black"
                    strokeWidth={1}
                    style={{ cursor: 'pointer' }}
                    onClick={(e) => { e.stopPropagation(); handleOrient(d); }}
                  />
                );
              })}
            </g>
          );
        })()}

        {/* GREEN highlights: every legal destination (moves, combines, captures) */}
{selected && !scatterMode && (() => {
  // merge and dedupe all destinations
  const all: Coord[] = [
    ...legal.moves,       // empty squares you can move to
    ...legal.combines,    // friendly singles you can combine with
    ...legal.captures,    // enemy pieces you can capture (incl. keys/kings)
  ];
  const seen = new Set<string>();
  const uniq = all.filter(p => {
    const k = `${p.r}-${p.c}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return uniq.map((m, i) => (
    <rect
      key={`dest-${i}`}
      x={m.c * SQUARE}
      y={m.r * SQUARE}
      width={SQUARE}
      height={SQUARE}
      fill="rgba(0,200,0,0.25)"
      stroke="rgba(0,200,0,0.9)"
      strokeWidth={2}
      onClick={() => onSquareClick(m.r, m.c)}
    />
  ));
})()}

      </svg>
    </div>
  );
}
