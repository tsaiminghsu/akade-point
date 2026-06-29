"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import type { GamePhase, MachineSettings } from "./BallMachineGame";
import { MAX_HOLES } from "./BallMachineGame";

interface MachineHUDProps {
  credits: number;
  phase: GamePhase;
  lastPrize: number;
  settings: MachineSettings;
  onPlay: () => void;
  onApplySettings: (s: MachineSettings) => void;
}

const PHASE_LABELS: Record<GamePhase, string> = {
  ready: "準備就緒",
  inserting: "投幣中...",
  vibrating: "震動中...",
  jumping: "跳動中！",
  settling: "落定中...",
  checking: "判定中...",
  result: "",
};

const BALL_COLORS: Record<string, string> = {
  pink:   "bg-gradient-to-br from-pink-300 to-rose-500",
  blue:   "bg-gradient-to-br from-sky-200 to-blue-600",
  green:  "bg-gradient-to-br from-green-200 to-emerald-600",
  yellow: "bg-gradient-to-br from-yellow-200 to-amber-500",
};
const COLOR_NAMES = ["粉", "藍", "綠", "黃"];
const COLOR_KEYS  = ["pink", "blue", "green", "yellow"];

function Stepper({
  value, min, max, step = 1, onChange, disabled,
}: { value: number; min: number; max: number; step?: number; onChange: (v: number) => void; disabled?: boolean }) {
  const fmt = step < 1 ? value.toFixed(1) : String(value);
  const dec = (v: number) => Math.round((v - step) * 100) / 100;
  const inc = (v: number) => Math.round((v + step) * 100) / 100;
  return (
    <div className="flex items-center gap-2">
      <button
        className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold
          disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        onClick={() => onChange(Math.max(min, dec(value)))}
        disabled={disabled || value <= min}
      >−</button>
      <span className="w-8 text-center text-amber-400 font-black tabular-nums text-sm">{fmt}</span>
      <button
        className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold
          disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        onClick={() => onChange(Math.min(max, inc(value)))}
        disabled={disabled || value >= max}
      >+</button>
    </div>
  );
}

