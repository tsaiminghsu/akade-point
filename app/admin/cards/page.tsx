"use client";

import { useState } from "react";
import { CARD_TYPES } from "@/lib/dynamo/cards";

interface GeneratedCard {
  qrToken: string;
  serialNumber: string;
  cardNumber: string;
  nameZh: string;
}

export default function AdminCardsPage() {
  const [cardNumber, setCardNumber] = useState("001");
  const [quantity, setQuantity] = useState(10);
  const [printBatch, setPrintBatch] = useState("BATCH-001");
  const [loading, setLoading] = useState(false);
  const [cards, setCards] = useState<GeneratedCard[]>([]);
  const [error, setError] = useState("");

  const generate = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/cards/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardNumber, quantity, printBatch }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      setCards(data.cards);
    } catch {
      setError("生成失敗");
    } finally {
      setLoading(false);
    }
  };

  const downloadCSV = () => {
    const csv = [
      "serialNumber,qrToken,cardNumber,nameZh,url",
      ...cards.map((c) =>
        `${c.serialNumber},${c.qrToken},${c.cardNumber},${c.nameZh},${window.location.origin}/register/${c.qrToken}`
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${printBatch}-cards.csv`;
    a.click();
  };

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-white">卡片管理</h1>

      <div className="bg-white/5 rounded-xl p-4 space-y-4">
        <p className="font-semibold text-zinc-300">批量生成卡片</p>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-zinc-400">卡片類型</label>
            <select
              value={cardNumber}
              onChange={(e) => setCardNumber(e.target.value)}
              className="w-full mt-1 bg-white/10 rounded-lg px-3 py-2 text-white text-sm"
            >
              {Object.entries(CARD_TYPES).map(([num, info]) => (
                <option key={num} value={num} className="bg-zinc-900">
                  {num} - {info.nameZh} ({info.rarity})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-zinc-400">數量</label>
            <input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(parseInt(e.target.value))}
              min={1}
              max={500}
              className="w-full mt-1 bg-white/10 rounded-lg px-3 py-2 text-white text-sm"
            />
          </div>
        </div>

        <div>
          <label className="text-xs text-zinc-400">批次名稱</label>
          <input
            type="text"
            value={printBatch}
            onChange={(e) => setPrintBatch(e.target.value)}
            className="w-full mt-1 bg-white/10 rounded-lg px-3 py-2 text-white text-sm"
          />
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <button
          onClick={generate}
          disabled={loading}
          className="w-full py-2 bg-amber-500 hover:bg-amber-400 disabled:bg-zinc-700 text-black font-bold rounded-lg transition-colors text-sm"
        >
          {loading ? "生成中..." : "生成卡片"}
        </button>
      </div>

      {cards.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-zinc-300 text-sm">已生成 {cards.length} 張</p>
            <button
              onClick={downloadCSV}
              className="text-xs text-amber-400 bg-amber-400/10 hover:bg-amber-400/20 px-3 py-1 rounded-lg"
            >
              下載 CSV
            </button>
          </div>
          <div className="bg-white/5 rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-white/5">
                <tr>
                  <th className="text-left p-2 text-zinc-400">序號</th>
                  <th className="text-left p-2 text-zinc-400">Token</th>
                  <th className="text-left p-2 text-zinc-400">URL</th>
                </tr>
              </thead>
              <tbody>
                {cards.slice(0, 20).map((c) => (
                  <tr key={c.qrToken} className="border-t border-white/5">
                    <td className="p-2 text-zinc-300 font-mono">{c.serialNumber}</td>
                    <td className="p-2 text-zinc-500 font-mono">{c.qrToken.slice(0, 8)}...</td>
                    <td className="p-2">
                      <a
                        href={`/register/${c.qrToken}`}
                        className="text-amber-400 hover:underline"
                        target="_blank"
                      >
                        /register/{c.qrToken.slice(0, 6)}...
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {cards.length > 20 && (
              <p className="text-center text-zinc-500 text-xs py-2">
                顯示前 20 筆，請下載 CSV 查看全部
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
