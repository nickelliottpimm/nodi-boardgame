// src/components/Board.tsx
import { useMemo, useState } from "react";
import { PieceView } from "./Piece";
import { RayOverlay } from "./RayOverlay";
import {
  pieceAt,
  isKing,
  ownerOf,
  valueAt,
  legalMovesFor,
  getRayForKing,
} from "../game/rules";
import { useGame } from "../store/gameStore";
import { SQUARE, Coord } from "../game/types";

export function BoardView() {
  const {
    board,
    turn,
    selected,
    select,
    actMove,
    actScatter,
    rotatePreview,
    confirmRotate,
    cancelRotate,
    scatterMode,
    scatterSquares,
    setScatterMode,
    cancelScatter,
    confirmScatter,
  } = useGame();

  const [hovered, setHovered] = useState<Coord | null>(null);

  // compute moves for selected piece
  const moves = useMemo(() => {
    if (!selected) return [];
    return legalMovesFor(board, selected, turn);
  }, [board, selected, turn]);

  // compute rays for kings
  const rays = useMemo(() => {
    const out: { rays: Coord[]; selected: boolean }[] = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = pieceAt(board, { r, c });
        if (p && isKing(p) && p.arrowDir) {
          out.push({
            rays: getRayForKing(board, { r, c }),
            selected: selected?.r === r && selected?.c === c,
          });
        }
      }
    }
    return out;
  }, [board, selected]);

  return (
    <div
      style={{
        position: "relative",
        width: SQUARE * 8,
        height: SQUARE * 8,
        marginLeft: 280, // leaves gap for info panel
      }}
    >
      {/* Rays */}
      {rays.map((ray, i) => (
        <RayOverlay key={i} rays={ray.rays} selected={ray.selected} />
      ))}

      {/* Board squares */}
      <svg
        width={SQUARE * 8}
        height={SQUARE * 8}
        style={{ display: "block" }}
      >
        {[...Array(8)].map((_, r) =>
          [...Array(8)].map((_, c) => {
            const isMove =
              moves.some((m) => m.r === r && m.c === c) ||
              (scatterSquares &&
                scatterSquares.some((sq) => sq.r === r && sq.c === c));

            return (
              <rect
                key={`${r}-${c}`}
                x={c * SQUARE}
                y={r * SQUARE}
                width={SQUARE}
                height={SQUARE}
                fill={(r + c) % 2 === 0 ? "#ddd" : "#555"}
                stroke="black"
                onClick={() => select({ r, c })}
                onMouseEnter={() => setHovered({ r, c })}
                onMouseLeave={() => setHovered(null)}
                style={{
                  cursor: "pointer",
                  fillOpacity: isMove ? 0.5 : 1,
                  fill: isMove
                    ? "green"
                    : (r + c) % 2 === 0
                    ? "#ddd"
                    : "#555",
                }}
              />
            );
          })
        )}
      </svg>

      {/* Pieces */}
      {board.map((row, r) =>
        row.map((p, c) =>
          p ? (
            <PieceView
              key={`${r}-${c}`}
              piece={p}
              pos={{ r, c }}
              hovered={
                hovered?.r === r && hovered?.c === c ? hovered : undefined
              }
              selected={selected?.r === r && selected?.c === c}
            />
          ) : null
        )
      )}

      {/* Scatter controls */}
      {scatterMode && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            background: "#222",
            color: "white",
            padding: 8,
          }}
        >
          <button onClick={confirmScatter}>Confirm Scatter</button>
          <button onClick={cancelScatter}>Cancel Scatter</button>
        </div>
      )}

      {/* Rotate controls */}
      {rotatePreview && (
        <div
          style={{
            position: "absolute",
            top: 40,
            left: 0,
            background: "#222",
            color: "white",
            padding: 8,
          }}
        >
          <button onClick={confirmRotate}>Confirm Rotation</button>
          <button onClick={cancelRotate}>Cancel Rotation</button>
        </div>
      )}
    </div>
  );
}