export default function MachineHUD({
  credits, phase, lastPrize, settings,
  onPlay, onApplySettings,
}: MachineHUDProps) {
  const [draft, setDraft] = useState<MachineSettings>(settings);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const canPlay    = phase === "ready" && credits >= 10;
  const isPlaying  = phase !== "ready" && phase !== "result";
  const showResult = phase === "result";
  const hasWin     = lastPrize > 0;
  const isReady    = phase === "ready";

  const totalBalls = draft.colorCount * draft.perColor;
  const tooMany    = totalBalls > MAX_HOLES; // 25 holes max

  function handleApply() {
    if (tooMany || !isReady) return;
    onApplySettings(draft);
    setSettingsOpen(false);
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Prize table */}
      <div className="grid grid-cols-3 gap-1.5 text-center">
        {[
          { label: "3連", prize: "+20", color: "text-emerald-400" },
          { label: "4連", prize: "+50", color: "text-sky-400" },
          { label: "5連", prize: "+100", color: "text-amber-400" },
        ].map(({ label, prize, color }) => (
          <div key={label} className="rounded-lg bg-white/5 border border-white/10 py-1.5 px-2">
            <div className="text-zinc-400 text-xs">{label}</div>
            <div className={cn("font-black text-sm", color)}>{prize}</div>
          </div>
        ))}
      </div>
      <p className="text-zinc-600 text-[10px] text-center">※ 橫線 / 直線 | 斜線不算</p>

      {/* Settings toggle */}
      <button
        className={cn(
          "w-full rounded-xl py-2 text-sm font-bold border transition-all",
          isReady
            ? "border-amber-500/40 text-amber-400 hover:bg-amber-500/10"
            : "border-white/10 text-zinc-600 cursor-not-allowed"
        )}
        onClick={() => isReady && setSettingsOpen((o) => !o)}
      >
        ⚙ 球機設定 {isReady ? (settingsOpen ? "▲" : "▼") : "(遊戲中)"}
      </button>

      {/* Settings panel */}
      <AnimatePresence>
        {settingsOpen && isReady && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="rounded-xl bg-white/5 border border-white/10 p-3 flex flex-col gap-3">
              {/* Color count */}
              <div className="flex items-center justify-between">
                <span className="text-zinc-400 text-sm">顏色數</span>
                <Stepper
                  value={draft.colorCount} min={2} max={4}
                  onChange={(v) => setDraft((d) => ({ ...d, colorCount: v }))}
                />
              </div>

              {/* Per color count */}
              <div className="flex items-center justify-between">
                <span className="text-zinc-400 text-sm">每色球數</span>
                <Stepper
                  value={draft.perColor} min={3} max={9}
                  onChange={(v) => setDraft((d) => ({ ...d, perColor: v }))}
                />
              </div>

              <div className="h-px bg-white/10 my-1" />

              {/* Physics: restitution */}
              <div className="flex items-center justify-between">
                <span className="text-zinc-400 text-sm">彈跳係數</span>
                <Stepper
                  value={draft.restitution} min={0.1} max={0.9} step={0.1}
                  onChange={(v) => setDraft((d) => ({ ...d, restitution: v }))}
                />
              </div>

              {/* Physics: bounce strength */}
              <div className="flex items-center justify-between">
                <span className="text-zinc-400 text-sm">彈跳力度係數</span>
                <Stepper
                  value={draft.bounceStrength} min={0.5} max={2.0} step={0.1}
                  onChange={(v) => setDraft((d) => ({ ...d, bounceStrength: v }))}
                />
              </div>

              {/* Physics: gravity */}
              <div className="flex items-center justify-between">
                <span className="text-zinc-400 text-sm">重力倍率</span>
                <Stepper
                  value={draft.gravity} min={0.3} max={2.0} step={0.1}
                  onChange={(v) => setDraft((d) => ({ ...d, gravity: v }))}
                />
              </div>

              {/* Physics: kick strength */}
              <div className="flex items-center justify-between">
                <span className="text-zinc-400 text-sm">衝力倍率</span>
                <Stepper
                  value={draft.kickStrength} min={0.5} max={2.0} step={0.1}
                  onChange={(v) => setDraft((d) => ({ ...d, kickStrength: v }))}
                />
              </div>

              {/* Summary */}
              <div className="flex items-center justify-between text-xs">
                <span className={cn("font-bold", tooMany ? "text-red-400" : "text-zinc-400")}>
                  共 {totalBalls} 顆球（5×5 宮格）{tooMany ? " ⚠ 超過25顆" : ""}
                </span>
                <div className="flex gap-1">
                  {Array.from({ length: draft.colorCount }).map((_, i) => (
                    <div key={i} className={cn("w-4 h-4 rounded-full", BALL_COLORS[COLOR_KEYS[i]])} />
                  ))}
                </div>
              </div>

              <button
                onClick={handleApply}
                disabled={tooMany}
                className={cn(
                  "w-full rounded-lg py-2 font-black text-sm transition-all",
                  tooMany
                    ? "bg-white/5 text-zinc-600 cursor-not-allowed"
                    : "bg-amber-500 hover:bg-amber-400 text-black"
                )}
              >
                套用設定
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Credits display */}
      <div className="flex items-center justify-between bg-black/50 border border-amber-500/30 rounded-xl px-4 py-2">
        <span className="text-zinc-500 text-xs">代幣</span>
        <motion.span
          key={credits}
          className="font-mono text-amber-400 text-2xl font-black tabular-nums"
          initial={{ scale: 1.3 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 500, damping: 25 }}
          style={{ textShadow: "0 0 12px rgba(245,158,11,0.6)" }}
        >
          {credits}
        </motion.span>
        <span className="text-zinc-500 text-xs">枚</span>
      </div>

      {/* Play button */}
      <button
        onClick={onPlay}
        disabled={!canPlay}
        className={cn(
          "w-full rounded-xl py-3 font-black text-lg tracking-wider transition-all duration-200",
          canPlay
            ? "bg-amber-500 hover:bg-amber-400 text-black shadow-[0_0_20px_rgba(245,158,11,0.4)] hover:shadow-[0_0_30px_rgba(245,158,11,0.6)] active:scale-95"
            : "bg-white/5 text-zinc-600 cursor-not-allowed border border-white/10"
        )}
      >
        {isPlaying ? (
          <span className="flex items-center justify-center gap-2">
            <motion.span animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>
              ⚙
            </motion.span>
            {PHASE_LABELS[phase]}
          </span>
        ) : credits < 10 ? "代幣不足" : "投幣遊玩 (-10)"}
      </button>

      {/* Result banner */}
      <AnimatePresence>
        {showResult && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 400, damping: 20 }}
            className={cn(
              "rounded-xl border py-3 text-center font-black text-lg",
              hasWin
                ? "bg-amber-500/20 border-amber-500/60 text-amber-300"
                : "bg-white/5 border-white/10 text-zinc-500"
            )}
            style={hasWin ? { boxShadow: "0 0 24px rgba(245,158,11,0.3)" } : {}}
          >
            {hasWin ? `🎉 中獎！+${lastPrize} 代幣` : "本次未中獎"}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Color legend */}
      <div className="flex justify-center gap-3 mt-1 flex-wrap">
        {Array.from({ length: settings.colorCount }).map((_, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <div className={cn("w-4 h-4 rounded-full", BALL_COLORS[COLOR_KEYS[i]])} />
            <span className="text-zinc-500 text-xs">{COLOR_NAMES[i]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
