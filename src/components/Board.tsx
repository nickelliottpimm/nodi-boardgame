// src/components/Board.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import cn from 'classnames';
import { SQUARE, coordEq, DIRS } from '../game/types';
import type { Coord } from '../game/types';
import type { Board } from '../game/rules';
import { useGame } from '../store/gameStore';
import {
  isKing, pieceAt, valueAt, legalMovesFor, getRayForKing, ownerOf
} from '../game/rules';
import type { Piece } from '../game/rules';
import { scatterBases, validateScatter } from '../game/scatter';
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

function nextCW(dir: AllDir): AllDir {
  const i = DIR_ORDER.indexOf(dir);
  return DIR_ORDER[(i + 1) % 8];
}

const isKeyPiece = (p: Piece) => p.counters.length === 1 && p.counters[0].isKey;

type AnimState =
  | null
  | { kind: 'move'; from: Coord; to: Coord; owner: 'White' | 'Black' }
  | { kind: 'scatter'; from: Coord; l1: Coord; l2: Coord; owner: 'White' | 'Black' };

/** FULL current value (counters ± rays) for hover display. */
function fullValueAt(board: Board, pos: Coord): number {
  const p = pieceAt(board, pos);
  if (!p) return 0;
  let total = p.counters.length;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const qpos = { r, c };
    const q = pieceAt(board, qpos);
    if (!q || !isKing(q) || !q.arrowDir) continue;
    const path = getRayForKing(board, qpos);
    const hits = path.some(s => s.r === pos.r && s.c === pos.c);
    if (hits) total += ownerOf(q) === ownerOf(p) ? 1 : -1;
  }
  return total;
}

