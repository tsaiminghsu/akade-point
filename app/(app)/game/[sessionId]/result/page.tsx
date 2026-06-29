"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Suspense, useState } from "react";
import Link from "next/link";
import { Sparkles, Gift, ArrowRight, ShieldCheck } from "lucide-react";

type OpenState = "closed" | "opening" | "opened";

function ResultContent() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const params = useSearchParams();
  const router = useRouter();

  const combos = parseInt(params.get("combos") ?? "0");
  const multiplier = parseFloat(params.get("multiplier") ?? "1");
  const bonus = parseInt(params.get("bonus") ?? "0");
  const total = parseInt(params.get("total") ?? "0");
  const ssr = params.get("ssr") === "true";

  // Blind Box Reward Query Details
  const itemName = params.get("itemName") ? decodeURIComponent(params.get("itemName")!) : "";
  const itemRarity = params.get("itemRarity") || "";
  const itemDesc = params.get("itemDesc") ? decodeURIComponent(params.get("itemDesc")!) : "";

  const [openState, setOpenState] = useState<OpenState>("closed");

  const finalItem = {
    name: itemName || "【探勘徽章】深空能源核心",
    rarity: (itemRarity as "UR" | "SSR" | "SR" | "R") || "R",
    desc: itemDesc || "解鎖深空探勘限定虛擬徽章，儲存了星際深空的核心能源。"
  };

  const RARITY_THEME = {
    UR: {
      bg: "from-fuchsia-950/80 via-slate-900/90 to-zinc-950",
      text: "text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-400 via-pink-400 to-indigo-400",
      glow: "shadow-[0_0_50px_rgba(217,70,239,0.5)]",
      border: "border-fuchsia-500/50",
      glowColor: "rgba(217,70,239,0.4)",
      label: "UR · 星域神話",
      boxIcon: "👑"
    },
    SSR: {
      bg: "from-amber-950/80 via-zinc-900/95 to-zinc-950",
      text: "text-amber-400 font-extrabold",
      glow: "shadow-[0_0_40px_rgba(245,158,11,0.4)]",
      border: "border-amber-500/50",
      glowColor: "rgba(245,158,11,0.3)",
      label: "SSR · 極致典藏",
      boxIcon: "🔮"
    },
    SR: {
      bg: "from-purple-950/70 via-zinc-900/95 to-zinc-950",
      text: "text-purple-400",
      glow: "shadow-[0_0_30px_rgba(168,85,247,0.3)]",
      border: "border-purple-500/40",
      glowColor: "rgba(168,85,247,0.25)",
      label: "SR · 卓越科研",
      boxIcon: "📦"
    },
    R: {
      bg: "from-blue-950/60 via-zinc-900/95 to-zinc-950",
      text: "text-blue-400",
      glow: "shadow-[0_0_20px_rgba(59,130,246,0.2)]",
      border: "border-blue-500/30",
      glowColor: "rgba(59,130,246,0.15)",
      label: "R · 深空普通",
      boxIcon: "✉️"
    }
  };

  const currentTheme = RARITY_THEME[finalItem.rarity] || RARITY_THEME.R;

  const triggerOpen = () => {
    if (openState !== "closed") return;
    setOpenState("opening");
    setTimeout(() => {
      setOpenState("opened");
    }, 1200);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 text-center relative overflow-hidden bg-zinc-950">
      
      {/* KEYFRAME ANIMATIONS STYLE */}
      <style>{`
        @keyframes shake {
          0% { transform: translate(1px, 1px) rotate(0deg); }
          10% { transform: translate(-1px, -2px) rotate(-1deg); }
          20% { transform: translate(-3px, 0px) rotate(1deg); }
          30% { transform: translate(0px, 2px) rotate(0deg); }
          40% { transform: translate(1px, -1px) rotate(1deg); }
          50% { transform: translate(-1px, 2px) rotate(-1deg); }
          60% { transform: translate(-3px, 1px) rotate(0deg); }
          70% { transform: translate(2px, 1px) rotate(-1deg); }
          80% { transform: translate(-1px, -1px) rotate(1deg); }
          90% { transform: translate(2px, 2px) rotate(0deg); }
          100% { transform: translate(1px, -2px) rotate(-1deg); }
        }
        @keyframes floatBox {
          0%, 100% { transform: translateY(0px) scale(1); }
          50% { transform: translateY(-12px) scale(1.05); }
        }
        @keyframes rotateBeam {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-shake {
          animation: shake 0.15s infinite;
        }
        .animate-float-box {
          animation: floatBox 3s ease-in-out infinite;
        }
        .animate-beam {
          animation: rotateBeam 12s linear infinite;
        }
      `}</style>

      {/* Background Aura */}
      <div 
        className="absolute w-[500px] h-[500px] rounded-full blur-3xl opacity-20 pointer-events-none transition-all duration-1000 -z-10"
        style={{
          background: `radial-gradient(circle, ${currentTheme.glowColor} 0%, transparent 70%)`,
          top: "40%",
          left: "50%",
          transform: "translate(-50%, -50%)"
        }}
      />

      <AnimatePresence mode="wait">
        {openState !== "opened" ? (
          /* 1. CLOSED & OPENING STATE: SHOW BLIND BOX */
          <motion.div
            key="box-view"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="flex flex-col items-center max-w-sm w-full space-y-8"
          >
            <div className="space-y-2">
              <span className="px-3 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-black rounded-full uppercase tracking-widest">
                獲得星際盲盒
              </span>
              <h2 className="text-xl font-black text-white">點數已自動加成！請開啟盲盒獎勵</h2>
              <p className="text-zinc-400 text-xs font-medium">挑戰成績：{combos} Combos · 傷害加成 {multiplier}x</p>
            </div>

            {/* Pulsating Light Beam behind the box */}
            <div className="relative w-72 h-72 flex items-center justify-center">
              {openState === "opening" && (
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent w-full h-full rounded-full animate-beam filter blur-sm pointer-events-none" />
              )}
              
              <div 
                onClick={triggerOpen}
                className={`w-48 h-48 rounded-3xl bg-zinc-900 border border-white/10 flex items-center justify-center text-7xl cursor-pointer transition-all duration-300 ${
                  openState === "opening" 
                    ? "animate-shake border-amber-400/50 shadow-[0_0_50px_rgba(245,158,11,0.5)]" 
                    : "animate-float-box hover:scale-105 hover:border-white/20 hover:shadow-[0_0_30px_rgba(255,255,255,0.1)]"
                }`}
              >
                {currentTheme.boxIcon}
              </div>
            </div>

            <button
              onClick={triggerOpen}
              disabled={openState === "opening"}
              className="px-8 py-4 bg-amber-500 hover:bg-amber-400 disabled:bg-zinc-800 disabled:text-zinc-500 text-black font-black rounded-2xl text-base tracking-wide transition-all shadow-[0_5px_20px_rgba(245,158,11,0.3)] flex items-center gap-2"
            >
              <Sparkles className="w-5 h-5" />
              {openState === "opening" ? "正在開啟盲盒..." : "🎁 開啟星際盲盒"}
            </button>
          </motion.div>
        ) : (
          /* 2. OPENED STATE: REVEAL GACHA REWARD */
          <motion.div
            key="reward-view"
            initial={{ opacity: 0, y: 30, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 100, damping: 15 }}
            className="flex flex-col items-center max-w-sm w-full space-y-6"
          >
            <div className="space-y-1">
              <span className="text-emerald-400 text-xs font-black tracking-widest flex items-center justify-center gap-1">
                <Sparkles className="w-3.5 h-3.5" /> 盲盒成功解鎖！
              </span>
              <h2 className="text-2xl font-black text-white">恭喜獲得星際戰利品</h2>
            </div>

            {/* Glowing Reward Card */}
            <div className={`w-full bg-gradient-to-b ${currentTheme.bg} border-2 ${currentTheme.border} ${currentTheme.glow} rounded-3xl p-6 space-y-4 text-left relative overflow-hidden transition-all`}>
              {/* Particle glow */}
              <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 rounded-full blur-2xl pointer-events-none" />

              <div className="flex items-center justify-between">
                <span className="px-3 py-1 bg-white/5 border border-white/10 text-zinc-300 text-[10px] font-black rounded-full uppercase tracking-wider">
                  {currentTheme.label}
                </span>
                <span className="text-2xl">⚡</span>
              </div>

              <div className="space-y-2">
                <h3 className={`text-lg font-black tracking-wide ${currentTheme.text}`}>
                  {finalItem.name}
                </h3>
                <p className="text-xs text-zinc-300 leading-relaxed font-medium">
                  {finalItem.desc}
                </p>
              </div>

              {/* Points summary integrated as helper energy */}
              <div className="pt-4 border-t border-white/5 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-zinc-400 font-bold block">🔋 附屬獲得星能量</span>
                  <span className="text-sm font-black text-amber-400 font-mono">+{total.toLocaleString()} 點數</span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-zinc-400 font-bold block">連擊加乘</span>
                  <span className="text-sm font-black text-purple-400 font-mono">{combos} Combos ({multiplier}x)</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 w-full">
              <Link
                href={`/game/${sessionId}/verify`}
                className="w-full py-3 bg-white/5 hover:bg-white/10 rounded-2xl text-xs font-bold text-zinc-400 hover:text-zinc-200 transition-colors border border-white/5 flex items-center justify-center gap-1.5"
              >
                <ShieldCheck className="w-4 h-4" /> 驗證隨機公平性 (Provably Fair)
              </Link>
              <button
                onClick={() => router.push("/")}
                className="w-full py-4 bg-amber-500 hover:bg-amber-400 rounded-2xl text-sm font-black text-black transition-all shadow-[0_5px_15px_rgba(245,158,11,0.2)] flex items-center justify-center gap-1"
              >
                <span>收下獎勵並返回首頁</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}

export default function ResultPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen text-zinc-400">載入中...</div>}>
      <ResultContent />
    </Suspense>
  );
}

