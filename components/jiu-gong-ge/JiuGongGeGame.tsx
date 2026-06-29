"use client";
import { useState, useCallback, useRef } from "react";
import JiuGongGeScene from "./JiuGongGeScene";
import GameHUD from "./GameHUD";

export type BallColor = "red" | "blue" | "green";
export type GamePhase =
  | "ready" | "inserting" | "vibrating" | "rolling"
  | "settling" | "checking" | "result";

export interface Ball {
  id: number;
  color: BallColor;
  row: number;
  col: number;
}

export interface WinCell { row: number; col: number; }

export const GRID_COLS = 3;
export const GRID_ROWS = 3;
export const HOLE_SPACING = 1.1;
export const BALL_R = 0.42;
export const CONTAINER_H = 2.8;
export const FLOOR_T = 0.18;
export const WALL_T = 0.07;

export function calcContainerSize() {
  const side = GRID_COLS * HOLE_SPACING + 1.4;
  return { containerW: side, containerD: side };
}

export function calcHolePositions(): [number, number, number][] {
  const holeY = FLOOR_T + BALL_R;
  const positions: [number, number, number][] = [];
  for (let r = 0; r < GRID_ROWS; r++)
    for (let c = 0; c < GRID_COLS; c++)
      positions.push([
        (c - (GRID_COLS - 1) / 2) * HOLE_SPACING,
        holeY,
        (r - (GRID_ROWS - 1) / 2) * HOLE_SPACING,
      ]);
  return positions;
}

const COLORS: BallColor[] = ["red", "blue", "green"];
const COST = 10;
const STARTING_CREDITS = 50;

const PHASE_DURATIONS: Record<GamePhase, number> = {
  ready: 0, inserting: 400, vibrating: 800,
  rolling: 2400, settling: 900, checking: 1200, result: 3000,
};

function makeBalls(): Ball[] {
  const colors: BallColor[] = [];
  for (const c of COLORS) for (let i = 0; i < 3; i++) colors.push(c);
  for (let i = colors.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [colors[i], colors[j]] = [colors[j], colors[i]];
  }
  return colors.map((color, i) => ({
    id: i, color,
    row: Math.floor(i / GRID_COLS),
    col: i % GRID_COLS,
  }));
}

function shuffleBalls(balls: Ball[]): Ball[] {
  const positions = balls.map((b) => [b.row, b.col] as [number, number]);
  for (let i = positions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [positions[i], positions[j]] = [positions[j], positions[i]];
  }
  return balls.map((ball, i) => ({ ...ball, row: positions[i][0], col: positions[i][1] }));
}

function detectGridWin(balls: Ball[]): { cells: WinCell[]; won: boolean } {
  const grid: (BallColor | null)[][] = Array.from({ length: GRID_ROWS }, () =>
    Array(GRID_COLS).fill(null)
  );
  for (const b of balls) grid[b.row][b.col] = b.color;

  const winSet = new Set<string>();

  // Check rows
  for (let r = 0; r < GRID_ROWS; r++) {
    const row = grid[r];
    if (row[0] !== null && row[0] === row[1] && row[1] === row[2]) {
      for (let c = 0; c < GRID_COLS; c++) winSet.add(`${r},${c}`);
    }
  }
  // Check columns
  for (let c = 0; c < GRID_COLS; c++) {
    if (grid[0][c] !== null && grid[0][c] === grid[1][c] && grid[1][c] === grid[2][c]) {
      for (let r = 0; r < GRID_ROWS; r++) winSet.add(`${r},${c}`);
    }
  }

  const cells = Array.from(winSet).map((k) => {
    const [r, c] = k.split(",").map(Number);
    return { row: r, col: c };
  });
  return { cells, won: cells.length > 0 };
}

function detectDiceWin(values: [number, number]): boolean {
  return values[0] === 5 && values[1] === 5; // both 中
}

function rollDice(): [number, number] {
  return [
    Math.ceil(Math.random() * 6),
    Math.ceil(Math.random() * 6),
  ];
}

const DICE_FINAL_POS: [[number,number,number],[number,number,number]] = [[-0.38, 0.4, 0], [0.38, 0.4, 0]];

