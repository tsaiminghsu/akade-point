"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import { OrbCell } from "./orb-cell";
import type { OrbColor } from "@/lib/game/orb-generator";

const COLS = 6;
const ORB_SIZE = 52;
const GAP = 4;

function idxFromPointer(
  e: React.PointerEvent,
  containerRef: React.RefObject<HTMLDivElement>
): number | null {
  const rect = containerRef.current?.getBoundingClientRect();
  if (!rect) return null;
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const col = Math.floor(x / (ORB_SIZE + GAP));
  const row = Math.floor(y / (ORB_SIZE + GAP));
  if (col < 0 || col >= COLS || row < 0 || row >= 5) return null;
  return row * COLS + col;
}

export function OrbGrid({
  initialGrid,
  disabled,
  onGridChange,
  onRelease,
  onStartDrag,
  matchedIndices,
}: {
  initialGrid: OrbColor[];
  disabled: boolean;
  onGridChange: (grid: OrbColor[]) => void;
  onRelease?: (grid: OrbColor[]) => void;
  onStartDrag?: () => void;
  matchedIndices?: Set<number>;
}) {
  const [grid, setGrid] = useState<OrbColor[]>([...initialGrid]);
  const [heldIdx, setHeldIdx] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null!);
  const gridRef = useRef<OrbColor[]>([...initialGrid]);

  // 當外部傳入的 initialGrid 更新時（例如消珠/下落的動畫步驟），同步更新內部狀態
  useEffect(() => {
    setGrid([...initialGrid]);
    gridRef.current = [...initialGrid];
  }, [initialGrid]);

  const swap = useCallback((a: number, b: number) => {
    const next = [...gridRef.current];
    [next[a], next[b]] = [next[b], next[a]];
    gridRef.current = next;
    setGrid(next);
    onGridChange(next);
  }, [onGridChange]);

  const onPointerDown = (e: React.PointerEvent, idx: number) => {
    if (disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setHeldIdx(idx);
    onStartDrag?.();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (heldIdx === null || disabled) return;
    const newIdx = idxFromPointer(e, containerRef);
    if (newIdx !== null && newIdx !== heldIdx) {
      swap(heldIdx, newIdx);
      setHeldIdx(newIdx);
    }
  };

  const onPointerUp = () => {
    if (heldIdx !== null) {
      setHeldIdx(null);
      onRelease?.(gridRef.current);
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative select-none touch-none"
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${COLS}, ${ORB_SIZE}px)`,
        gap: GAP,
        padding: 8,
        background: "rgba(0,0,0,0.3)",
        borderRadius: 16,
        border: "1px solid rgba(255,255,255,0.1)",
      }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
    >
      {grid.map((color, idx) => (
        <div key={idx} onPointerDown={(e) => onPointerDown(e, idx)}>
          <OrbCell 
            color={color} 
            isHeld={heldIdx === idx} 
            isMatched={matchedIndices?.has(idx)}
            size={ORB_SIZE} 
          />
        </div>
      ))}
    </div>
  );
}
