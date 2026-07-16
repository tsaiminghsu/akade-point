"use client";
import GridScene from "./GridScene";
import DiceScene2 from "./DiceScene2";
import type { Ball, GamePhase, WinCell } from "./JiuGongGeGame";

interface JiuGongGeSceneProps {
  balls: Ball[];
  phase: GamePhase;
  winCells: WinCell[];
  holePositions: [number, number, number][];
  diceValues: [number, number];
  diceRollId: number;
  diceFinalPos: [[number,number,number],[number,number,number]];
  diceWon: boolean;
}

export default function JiuGongGeScene({
  balls, phase, winCells, holePositions,
  diceValues, diceRollId, diceFinalPos, diceWon,
}: JiuGongGeSceneProps) {
  return (
    <div className="flex" style={{ height: 340 }}>
      {/* Left: 九宮格 grid (50%) */}
      <div className="relative w-0 flex-1 min-w-0 overflow-hidden">
        <div className="absolute top-1 left-2 z-10 text-[10px] text-amber-400/70 font-bold tracking-widest">
          九宮格
        </div>
        <GridScene
          balls={balls}
          phase={phase}
          winCells={winCells}
          holePositions={holePositions}
        />
      </div>

      {/* Divider */}
      <div className="w-px bg-amber-500/20 self-stretch my-2 flex-none" />

      {/* Right: 風骰 dice (50%) */}
      <div className="relative w-0 flex-1 min-w-0 overflow-hidden">
        <div className="absolute top-1 right-2 z-10 text-[10px] text-amber-400/70 font-bold tracking-widest">
          風骰
        </div>
        <DiceScene2
          diceValues={diceValues}
          phase={phase}
          rollId={diceRollId}
          diceFinalPos={diceFinalPos}
          diceWon={diceWon}
        />
      </div>
    </div>
  );
}
