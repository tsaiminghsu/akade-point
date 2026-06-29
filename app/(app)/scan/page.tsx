"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { BrowserQRCodeReader } from "@zxing/browser";

export default function ScanPage() {
  const [error, setError] = useState("");
  const [manualToken, setManualToken] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserQRCodeReader | null>(null);
  const router = useRouter();

  const handleToken = useCallback((token: string) => {
    router.push(`/register/${token}`);
  }, [router]);

  useEffect(() => {
    let controls: { stop: () => void } | null = null;
    const reader = new BrowserQRCodeReader();
    readerRef.current = reader;

    (async () => {
      try {
        const devices = await BrowserQRCodeReader.listVideoInputDevices();
        if (!devices.length) {
          setError("找不到相機裝置");
          return;
        }
        const deviceId = devices[devices.length - 1].deviceId; // prefer back camera

        controls = await reader.decodeFromVideoDevice(
          deviceId,
          videoRef.current!,
          (result, err) => {
            if (result) {
              const text = result.getText();
              // Extract token from URL or use raw text
              try {
                const url = new URL(text);
                const token = url.searchParams.get("token");
                if (token) handleToken(token);
                else handleToken(text);
              } catch {
                handleToken(text);
              }
            }
            if (err && !(err.message?.includes("No MultiFormat"))) {
              // ignore "no code found" errors
            }
          }
        );
      } catch {
        setError("無法存取相機，請確認已授予相機權限");
      }
    })();

    return () => {
      controls?.stop();
    };
  }, []);

  return (
    <div className="p-4 space-y-5">
      <div className="pt-2">
        <h1 className="text-xl font-bold text-white">掃描卡片</h1>
        <p className="text-zinc-400 text-sm">對準卡片上的 QR Code</p>
      </div>

      {/* Camera */}
      <div className="relative rounded-xl overflow-hidden bg-black aspect-square max-w-sm mx-auto">
        <video ref={videoRef} className="w-full h-full object-cover" />
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-48 h-48 border-2 border-amber-400 rounded-xl opacity-60" />
        </div>
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80">
            <p className="text-red-400 text-sm text-center px-4">{error}</p>
          </div>
        )}
      </div>

      {/* Manual entry */}
      <div className="space-y-2">
        <p className="text-zinc-400 text-xs text-center">或手動輸入卡片代碼</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={manualToken}
            onChange={(e) => setManualToken(e.target.value)}
            placeholder="輸入卡片 "
            className="flex-1 bg-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
          <button
            onClick={() => manualToken && handleToken(manualToken.trim())}
            className="bg-amber-500 hover:bg-amber-400 text-black font-bold px-4 rounded-lg transition-colors text-sm"
          >
            確認
          </button>
        </div>
      </div>
    </div>
  );
}
