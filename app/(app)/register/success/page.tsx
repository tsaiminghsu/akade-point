"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Suspense } from "react";

function SuccessContent() {
  const params = useSearchParams();
  const router = useRouter();
  const choice = params.get("choice");
  const points = params.get("points");
  const name = params.get("name");
  const newRewards = params.get("newRewards")?.split(",").filter(Boolean) ?? [];

  const TIER_NAMES: Record<string, string> = {
    SMALL: "小禮",
    MEDIUM: "中禮",
    LARGE: "大禮",
    SSR_COMPLETE: "SSR 傳說卡",
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 text-center space-y-6">
      <div className="text-6xl animate-bounce">🎉</div>
      <div>
        <h1 className="text-2xl font-bold text-white">登錄成功！</h1>
        <p className="text-zinc-400 text-sm mt-1">{name} 已加入你的收藏</p>
      </div>

      <div className="bg-white/5 rounded-xl p-6 w-full max-w-xs space-y-2">
        {choice === "POINTS" ? (
          <>
            <div className="text-3xl font-bold text-amber-400">+{Number(points).toLocaleString()}</div>
            <p className="text-zinc-400 text-sm">點數已入帳</p>
          </>
        ) : (
          <>
            <div className="text-3xl font-bold text-purple-400">+1 🎫</div>
            <p className="text-zinc-400 text-sm">抽獎卷已入帳</p>
          </>
        )}
      </div>

      {newRewards.length > 0 && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 w-full max-w-xs space-y-2">
          <p className="text-emerald-400 font-semibold">🎊 新獎勵解鎖！</p>
          {newRewards.map((tier) => (
            <div key={tier}>
              <button
                onClick={() => router.push(`/collection/claim/${tier}`)}
                className="text-sm text-white underline"
              >
                立即領取 {TIER_NAMES[tier] ?? tier}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-3 w-full max-w-xs">
        <button
          onClick={() => router.push("/scan")}
          className="flex-1 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-sm text-white transition-colors"
        >
          繼續掃描
        </button>
        <button
          onClick={() => router.push("/collection")}
          className="flex-1 py-2 bg-amber-500 hover:bg-amber-400 rounded-xl text-sm font-bold text-black transition-colors"
        >
          查看收藏
        </button>
      </div>
    </div>
  );
}

export default function SuccessPage() {
  return (
    <Suspense>
      <SuccessContent />
    </Suspense>
  );
}
