"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { CardPreview } from "@/components/cards/card-preview";
import type { Rarity } from "@/lib/dynamo/cards";

interface CardData {
  qrToken: string;
  cardNumber: string;
  nameZh: string;
  nameEn: string;
  rarity: Rarity;
  basePoints: number;
  isRegistered: boolean;
}

export default function RegisterPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token;
  const searchParams = useSearchParams();
  const router = useRouter();

  const [card, setCard] = useState<CardData | null>(null);
  const [shopCode, setShopCode] = useState(searchParams?.get("shop") ?? "");
  const [choice, setChoice] = useState<"POINTS" | "TICKET" | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    fetch(`/api/cards/${token}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else setCard(data);
      })
      .catch(() => setError("卡片查詢失敗"))
      .finally(() => setLoading(false));
  }, [token]);

  const submit = async () => {
    if (!choice || !shopCode.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/cards/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qrToken: token, shopCode: shopCode.trim(), choice }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "登錄失敗");
        return;
      }
      const params = new URLSearchParams({
        choice,
        points: String(data.pointsAwarded),
        name: card?.nameZh ?? "",
        newRewards: data.newRewardsUnlocked.join(","),
      });
      router.push(`/register/success?${params}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading)
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-zinc-400">載入中...</div>
      </div>
    );

  if (error)
    return (
      <div className="p-4 text-center space-y-4">
        <div className="text-4xl">⚠️</div>
        <p className="text-red-400">{error}</p>
        <button onClick={() => router.push("/scan")} className="text-amber-400 text-sm">
          返回掃描
        </button>
      </div>
    );

  if (card?.isRegistered)
    return (
      <div className="p-4 text-center space-y-4">
        <div className="text-4xl">🚫</div>
        <p className="text-red-400">此卡片已被登錄</p>
        <button onClick={() => router.push("/scan")} className="text-amber-400 text-sm">
          掃描其他卡片
        </button>
      </div>
    );

  return (
    <div className="p-4 space-y-5">
      <div className="pt-2">
        <h1 className="text-xl font-bold text-white">登錄卡片</h1>
        <p className="text-zinc-400 text-sm">確認資訊並選擇獎勵</p>
      </div>

      {card && (
        <CardPreview
          cardNumber={card.cardNumber}
          nameZh={card.nameZh}
          nameEn={card.nameEn}
          rarity={card.rarity}
          basePoints={card.basePoints}
          className="max-w-xs mx-auto"
        />
      )}

      {/* Shop code */}
      <div className="space-y-1">
        <label className="text-xs text-zinc-400">店家代碼</label>
        <input
          type="text"
          value={shopCode}
          onChange={(e) => setShopCode(e.target.value)}
          placeholder="例：TPE-001"
          className="w-full bg-white/10 rounded-lg px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-400 text-sm"
        />
      </div>

      {/* Choice */}
      <div className="space-y-2">
        <p className="text-xs text-zinc-400">選擇獎勵（二選一）</p>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setChoice("POINTS")}
            className={`rounded-xl p-4 border-2 transition-all text-center ${
              choice === "POINTS"
                ? "border-amber-400 bg-amber-400/10"
                : "border-white/10 bg-white/5"
            }`}
          >
            <div className="text-2xl mb-1">⭐</div>
            <p className="font-bold text-amber-400">{card?.basePoints.toLocaleString()} 點</p>
            <p className="text-xs text-zinc-400 mt-0.5">立即獲得點數</p>
          </button>
          <button
            onClick={() => setChoice("TICKET")}
            className={`rounded-xl p-4 border-2 transition-all text-center ${
              choice === "TICKET"
                ? "border-purple-400 bg-purple-400/10"
                : "border-white/10 bg-white/5"
            }`}
          >
            <div className="text-2xl mb-1">🎫</div>
            <p className="font-bold text-purple-400">抽獎卷 1 張</p>
            <p className="text-xs text-zinc-400 mt-0.5">集卡換大獎</p>
          </button>
        </div>
      </div>

      {error && <p className="text-red-400 text-sm text-center">{error}</p>}

      <button
        onClick={submit}
        disabled={!choice || !shopCode.trim() || submitting}
        className="w-full py-3 bg-amber-500 hover:bg-amber-400 disabled:bg-zinc-700 disabled:text-zinc-500 text-black font-bold rounded-xl transition-colors"
      >
        {submitting ? "登錄中..." : "確認登錄"}
      </button>
    </div>
  );
}
