"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { OrbGrid } from "@/components/game/orb-grid";
import { FairnessCommitment } from "@/components/game/fairness-commitment";
import type { OrbColor } from "@/lib/game/orb-generator";

type Phase = "loading" | "commitment" | "playing" | "submitting" | "done" | "error";

interface SessionInfo {
  sessionId: string;
  serverSeedHash: string;
  trigger: string;
  baseReward: number;
  status: string;
}

const TRIGGER_LABEL: Record<string, string> = {
  SMALL_GIFT: "小禮",
  MEDIUM_GIFT: "中禮",
  LARGE_GIFT: "大禮",
  SSR_COMPLETE: "SSR 傳說卡",
};

export default function GamePage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = params?.sessionId;
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>("loading");
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [clientSeed, setClientSeed] = useState("");
  const [initialGrid, setInitialGrid] = useState<OrbColor[]>([]);
  const [currentGrid, setCurrentGrid] = useState<OrbColor[]>([]);
  const [error, setError] = useState("");
  
  // 移動倒數計時狀態：預設 5.0 秒，觸碰寶珠時才開始倒數
  const [dragStarted, setDragStarted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(5.0);

  const submitted = useRef(false);
  const currentGridRef = useRef<OrbColor[]>([]);
  currentGridRef.current = currentGrid;

  useEffect(() => {
    if (!sessionId) return;
    fetch(`/api/game/${sessionId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { setError(data.error); setPhase("error"); return; }
        setSession(data);
        if (data.status === "COMPLETED") {
          router.replace(`/game/${sessionId}/result`);
        } else {
          setPhase("commitment");
        }
      })
      .catch(() => { setError("載入失敗"); setPhase("error"); });
  }, [sessionId, router]);

  const startGame = async () => {
    setPhase("loading");
    try {
      const res = await fetch(`/api/game/${sessionId}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientSeed: clientSeed || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); setPhase("error"); return; }
      setInitialGrid(data.initialGrid);
      setCurrentGrid([...data.initialGrid]);
      setTimeLeft(5.0);
      setDragStarted(false);
      setPhase("playing");
    } catch {
      setError("開始遊戲失敗"); setPhase("error");
    }
  };

  const submitGrid = useCallback(async (grid: OrbColor[]) => {
    if (submitted.current) return;
    submitted.current = true;
    setPhase("submitting");
    try {
      const res = await fetch(`/api/game/${sessionId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ finalGrid: grid }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); setPhase("error"); return; }
      router.push(`/game/${sessionId}/result?combos=${data.combos}&multiplier=${data.multiplier}&bonus=${data.bonusPoints}&total=${data.totalPoints}&ssr=${data.ssrCardGranted}&itemName=${encodeURIComponent(data.claimedItem?.name || "")}&itemRarity=${data.claimedItem?.rarity || ""}&itemDesc=${encodeURIComponent(data.claimedItem?.desc || "")}`);
    } catch {
      setError("提交失敗"); setPhase("error");
    }
  }, [sessionId, router]);

  // 監聽觸碰後的 5 秒計時器倒數
  useEffect(() => {
    if (!dragStarted || phase !== "playing") return;
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        const next = Math.max(0, Math.round((prev - 0.1) * 10) / 10);
        if (next <= 0) {
          clearInterval(interval);
          submitGrid(currentGridRef.current);
        }
        return next;
      });
    }, 100);
    return () => clearInterval(interval);
  }, [dragStarted, phase, submitGrid]);

  if (phase === "loading")
    return <div className="flex items-center justify-center h-64 text-zinc-400">載入中...</div>;

  if (phase === "error")
    return (
      <div className="p-4 text-center space-y-4">
        <p className="text-red-400">{error}</p>
        <button onClick={() => router.push("/collection")} className="text-amber-400 text-sm">返回</button>
      </div>
    );

  if (phase === "commitment")
    return (
      <div className="p-4 space-y-5 max-w-sm mx-auto">
        <div className="pt-2 text-center">
          <p className="text-xs text-zinc-400">轉珠加成遊戲</p>
          <h1 className="text-2xl font-bold text-white">
            {TRIGGER_LABEL[session?.trigger ?? ""] ?? "獎勵遊戲"}
          </h1>
          <p className="text-amber-400 font-semibold">基礎獎勵：{session?.baseReward.toLocaleString()} 點</p>
        </div>

        <FairnessCommitment serverSeedHash={session?.serverSeedHash ?? ""} />

        <div className="space-y-2">
          <label className="text-xs text-zinc-400">自定義隨機種子（選填）</label>
          <input
            type="text"
            value={clientSeed}
            onChange={(e) => setClientSeed(e.target.value)}
            placeholder="輸入任意文字增加隨機性"
            className="w-full bg-white/10 rounded-lg px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-400 text-sm"
          />
        </div>

        <div className="bg-white/5 rounded-xl p-4 text-xs text-zinc-400 space-y-1">
          <p>🎮 <strong className="text-white">遊戲說明：</strong></p>
          <p>• 開局不含任何預設連線，必須手動移出第一條連線</p>
          <p>• 開始拖動即啟動 5 秒倒數，放開或秒數歸零時即刻結算</p>
          <p>• Combo 加成採用安全上限遞減倍率，最高封頂為 3.0x</p>
        </div>

        <button
          onClick={startGame}
          className="w-full py-4 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-xl transition-colors text-lg"
        >
          開始遊戲
        </button>
      </div>
    );

  if (phase === "playing" || phase === "submitting")
    return (
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-zinc-400">基礎 {session?.baseReward.toLocaleString()} 點</p>
          
          {/* 高精度觸發式倒數計時顯示 */}
          <div className="flex flex-col items-end gap-1">
            <span className={`text-2xl font-black tabular-nums tracking-wider ${timeLeft <= 1.5 ? "text-red-400 animate-pulse" : "text-amber-400"}`}>
              {timeLeft.toFixed(1)}s
            </span>
            <div className="w-24 h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all duration-100 ${timeLeft <= 1.5 ? "bg-red-500" : "bg-amber-400"}`}
                style={{ width: `${(timeLeft / 5.0) * 100}%` }}
              />
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-zinc-500 font-semibold animate-pulse">
          {!dragStarted ? "👈 拖動任一寶珠即開始 5 秒計時！" : "計時中...盡快排出 Combo！"}
        </p>

        <div className="flex justify-center">
          <OrbGrid
            initialGrid={initialGrid}
            disabled={phase === "submitting"}
            onGridChange={setCurrentGrid}
            onRelease={submitGrid}
            onStartDrag={() => setDragStarted(true)}
          />
        </div>

        {phase === "playing" && (
          <button
            onClick={() => submitGrid(currentGrid)}
            className="w-full py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl text-sm transition-colors"
          >
            提前結束並計算結果
          </button>
        )}

        {phase === "submitting" && (
          <p className="text-center text-zinc-400 text-sm animate-pulse">計算結果中...</p>
        )}
      </div>
    );

  return null;
}
