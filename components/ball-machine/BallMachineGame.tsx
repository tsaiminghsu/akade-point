"use client";
import { useState, useCallback, useRef } from "react";
import BallScene, { type BallSceneHandle } from "./BallScene";
import MachineHUD from "./MachineHUD";
import { HOLE_SPACING, BALL_R, FLOOR_T, GRID_COLS, GRID_ROWS } from "./constants";

export type BallColor = "pink" | "blue" | "green" | "yellow";
export type GamePhase =
  | "ready" | "inserting" | "vibrating" | "jumping"
  | "settling" | "checking" | "result";

export interface MachineSettings {
  colorCount: number;    // 2-4
  perColor: number;      // 3-9
  restitution: number;   // 彈跳係數 0.1-0.9
  bounceStrength: number; // 彈跳力度倍率 0.5-2.0
  gravity: number;       // 重力倍率 0.3-2.0
  kickStrength: number;  // 初始衝力倍率 0.5-2.0
}

export interface Ball {
  id: number;
  color: BallColor;
  row: number;
  col: number;
}

export interface WinCell { row: number; col: number; }

export {
  HOLE_SPACING, BALL_R, CONTAINER_H, FLOOR_T, WALL_T,
  GRID_COLS, GRID_ROWS, MAX_HOLES,
} from "./constants";

export function calcGrid(_total: number) {
  void _total;
  return { cols: GRID_COLS, rows: GRID_ROWS };
}

export function calcContainerSize(_cols: number, _rows: number) {
  void _cols;
  void _rows;
  const side = GRID_COLS * HOLE_SPACING + 1.4;
  return { containerW: side, containerD: side };
}

export function calcHolePositions(cols: number, rows: number): [number, number, number][] {
  const positions: [number, number, number][] = [];
  const holeY = FLOOR_T + BALL_R;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      positions.push([
        (c - (cols - 1) / 2) * HOLE_SPACING,
        holeY,
        (r - (rows - 1) / 2) * HOLE_SPACING,
      ]);
    }
  }
  return positions;
}

const COLORS: BallColor[] = ["pink", "blue", "green", "yellow"];
const COST = 10;
const STARTING_CREDITS = 50;

const PHASE_DURATIONS: Record<GamePhase, number> = {
  ready: 0, inserting: 300, vibrating: 900,
  jumping: 2400, settling: 1600, checking: 1200, result: 3000,
};

function makeBalls(settings: MachineSettings): Ball[] {
  const { colorCount, perColor } = settings;
  const colors: BallColor[] = [];
  for (let ci = 0; ci < colorCount; ci++)
    for (let bi = 0; bi < perColor; bi++)
      colors.push(COLORS[ci]);

  for (let i = colors.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [colors[i], colors[j]] = [colors[j], colors[i]];
  }

  const { cols, rows } = calcGrid(colors.length);
  const positions: [number, number][] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      positions.push([r, c]);

  return colors.map((color, i) => ({
    id: i, color,
    row: positions[i][0],
    col: positions[i][1],
  }));
}

function detectWins(balls: Ball[], cols: number, rows: number): { cells: WinCell[]; prize: number } {
  const grid: (BallColor | null)[][] = Array.from({ length: rows }, () => Array(cols).fill(null));
  for (const b of balls) {
    if (b.row < rows && b.col < cols) grid[b.row][b.col] = b.color;
  }

  const winCells = new Set<string>();
  let maxMatch = 0;

  for (let r = 0; r < rows; r++) {
    let streak = 1;
    for (let c = 1; c < cols; c++) {
      if (grid[r][c] !== null && grid[r][c] === grid[r][c - 1]) { streak++; }
      else {
        if (streak >= 3) { for (let k = 0; k < streak; k++) winCells.add(`${r},${c - 1 - k}`); maxMatch = Math.max(maxMatch, streak); }
        streak = 1;
      }
    }
    if (streak >= 3) { for (let k = 0; k < streak; k++) winCells.add(`${r},${cols - 1 - k}`); maxMatch = Math.max(maxMatch, streak); }
  }

  for (let c = 0; c < cols; c++) {
    let streak = 1;
    for (let r = 1; r < rows; r++) {
      if (grid[r][c] !== null && grid[r][c] === grid[r - 1][c]) { streak++; }
      else {
        if (streak >= 3) { for (let k = 0; k < streak; k++) winCells.add(`${r - 1 - k},${c}`); maxMatch = Math.max(maxMatch, streak); }
        streak = 1;
      }
    }
    if (streak >= 3) { for (let k = 0; k < streak; k++) winCells.add(`${rows - 1 - k},${c}`); maxMatch = Math.max(maxMatch, streak); }
  }

  const cells = Array.from(winCells).map((key) => {
    const [r, c] = key.split(",").map(Number);
    return { row: r, col: c };
  });

  let prize = 0;
  if (maxMatch >= 5) prize = 100;
  else if (maxMatch === 4) prize = 50;
  else if (maxMatch === 3) prize = 20;
  return { cells, prize };
}