export default function JiuGongGeGame() {
  const [balls, setBalls] = useState<Ball[]>(() => makeBalls());
  const [diceValues, setDiceValues] = useState<[number, number]>([1, 1]);
  const [diceRollId, setDiceRollId] = useState(0);
  const [credits, setCredits] = useState(STARTING_CREDITS);
  const [phase, setPhase] = useState<GamePhase>("ready");
  const [winCells, setWinCells] = useState<WinCell[]>([]);
  const [gridWon, setGridWon] = useState(false);
  const [diceWon, setDiceWon] = useState(false);
  const [lastPrize, setLastPrize] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const holePositions = calcHolePositions();

  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  const after = (ms: number, fn: () => void) => {
    const t = setTimeout(fn, ms); timers.current.push(t);
  };

  const handlePlay = useCallback(() => {
    if (phase !== "ready" || credits < COST) return;
    clearTimers();
    setCredits((c) => c - COST);
    setWinCells([]);
    setGridWon(false);
    setDiceWon(false);
    setLastPrize(0);

    const newDice = rollDice();
    setDiceValues(newDice);
    setDiceRollId((id) => id + 1);

    setPhase("inserting");
    after(PHASE_DURATIONS.inserting, () => {
      setPhase("vibrating");
      after(PHASE_DURATIONS.vibrating, () => {
        setPhase("rolling");
        const newBalls = shuffleBalls(balls);
        after(PHASE_DURATIONS.rolling, () => {
          setBalls(newBalls);
          setPhase("settling");
          after(PHASE_DURATIONS.settling, () => {
            setPhase("checking");
            const { cells, won: gWon } = detectGridWin(newBalls);
            const dWon = detectDiceWin(newDice);
            setWinCells(cells);
            setGridWon(gWon);
            setDiceWon(dWon);
            let prize = 0;
            if (gWon && dWon) prize = 120;
            else if (dWon) prize = 40;
            else if (gWon) prize = 25;
            setLastPrize(prize);
            after(PHASE_DURATIONS.checking, () => {
              if (prize > 0) setCredits((c) => c + prize);
              setPhase("result");
              after(PHASE_DURATIONS.result, () => {
                setWinCells([]);
                setPhase("ready");
              });
            });
          });
        });
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, credits, balls]);

  return (
    <main className="min-h-screen bg-[#070b13] flex flex-col items-center justify-center p-3 overflow-hidden">
      <div
        className="relative w-full max-w-lg rounded-3xl border-4 border-amber-500 bg-[#0d0a00]"
        style={{ boxShadow: "0 0 60px rgba(245,158,11,0.35), inset 0 0 40px rgba(0,0,0,0.8)" }}
      >
        {/* Title */}
        <div className="flex items-center justify-center gap-2 pt-4 pb-2 px-4">
          <div className="h-px flex-1 bg-amber-500/40" />
          <h1
            className="text-amber-400 font-black text-xl tracking-widest"
            style={{ textShadow: "0 0 20px rgba(245,158,11,0.8)" }}
          >
            九宮格 × 風骰
          </h1>
          <div className="h-px flex-1 bg-amber-500/40" />
        </div>

        {/* Scenes */}
        <div className="mx-3 mb-3 rounded-lg bg-black/70 border border-white/10 overflow-hidden">
          <JiuGongGeScene
            balls={balls}
            phase={phase}
            winCells={winCells}
            holePositions={holePositions}
            diceValues={diceValues}
            diceRollId={diceRollId}
            diceFinalPos={DICE_FINAL_POS}
            diceWon={diceWon}
          />
        </div>

        {/* HUD */}
        <div className="px-4 pb-5">
          <GameHUD
            credits={credits}
            phase={phase}
            lastPrize={lastPrize}
            gridWon={gridWon}
            diceWon={diceWon}
            onPlay={handlePlay}
          />
        </div>

        <div className="absolute bottom-3 left-4 w-3 h-3 rounded-full border border-amber-500/40 bg-amber-900/30" />
        <div className="absolute bottom-3 right-4 w-3 h-3 rounded-full border border-amber-500/40 bg-amber-900/30" />
      </div>

      <a href="/" className="mt-6 text-zinc-500 hover:text-amber-400 text-sm transition-colors">
        ← 返回首頁
      </a>
    </main>
  );
}
