'use client';

interface LoadingScreenProps {
  progress: number;      // 0–100, driven by real render milestones
  statusText: string;    // human-readable phase label
}

export default function LoadingScreen({ progress, statusText }: LoadingScreenProps) {
  // Clamp for safety
  const pct = Math.max(0, Math.min(100, Math.round(progress)));

  return (
    <div className="w-screen h-screen flex flex-col items-center justify-center bg-[#070b13]/80 backdrop-blur-[8px] select-none z-50">
      <div className="w-full max-w-md px-6 space-y-6">

        {/* ── Logo ── */}
        <div className="text-center space-y-1">
          <div className="text-amber-400 font-mono text-4xl font-black tracking-[0.2em] animate-pulse">
            AKADE CITY
          </div>
          <div className="text-white/40 font-mono text-xs tracking-wider uppercase">
            Procedural 3D Simulation
          </div>
        </div>

        {/* ── Progress bar ── */}
        <div className="space-y-3 pt-2">
          <div className="flex justify-between items-center text-xs font-mono">
            <span className="text-white/60 min-h-[1.5em] transition-all duration-300">{statusText}</span>
            <span className="text-amber-400 font-bold tabular-nums">{pct}%</span>
          </div>

          {/* Outer track */}
          <div className="relative w-full h-2.5 bg-white/5 rounded-full overflow-hidden border border-white/10">
            {/* Filled bar */}
            <div
              className="h-full bg-gradient-to-r from-amber-600 via-amber-400 to-amber-300 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${pct}%` }}
            />
            {/* Animated shimmer when in progress */}
            {pct > 0 && pct < 100 && (
              <div
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer rounded-full"
                style={{ width: `${pct}%` }}
              />
            )}
          </div>

          {/* Milestone dots */}
          <div className="flex justify-between px-0.5">
            {[15, 35, 55, 75, 90, 100].map((m) => (
              <div
                key={m}
                className={`w-1.5 h-1.5 rounded-full transition-all duration-500 ${
                  pct >= m ? 'bg-amber-400 shadow-[0_0_4px_#fbbf24]' : 'bg-white/10'
                }`}
              />
            ))}
          </div>
        </div>

        {/* ── Controls guide ── */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-2">
          <p className="text-amber-400/90 text-xs font-bold font-mono">🎮 遊戲操作指南：</p>
          <div className="grid grid-cols-2 gap-2 text-[11px] text-white/50 font-mono">
            <div>• <strong className="text-white/80">WASD / 方向鍵：</strong> 駕駛 / 移動</div>
            <div>• <strong className="text-white/80">F 鍵：</strong> 上車 / 下車</div>
            <div>• <strong className="text-white/80">P 鍵：</strong> 開啟手機功能</div>
            <div>• <strong className="text-white/80">M 鍵：</strong> 切換大地圖</div>
          </div>
        </div>

        {/* ── Footer ── */}
        <p className="text-[10px] text-white/20 font-mono text-center">
          WebGL &amp; React Three Fiber Engine &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
