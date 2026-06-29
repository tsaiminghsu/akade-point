"use client";
import { motion, AnimatePresence } from "framer-motion";
import type { GamePhase } from "./JiuGongGeGame";

interface GameHUDProps {
  credits: number;
  phase: GamePhase;
  lastPrize: number;
  gridWon: boolean;
  diceWon: boolean;
  onPlay: () => void;
}

const PHASE_LABELS: Partial<Record<GamePhase, string>> = {
  inserting: "投入豆子…",
  vibrating: "震動中…",
  rolling:   "跳動中！",
  settling:  "落定…",
  checking:  "判斷結果…",
  result:    "結果揭曉",
};

const WIND_CHARS = ["東","西","南","北","中","發"];

export default function GameHUD({ credits, phase, lastPrize, gridWon, diceWon, onPlay }: GameHUDProps) {
  const isPlaying = phase !== "ready";
  const isResult = phase === "result" || phase === "checking";
  const bothWon = gridWon && diceWon;

  const resultLabel = bothWon
    ? "🎉 C獎！九宮格 + 中中！"
    : diceWon
    ? "🎲 B獎！中中！"
    : gridWon
    ? "🟢 A獎！九宮格通連！"
    : "未中獎";

  return (
    <div className="space-y-3">
      {/* Mode badges */}
      <div className="flex gap-2 justify-center">
        {[
          { label: "A", desc: "九宮格通連", active: isResult && gridWon, color: "from-green-600 to-emerald-500" },
          { label: "B", desc: "風骰中中",   active: isResult && diceWon,  color: "from-blue-600 to-cyan-500" },
          { label: "C", desc: "同時達成",   active: isResult && bothWon,  color: "from-amber-500 to-yellow-400" },
        ].map(({ label, desc, active, color }) => (
          <motion.div
            key={label}
            animate={active ? { scale: [1, 1.1, 1] } : { scale: 1 }}
            transition={{ repeat: active ? Infinity : 0, duration: 0.8 }}
            className={`flex-1 rounded-xl border text-center py-1.5 px-2 transition-all ${
              active
                ? `bg-gradient-to-b ${color} border-white/30 shadow-lg`
                : "bg-white/5 border-white/10"
            }`}
          >
            <div className={`font-black text-lg ${active ? "text-white" : "text-zinc-500"}`}>{label}獎</div>
            <div className={`text-[9px] ${active ? "text-white/80" : "text-zinc-600"}`}>{desc}</div>
          </motion.div>
        ))}
      </div>

      {/* Credits + Play button */}
      <div className="flex items-center gap-3">
        <div className="flex-1 rounded-xl bg-black/40 border border-white/10 px-3 py-2">
          <div className="text-[10px] text-zinc-500 tracking-widest">代幣</div>
          <motion.div
            key={credits}
            initial={{ scale: 1.3, color: "#fbbf24" }}
            animate={{ scale: 1, color: "#f59e0b" }}
            className="text-xl font-black text-amber-400"
          >
            {credits}
          </motion.div>
        </div>

        <button
          onClick={onPlay}
          disabled={isPlaying || credits < 10}
          className={`flex-1 py-3 rounded-xl font-black text-lg tracking-widest transition-all ${
            isPlaying || credits < 10
              ? "bg-zinc-800 text-zinc-600 cursor-not-allowed"
              : "bg-gradient-to-b from-amber-400 to-amber-600 text-black hover:from-amber-300 hover:to-amber-500 active:scale-95"
          }`}
          style={
            !isPlaying && credits >= 10
              ? { boxShadow: "0 0 20px rgba(245,158,11,0.5)" }
              : undefined
          }
        >
          {isPlaying ? (PHASE_LABELS[phase] ?? "…") : "▶ 開始 (-10)"}
        </button>
      </div>

      {/* Win condition reference */}
      <div className="grid grid-cols-3 gap-1 text-center text-[9px] text-zinc-600">
        <div className="rounded bg-white/5 py-0.5 px-1">A獎 +25</div>
        <div className="rounded bg-white/5 py-0.5 px-1">B獎 +40</div>
        <div className="rounded bg-white/5 py-0.5 px-1">C獎 +120</div>
      </div>

      {/* Result banner */}
      <AnimatePresence>
        {isResult && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            className={`rounded-xl border py-3 text-center font-black text-base tracking-wide ${
              lastPrize > 0
                ? "border-amber-400/60 bg-amber-900/30 text-amber-300"
                : "border-white/10 bg-white/5 text-zinc-500"
            }`}
            style={lastPrize > 0 ? { boxShadow: "0 0 20px rgba(245,158,11,0.3)" } : undefined}
          >
            {resultLabel}
            {lastPrize > 0 && (
              <span className="ml-2 text-amber-400">+{lastPrize}</span>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
