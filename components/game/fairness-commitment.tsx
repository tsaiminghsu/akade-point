"use client";

import { useState } from "react";
import { Copy, Check, ShieldCheck } from "lucide-react";

export function FairnessCommitment({ serverSeedHash }: { serverSeedHash: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(serverSeedHash);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-2">
      <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
        <ShieldCheck className="w-4 h-4" />
        公平性承諾 (Provably Fair)
      </div>
      <p className="text-xs text-zinc-400">
        遊戲開始前，伺服器已承諾此雜湊值。遊戲結束後可驗證種子正確性。
      </p>
      <div className="flex items-center gap-2">
        <code className="flex-1 bg-black/30 rounded px-2 py-1 text-xs text-emerald-300 break-all font-mono">
          {serverSeedHash}
        </code>
        <button
          onClick={copy}
          className="shrink-0 p-1.5 rounded bg-white/10 hover:bg-white/20 transition-colors"
        >
          {copied ? (
            <Check className="w-4 h-4 text-emerald-400" />
          ) : (
            <Copy className="w-4 h-4 text-zinc-400" />
          )}
        </button>
      </div>
    </div>
  );
}
