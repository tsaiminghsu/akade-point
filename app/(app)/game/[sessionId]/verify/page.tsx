"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Copy, Check, ShieldCheck, ShieldX } from "lucide-react";

interface VerifyData {
  serverSeed: string;
  serverSeedHash: string;
  clientSeed: string | null;
  nonce: number;
  finalSeed: string;
  initialGrid: string[];
  isValid: boolean;
  instructions: string;
}

export default function VerifyPage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = params?.sessionId;
  const router = useRouter();
  const [data, setData] = useState<VerifyData | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [browserVerified, setBrowserVerified] = useState<boolean | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    fetch(`/api/game/${sessionId}/verify`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch(() => setError("載入驗證資料失敗"));
  }, [sessionId]);

  const copy = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const verifyInBrowser = async () => {
    if (!data) return;
    try {
      const enc = new TextEncoder();
      const hashBuffer = await crypto.subtle.digest("SHA-256", enc.encode(data.serverSeed));
      const hashHex = Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      setBrowserVerified(hashHex === data.serverSeedHash);
    } catch {
      setBrowserVerified(false);
    }
  };

  if (error)
    return (
      <div className="p-4 text-center space-y-3">
        <p className="text-red-400">{error}</p>
        <button onClick={() => router.back()} className="text-amber-400 text-sm">返回</button>
      </div>
    );

  if (!data)
    return <div className="flex items-center justify-center h-64 text-zinc-400">載入中...</div>;

  const Field = ({ label, value, copyKey }: { label: string; value: string; copyKey: string }) => (
    <div className="space-y-1">
      <p className="text-xs text-zinc-400">{label}</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 bg-black/30 rounded px-2 py-1.5 text-xs text-emerald-300 break-all font-mono">
          {value}
        </code>
        <button onClick={() => copy(value, copyKey)} className="shrink-0 p-1 rounded bg-white/10">
          {copied === copyKey ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-zinc-400" />}
        </button>
      </div>
    </div>
  );

  return (
    <div className="p-4 space-y-5 max-w-lg mx-auto">
      <div className="pt-2 flex items-center gap-3">
        <ShieldCheck className="w-6 h-6 text-emerald-400" />
        <div>
          <h1 className="text-lg font-bold text-white">公平性驗證</h1>
          <p className="text-zinc-400 text-xs">Provably Fair</p>
        </div>
      </div>

      <div className={`rounded-xl p-3 border flex items-center gap-3 ${data.isValid ? "border-emerald-500/50 bg-emerald-500/10" : "border-red-500/50 bg-red-500/10"}`}>
        {data.isValid ? <ShieldCheck className="w-5 h-5 text-emerald-400" /> : <ShieldX className="w-5 h-5 text-red-400" />}
        <p className={`text-sm font-semibold ${data.isValid ? "text-emerald-400" : "text-red-400"}`}>
          {data.isValid ? "伺服器驗證通過 ✓" : "驗證失敗 — 請聯絡管理員"}
        </p>
      </div>

      <div className="space-y-3">
        <Field label="Server Seed (揭示)" value={data.serverSeed} copyKey="seed" />
        <Field label="Server Seed Hash (遊戲前承諾)" value={data.serverSeedHash} copyKey="hash" />
        <Field label="Client Seed" value={data.clientSeed ?? "(未設定)"} copyKey="client" />
        <Field label="Final Seed = SHA256(serverSeed|clientSeed|nonce)" value={data.finalSeed ?? ""} copyKey="final" />
      </div>

      <div className="bg-white/5 rounded-xl p-4 text-xs text-zinc-400 space-y-1">
        <p className="text-white font-semibold text-sm mb-2">驗證步驟</p>
        <p>1. 計算 SHA256(Server Seed)</p>
        <p>2. 確認結果 = Server Seed Hash</p>
        <p>3. 計算 SHA256(Server Seed + &quot;|&quot; + Client Seed + &quot;|&quot; + {data.nonce})</p>
        <p>4. 確認結果 = Final Seed</p>
        <p>5. 使用 Final Seed 重新生成局面，確認與遊戲初始局面一致</p>
      </div>

      <button
        onClick={verifyInBrowser}
        className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold transition-colors"
      >
        在瀏覽器中執行驗證
      </button>

      {browserVerified !== null && (
        <div className={`rounded-xl p-3 border text-center ${browserVerified ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400" : "border-red-500/50 bg-red-500/10 text-red-400"}`}>
          {browserVerified ? "✅ 瀏覽器驗證通過！SHA256(serverSeed) = serverSeedHash" : "❌ 驗證失敗"}
        </div>
      )}

      <button onClick={() => router.push("/")} className="w-full text-zinc-500 text-sm">
        返回首頁
      </button>
    </div>
  );
}