export function BoardView({ values }: { values: number[][] }) {
  const {
    board, turn, selected, select,
    actMove, actRotateArrow, actCombine, actScatter, endTurn,
  } = useGame();

  const [hover, setHover] = useState<Coord | null>(null);
  const [showHelp, setShowHelp] = useState(true);

  // Scatter
  const [scatterMode, setScatterMode] = useState(false);
  const [scatterBase, setScatterBase] = useState<Coord | null>(null);

  // Rotation (buffered preview)
  const [rotateMode, setRotateMode] = useState(false);
  const [previewDir, setPreviewDir] = useState<AllDir | null>(null);

  // Animation overlay
  const [anim, setAnim] = useState<AnimState>(null);
  const [animGo, setAnimGo] = useState(false);
  const animTimeout = useRef<number | null>(null);

  const legal = useMemo(() => {
    if (!selected || scatterMode || rotateMode) {
      return { moves: [], combines: [], captures: [], scatters: [], rotations: [] as ('CW'|'CCW'|'ANY')[] };
    }
    return legalMovesFor(board, selected);
  }, [board, selected, scatterMode, rotateMode]);

  const hoverValue = useMemo(() => {
    if (!hover) return null;
    return fullValueAt(board, hover);
  }, [board, hover]);

  function onSquareClick(r: number, c: number) {
    const pos = { r, c };

    if (scatterMode) {
      if (!selected) return;
      const p = pieceAt(board, selected);
      if (!p || !isKing(p) || !p.arrowDir) return;
      const [dr, dc] = DIRS[p.arrowDir];
      const candidateBase = { r: r - dr, c: c - dc };
      const bases = scatterBases(board, selected);
      if (bases.some(b => b.r === candidateBase.r && b.c === candidateBase.c)) {
        setScatterBase(candidateBase);
      }
      return;
    }

    if (rotateMode) return;

    if (!selected) {
      const p = pieceAt(board, pos);
      if (p && ownerOf(p) === turn) select(pos);
      return;
    }

    const foundMove = legal.moves.find(m => coordEq(m, pos));
    const foundCap  = legal.captures.find(m => coordEq(m, pos));
    const foundComb = legal.combines.find(m => coordEq(m, pos));

    const movingPiece = pieceAt(board, selected);
    const owner = movingPiece ? ownerOf(movingPiece) : 'White';

    if (foundMove || foundCap || foundComb) {
      setAnim({ kind: 'move', from: selected, to: pos, owner });
      setAnimGo(false);
      requestAnimationFrame(() => requestAnimationFrame(() => setAnimGo(true)));
      if (animTimeout.current) window.clearTimeout(animTimeout.current);
      animTimeout.current = window.setTimeout(() => {
        if (foundComb) actCombine(selected, pos);
        else actMove(selected, pos, !!foundCap);
        setAnim(null);
        endTurn();
      }, 180);
      return;
    }

    const p2 = pieceAt(board, pos);
    if (p2 && ownerOf(p2) === turn) { select(pos); return; }

    select(null as any);
  }

  function handleOrient(dir: AllDir) {
    if (!selected) return;
    const p = pieceAt(board, selected);
    if (!p || !isKing(p) || !p.arrowDir) return;
    if (ownerOf(p) !== turn) return;
    setRotateMode(true);
    setPreviewDir(dir);
  }

  function nextCWDir(d: AllDir): AllDir {
    const i = DIR_ORDER.indexOf(d);
    return DIR_ORDER[(i + 1) % 8];
  }

  function cycleRotationCW() {
    if (!selected) return;
    const p = pieceAt(board, selected);
    if (!p || !isKing(p) || !p.arrowDir) return;
    setRotateMode(true);
    setPreviewDir(prev => {
      if (!prev) return nextCWDir(p.arrowDir as AllDir);
      return nextCWDir(prev);
    });
  }

  function confirmRotation() {
    if (!selected) return;
    const p = pieceAt(board, selected);
    if (!p || !isKing(p) || !p.arrowDir || !previewDir) { setRotateMode(false); setPreviewDir(null); return; }
    const order = DIR_ORDER as unknown as string[];
    const cur = p.arrowDir as string;
    let steps = (order.indexOf(previewDir) - order.indexOf(cur) + 8) % 8;
    for (let i = 0; i < steps; i++) actRotateArrow(selected, 'CW', false);
    const vEff = valueAt(board, selected);
    if (vEff === 2) endTurn();
    setRotateMode(false);
    setPreviewDir(null);
  }

  function cancelRotation() {
    setRotateMode(false);
    setPreviewDir(null);
  }

  const scatterInfo = useMemo(() => {
    if (!selected || !scatterMode) return null;
    const p = pieceAt(board, selected);
    if (!p || !isKing(p) || !p.arrowDir) return null;
    if (ownerOf(p) !== turn) return null;
    const bases = scatterBases(board, selected);
    if (bases.length === 0) return null;
    const chosen = scatterBase && bases.some(b => b.r === scatterBase.r && b.c === scatterBase.c)
      ? scatterBase : bases[0];
    const val = validateScatter(board, selected, chosen);
    return { bases, base: chosen, ...val };
  }, [board, selected, scatterMode, scatterBase, turn]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!selected) return;
      if (e.key === 's' || e.key === 'S') { setScatterMode(true); setScatterBase(selected); }
      if (e.key === 'r' || e.key === 'R') { cycleRotationCW(); }
      if (e.key === 'Enter') {
        if (scatterMode && scatterInfo?.can) {
          const owner = ownerOf(pieceAt(board, selected)!);
          setAnim({ kind: 'scatter', from: selected, l1: scatterInfo.l1, l2: scatterInfo.l2, owner });
          setAnimGo(false);
          requestAnimationFrame(() => requestAnimationFrame(() => setAnimGo(true)));
          if (animTimeout.current) window.clearTimeout(animTimeout.current);
          animTimeout.current = window.setTimeout(() => {
            actScatter(selected, scatterInfo.l1, scatterInfo.l2);
            setAnim(null);
            setScatterMode(false);
            setScatterBase(null);
            endTurn();
          }, 200);
        } else if (rotateMode) {
          confirmRotation();
        }
      }
      if (e.key === 'Escape') {
        if (scatterMode) { setScatterMode(false); setScatterBase(null); }
        if (rotateMode)  { cancelRotation(); }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, scatterMode, scatterInfo, rotateMode, previewDir, board]);

  useEffect(() => () => { if (animTimeout.current) window.clearTimeout(animTimeout.current); }, []);

  const selectedPiece = selected ? pieceAt(board, selected) : undefined;
  const selectedIsKing = !!(selectedPiece && isKing(selectedPiece));
  const selectedValueAbility = selected ? valueAt(board, selected) : 0;
  const canOrientNow = selectedIsKing && selectedValueAbility >= 2;

  const rayLines = useMemo(() => {
    const lines: { origin: Coord; path: Coord[]; selected: boolean }[] = [];
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const pos = { r, c };
      const p = pieceAt(board, pos);
      if (!p || !isKing(p) || !p.arrowDir) continue;
      lines.push({
        origin: pos,
        path: getRayForKing(board, pos),
        selected: !!(selected && selected.r === r && selected.c === c),
      });
    }
    return lines;
  }, [board, selected]);

  const helpLines = useMemo(() => {
    if (!selectedPiece) return [];
    const vAbility = selectedValueAbility;
    const lines: string[] = [
      vAbility === 0 ? 'Value 0: cannot move, cannot orient.' :
      vAbility === 1 ? 'Value 1: can move one space; cannot orient.' :
      vAbility === 2 ? 'Value 2: move one space OR re-orient (uses your move); move two along ray; scatter over next two along ray.' :
                       'Value 3: move one space; free re-orient before moving; slide full length along ray; scatter from any slide base (next two along ray).',
    ];
    if (selectedIsKing) lines.push('King: ray boosts allies / diminishes enemies in line-of-sight.');
    else lines.push('Single: may combine with adjacent friendly single to form a king.');
    if (selectedPiece && isKeyPiece(selectedPiece)) lines.push("This is a key piece. Take your opponent’s key pieces to win the game.");
    lines.push('Keys cannot form kings.');
    lines.push('Hotkeys: S=Scatter, R=Rotate, Enter=Confirm, Esc=Cancel.');
    return lines;
  }, [selectedPiece, selectedIsKing, selectedValueAbility]);

  const allDestinations: Coord[] = useMemo(() => {
    if (!selected || scatterMode || rotateMode) return [];
    const all = [...legal.moves, ...legal.combines, ...legal.captures];
    const seen = new Set<string>();
    return all.filter(p => {
      const k = `${p.r}-${p.c}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [legal, scatterMode, rotateMode, selected]);

  function centerOf(pos: Coord) {
    return { x: pos.c * SQUARE + SQUARE / 2, y: pos.r * SQUARE + SQUARE / 2 };
  }

  return (
    <div className="board-shell" style={{ position:'relative', paddingLeft:300, display:'block' }}>
      {/* Left info panel */}
      <div
        className="side-help"
        style={{
          position:'absolute', left:0, top:0, width:260, padding:'10px 12px',
          background:'#1d1d1d', border:'1px solid #2c2c2c', borderRadius:8, color:'#ddd',
          height:SQUARE*8, overflowY:'auto', opacity:1, pointerEvents:'auto', marginRight:40
        }}
      >
        {selectedPiece ? (
          <>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <strong>Selected: {ownerOf(selectedPiece)} {selectedIsKing ? 'King' : 'Single'}</strong>
            </div>
            <div style={{ marginTop: 8, fontSize: 14 }}>
              Current value (counters ± rays): <strong>{selected ? fullValueAt(board, selected) : '-'}</strong>
            </div>
            <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.35 }}>
              {helpLines.map((t, i) => <div key={i} style={{ marginBottom: 6 }}>• {t}</div>)}
            </div>

            {/* Rotate controls */}
            {selectedIsKing && canOrientNow && (
              <div style={{ marginTop: 12, display:'flex', flexDirection:'column', gap:6 }}>
                {!rotateMode ? (
                  <button onClick={() => {
                    const p = pieceAt(board, selected!)!;
                    const start = (p && isKing(p) && p.arrowDir) ? nextCW(p.arrowDir as AllDir) : 'N';
                    setRotateMode(true);
                    setPreviewDir(start as AllDir);
                  }}>Rotate</button>
                ) : (
                  <>
                    <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                      <button onClick={cycleRotationCW}>Rotate</button>
                    </div>
                    <div style={{ display:'flex', gap:8 }}>
                      <button onClick={() => { setRotateMode(false); setPreviewDir(null); }}>Cancel Rotation</button>
                      <button className="primary" onClick={confirmRotation}>Confirm Rotation</button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Scatter controls */}
            {selectedIsKing && (
              <div style={{ marginTop: 12, display:'flex', flexDirection:'column', gap:6 }}>
                {!scatterMode ? (
                  <button className="primary" onClick={() => { if (!selected) return; setScatterMode(true); setScatterBase(selected); }}>
                    Scatter
                  </button>
                ) : (
                  <>
                    <button onClick={() => { setScatterMode(false); setScatterBase(null); }}>Cancel Scatter</button>
                    <button
                      disabled={!scatterInfo?.can}
                      className="primary"
                      onClick={() => {
                        if (!selected || !scatterInfo) return;
                        const owner = ownerOf(pieceAt(board, selected)!);
                        setAnim({ kind:'scatter', from:selected, l1:scatterInfo.l1, l2:scatterInfo.l2, owner });
                        setAnimGo(false);
                        requestAnimationFrame(() => requestAnimationFrame(() => setAnimGo(true)));
                        if (animTimeout.current) window.clearTimeout(animTimeout.current);
                        animTimeout.current = window.setTimeout(() => {
                          actScatter(selected, scatterInfo.l1, scatterInfo.l2);
                          setAnim(null);
                          setScatterMode(false);
                          setScatterBase(null);
                          endTurn();
                        }, 200);
                      }}
                    >
                      Confirm Scatter
                    </button>
                  </>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            <strong>No piece selected</strong>
            <div style={{ marginTop: 8, fontSize: 13, opacity: 0.85 }}>
              Click one of your pieces to see what it can do.
            </div>
          </>
        )}
      </div>

      {/* Board */}
      <div style={{ position:'relative', display:'inline-block' }}>
        <svg className="board" viewBox={`0 0 ${SQUARE*8} ${SQUARE*8}`} style={{ width:'min(92vmin, 100vw)', height:'auto' }}>
          {/* Squares */}
          {[...Array(8)].flatMap((_, r) =>
            [...Array(8)].map((__, c) => {
              const isSel = selected && selected.r === r && selected.c === c;
              const dark = (r + c) % 2 === 1;
              return (
                <rect
                  key={`${r}-${c}`} x={c*SQUARE} y={r*SQUARE} width={SQUARE} height={SQUARE}
                  className={cn('sq', { dark, sel: !!isSel })}
                  onMouseEnter={() => setHover({ r, c })} onMouseLeave={() => setHover(null)}
                  onClick={() => onSquareClick(r, c)}
                />
              );
            })
          )}

          {/* Rays */}
          <g>
            {rayLines.map((l, i) => (
              <RayOverlay key={`ray-${i}`} origin={l.origin} path={l.path} selected={l.selected} opacity={l.selected ? 1 : 0.9} />
            ))}
          </g>

          {/* Scatter bases (V3+) */}
          {scatterMode && scatterInfo && scatterInfo.bases.length > 1 && scatterInfo.bases.map((b, i) => (
            <rect key={`base-${i}`} x={b.c*SQUARE} y={b.r*SQUARE} width={SQUARE} height={SQUARE}
              fill="none" stroke={(scatterInfo.base.r===b.r && scatterInfo.base.c===b.c)?'rgba(0,200,255,0.9)':'rgba(0,200,255,0.5)'}
              strokeDasharray="6 4" strokeWidth={2} onClick={() => setScatterBase(b)}
            />
          ))}

          {/* Scatter landing squares */}
          {scatterMode && scatterInfo && (
            <>
              {[scatterInfo.l1, scatterInfo.l2].map((pos, i) => (
                <rect key={`scat-${i}`} x={pos.c*SQUARE} y={pos.r*SQUARE} width={SQUARE} height={SQUARE}
                  fill={scatterInfo.can ? 'rgba(0,200,0,0.28)' : 'rgba(220,0,0,0.28)'}
                  stroke={scatterInfo.can ? 'rgba(0,200,0,0.9)' : 'rgba(220,0,0,0.9)'}
                  strokeWidth={2} pointerEvents="none"
                />
              ))}
            </>
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

          {/* Orientation dots */}
          {selected && canOrientNow && !scatterMode && (() => {
            const cx = selected.c*SQUARE + SQUARE/2;
            const cy = selected.r*SQUARE + SQUARE/2;
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
                    <circle key={d} cx={x} cy={y} r={6} fill="white" stroke="black" strokeWidth={1}
                      style={{ cursor:'pointer' }} onClick={(e) => { e.stopPropagation(); handleOrient(d); }}
                    />
                  );
                })}
              </g>
            );
          })()}

          {/* All legal destinations */}
          {selected && !scatterMode && !rotateMode && (() => {
            const seen = new Set<string>();
            return allDestinations.map((m, i) => {
              const k = `${m.r}-${m.c}`;
              if (seen.has(k)) return null;
              seen.add(k);
              return (
                <rect key={`dest-${i}`} x={m.c*SQUARE} y={m.r*SQUARE} width={SQUARE} height={SQUARE}
                  fill="rgba(0,200,0,0.25)" stroke="rgba(0,200,0,0.9)" strokeWidth={2}
                  onClick={() => onSquareClick(m.r, m.c)}
                />
              );
            });
          })()}

          {/* Move animation */}
          {anim && anim.kind === 'move' && (() => {
            const from = centerOf(anim.from);
            const to = centerOf(anim.to);
            return (
              <g style={{
                transform:`translate(${from.x}px, ${from.y}px)`,
                transition:'transform 180ms ease',
                ...(animGo ? { transform:`translate(${to.x}px, ${to.y}px)` } : {})
              }}>
                <circle r={SQUARE * 0.28} fill={anim.owner === 'Black' ? '#111' : '#eee'} stroke={anim.owner === 'Black' ? '#eee' : '#111'} strokeWidth={2} />
              </g>
            );
          })()}

          {/* Scatter animation */}
          {anim && anim.kind === 'scatter' && (() => {
            const from = centerOf(anim.from);
            const t1 = centerOf(anim.l1);
            const t2 = centerOf(anim.l2);
            return (
              <>
                <g style={{
                  transform:`translate(${from.x}px, ${from.y}px)`,
                  transition:'transform 200ms ease',
                  ...(animGo ? { transform:`translate(${t1.x}px, ${t1.y}px)` } : {})
                }}>
                  <circle r={SQUARE * 0.24} fill={anim.owner === 'Black' ? '#111' : '#eee'} stroke={anim.owner === 'Black' ? '#eee' : '#111'} strokeWidth={2} />
                </g>
                <g style={{
                  transform:`translate(${from.x}px, ${from.y}px)`,
                  transition:'transform 200ms ease',
                  ...(animGo ? { transform:`translate(${t2.x}px, ${t2.y}px)` } : {})
                }}>
                  <circle r={SQUARE * 0.24} fill={anim.owner === 'Black' ? '#111' : '#eee'} stroke={anim.owner === 'Black' ? '#eee' : '#111'} strokeWidth={2} />
                </g>
              </>
            );
          })()}

          {/* Rotation PREVIEW arrow (overlay) */}
          {rotateMode && selected && selectedIsKing && previewDir && (() => {
            const cx = selected.c*SQUARE + SQUARE/2;
            const cy = selected.r*SQUARE + SQUARE/2;
            const ang = (dirToAngle(previewDir) + 90) % 360; // align preview with commit
            const pc = pieceAt(board, selected)!;
            const stroke = ownerOf(pc) === 'Black' ? '#eee' : '#111';
            return (
              <g transform={`translate(${cx} ${cy}) rotate(${ang})`}>
                <path d="M -10,12 L 0,-14 L 10,12" fill="none" stroke={stroke} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
              </g>
            );
          })()}
        </svg>
      </div>
    </div>
  );
}