export default function BallMachineGame() {
  const [settings, setSettings] = useState<MachineSettings>({
    colorCount: 3, perColor: 5,
    restitution: 0.35, bounceStrength: 1.0, gravity: 1.0, kickStrength: 1.0,
  });
  const [balls, setBalls] = useState<Ball[]>(() => makeBalls({
    colorCount: 3, perColor: 5,
    restitution: 0.35, bounceStrength: 1.0, gravity: 1.0, kickStrength: 1.0,
  }));
  const [credits, setCredits] = useState(STARTING_CREDITS);
  const [phase, setPhase] = useState<GamePhase>("ready");
  const [winCells, setWinCells] = useState<WinCell[]>([]);
  const [lastPrize, setLastPrize] = useState(0);

  const timers  = useRef<ReturnType<typeof setTimeout>[]>([]);
  const sceneRef = useRef<BallSceneHandle>(null);

  const total = settings.colorCount * settings.perColor;
  const { cols, rows } = calcGrid(total);
  const holePositions = calcHolePositions(cols, rows);
  const isMachineShaking = phase === "vibrating" || phase === "jumping";

  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  const after = (ms: number, fn: () => void) => { const t = setTimeout(fn, ms); timers.current.push(t); };

  const handleApplySettings = useCallback((next: MachineSettings) => {
    if (phase !== "ready") return;
    setSettings(next);
    setBalls(makeBalls(next));
    setWinCells([]);
    setLastPrize(0);
  }, [phase]);

  const handlePlay = useCallback(() => {
    if (phase !== "ready" || credits < COST) return;
    clearTimers();
    setCredits((c) => c - COST);
    setWinCells([]);
    setLastPrize(0);
    setPhase("inserting");

    after(PHASE_DURATIONS.inserting, () => {
      setPhase("vibrating");
      after(PHASE_DURATIONS.vibrating, () => {
        setPhase("jumping");
        after(PHASE_DURATIONS.jumping, () => {
          setPhase("settling");
          after(PHASE_DURATIONS.settling, () => {
            // Read final physical positions from the scene
            const finalBalls = sceneRef.current
              ? sceneRef.current.computeResult(balls, holePositions, cols)
              : balls;

            setBalls(finalBalls);
            setPhase("checking");

            const { cells, prize } = detectWins(finalBalls, cols, rows);
            setWinCells(cells);
            setLastPrize(prize);

            after(PHASE_DURATIONS.checking, () => {
              if (prize > 0) setCredits((c) => c + prize);
              setPhase("result");
              after(PHASE_DURATIONS.result, () => { setWinCells([]); setPhase("ready"); });
            });
          });
        });
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, credits, balls, cols, rows, holePositions]);

  return (
    <main className="min-h-screen bg-[#070b13] flex flex-col items-center justify-center p-4 overflow-hidden">
      <div
        className="relative w-full max-w-lg rounded-3xl border-4 border-amber-500 bg-[#0d0a00]"
        style={{ boxShadow: "0 0 60px rgba(245,158,11,0.35), inset 0 0 40px rgba(0,0,0,0.8)" }}
      >
        <div className="flex items-center justify-center gap-2 pt-4 pb-2 px-4">
          <div className="h-px flex-1 bg-amber-500/40" />
          <h1 className="text-amber-400 font-black text-2xl tracking-widest"
            style={{ textShadow: "0 0 20px rgba(245,158,11,0.8)" }}>
            跳 豆 機
          </h1>
          <div className="h-px flex-1 bg-amber-500/40" />
        </div>

        <div
          className={`mx-3 mb-3 rounded-2xl bg-black/70 border border-white/10 overflow-hidden ${isMachineShaking ? "machine-shake" : ""}`}
          data-phase={phase}
          style={{ height: 360 }}
        >
          <BallScene
            ref={sceneRef}
            balls={balls}
            phase={phase}
            winCells={winCells}
            holePositions={holePositions}
            cols={cols}
            rows={rows}
            physicsSettings={{
              restitution: settings.restitution,
              bounceStrength: settings.bounceStrength,
              gravity: settings.gravity,
              kickStrength: settings.kickStrength,
            }}
          />
        </div>

        <div className="px-4 pb-5">
          <MachineHUD
            credits={credits}
            phase={phase}
            lastPrize={lastPrize}
            settings={settings}
            onPlay={handlePlay}
            onApplySettings={handleApplySettings}
          />
        </div>

        <div className="absolute bottom-3 left-4 w-3 h-3 rounded-full border border-amber-500/40 bg-amber-900/30" />
        <div className="absolute bottom-3 right-4 w-3 h-3 rounded-full border border-amber-500/40 bg-amber-900/30" />
      </div>

      <a href="/" className="mt-6 text-zinc-500 hover:text-amber-400 text-sm transition-colors">
        ← 返回首頁
      </a>

      <style jsx>{`
        .machine-shake {
          transform-origin: center bottom;
          will-change: transform;
        }

        .machine-shake[data-phase="vibrating"] {
          animation: bean-machine-vibrate 72ms linear infinite;
        }

        .machine-shake[data-phase="jumping"] {
          animation: bean-machine-hop 108ms linear infinite;
        }

        @keyframes bean-machine-vibrate {
          0% { transform: translate3d(0, 0, 0); }
          30% { transform: translate3d(0.18px, -0.9px, 0); }
          60% { transform: translate3d(-0.18px, 0.35px, 0); }
          100% { transform: translate3d(0, 0, 0); }
        }

        @keyframes bean-machine-hop {
          0% { transform: translate3d(0, 0, 0); }
          35% { transform: translate3d(0.14px, -1.35px, 0); }
          70% { transform: translate3d(-0.14px, 0.45px, 0); }
          100% { transform: translate3d(0, 0, 0); }
        }
      `}</style>
    </main>
  );
}
