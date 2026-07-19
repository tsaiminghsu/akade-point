"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

const TIER_INFO: Record<string, { name: string; base: number; desc: string }> = {
  SMALL: { name: "小禮", base: 50, desc: "任意 2 張 N 卡" },
  MEDIUM: { name: "中禮", base: 150, desc: "2N + 1R" },
  LARGE: { name: "大禮", base: 400, desc: "2N + 2R + 1SR" },
  SSR_COMPLETE: { name: "SSR 傳說卡", base: 1000, desc: "完整套組 + 機器人之王" },
};

export default function ClaimPage() {
  const params = useParams<{ tier: string }>();
  const tier = params?.tier;
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const info = tier ? TIER_INFO[tier] : undefined;

  const claim = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/collection/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "領取失敗");
        return;
      }
      router.push(`/game/${data.gameSession.sessionId}`);
    } finally {
      setLoading(false);
    }
  };

  if (!info)
    return (
      <div className="p-4 text-center text-red-400">無效的獎勵類型</div>
    );

  return (
    <div className="p-4 space-y-6 flex flex-col min-h-[80vh] justify-center max-w-sm mx-auto">
      <div className="text-center space-y-2">
        <div className="text-6xl">🎁</div>
        <h1 className="text-2xl font-bold text-white">領取 {info.name}</h1>
        <p className="text-zinc-400 text-sm">{info.desc}</p>
      </div>

      <div className="bg-white/5 rounded-xl p-5 space-y-3 text-center">
        <p className="text-zinc-400 text-sm">基礎獎勵</p>
        <p className="text-3xl font-bold text-amber-400">{info.base.toLocaleString()} 點</p>
        <div className="border-t border-white/10 pt-3 space-y-1">
          <p className="text-zinc-400 text-xs">透過轉珠連線遊戲可獲得倍數加成！</p>
          <p className="text-emerald-400 text-xs">最高可達 {info.base * 8.5} 點</p>
        </div>
      </div>

      <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-xl p-4 text-sm space-y-1">
        <p className="text-indigo-300 font-semibold">⚙️ 公平性說明</p>
        <p className="text-zinc-400 text-xs">
          遊戲開始前系統會出示承諾雜湊值，遊戲結束後可驗證種子正確性，確保結果無法事後竄改。
        </p>
      </div>

      {error && <p className="text-red-400 text-sm text-center">{error}</p>}

      <button
        onClick={claim}
        disabled={loading}
        className="w-full py-4 bg-amber-500 hover:bg-amber-400 disabled:bg-zinc-700 text-black font-bold rounded-xl transition-colors text-lg"
      >
        {loading ? "準備遊戲中..." : "開始轉珠遊戲"}
      </button>

      <button onClick={() => router.back()} className="text-zinc-500 text-sm text-center">
        取消
      </button>
    </div>
  );
}
