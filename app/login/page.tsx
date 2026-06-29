"use client";

import { signIn } from "next-auth/react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);

  const handleLineSignIn = async () => {
    setLoading(true);
    await signIn("line", { callbackUrl: "/", redirect: true });
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden bg-zinc-950">
      {/* 動態背景 - 放射狀光暈 */}
      <div className="absolute inset-0 -z-10 pointer-events-none">
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-20"
          style={{
            background:
              "radial-gradient(circle, rgba(251,191,36,0.4) 0%, rgba(239,68,68,0.2) 40%, transparent 70%)",
          }}
        />
        {/* 格線裝飾 */}
        <div
          className="absolute inset-0 opacity-5"
          style={{
            backgroundImage:
              "linear-gradient(rgba(251,191,36,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(251,191,36,0.3) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
        {/* 浮動粒子 */}
        <div
          className="absolute top-1/4 left-1/4 w-2 h-2 rounded-full bg-amber-400 opacity-40"
          style={{ animation: "float1 6s ease-in-out infinite" }}
        />
        <div
          className="absolute top-3/4 right-1/4 w-1.5 h-1.5 rounded-full bg-red-400 opacity-30"
          style={{ animation: "float2 8s ease-in-out infinite" }}
        />
        <div
          className="absolute top-1/3 right-1/3 w-1 h-1 rounded-full bg-blue-400 opacity-50"
          style={{ animation: "float3 5s ease-in-out infinite" }}
        />
      </div>

      <style>{`
        @keyframes float1 {
          0%, 100% { transform: translateY(0px) translateX(0px); }
          33% { transform: translateY(-20px) translateX(10px); }
          66% { transform: translateY(10px) translateX(-8px); }
        }
        @keyframes float2 {
          0%, 100% { transform: translateY(0px) translateX(0px); }
          50% { transform: translateY(-30px) translateX(-15px); }
        }
        @keyframes float3 {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-15px); }
        }
        @keyframes logoPulse {
          0%, 100% { filter: drop-shadow(0 0 16px rgba(251,191,36,0.5)); }
          50% { filter: drop-shadow(0 0 32px rgba(251,191,36,0.9)) drop-shadow(0 0 8px rgba(239,68,68,0.4)); }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .logo-pulse {
          animation: logoPulse 2.5s ease-in-out infinite;
        }
        .slide-up {
          animation: slideUp 0.6s ease-out forwards;
        }
        .slide-up-delay {
          animation: slideUp 0.6s ease-out 0.2s forwards;
          opacity: 0;
        }
      `}</style>

      {/* 主容器 */}
      <div className="w-full max-w-xs relative z-10">
        {/* Logo 區域 */}
        <div className="flex flex-col items-center mb-8 slide-up">
          <div className="relative w-32 h-32 mb-4 logo-pulse">
            <Image
              src="/logo.png"
              alt="機器人收藏宇宙 Logo"
              fill
              className="object-contain"
              priority
            />
          </div>
          <h1 className="text-2xl font-extrabold text-amber-400 tracking-tight">
            機器人收藏宇宙
          </h1>
          <p className="text-zinc-500 text-xs mt-1">Robot Collection Universe</p>
        </div>

        {/* 卡片 */}
        <div
          className="slide-up-delay rounded-2xl px-7 py-8 border border-white/10"
          style={{
            background:
              "linear-gradient(135deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.03) 100%)",
            backdropFilter: "blur(20px)",
            boxShadow:
              "0 25px 50px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1)",
          }}
        >
          <p className="text-zinc-300 text-sm text-center mb-6 font-medium">
            登入以開始集卡、兌換獎勵
          </p>

          {/* LINE 登入按鈕 */}
          <button
            onClick={handleLineSignIn}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 py-3.5 rounded-xl font-bold text-white text-base transition-all duration-200 relative overflow-hidden group"
            style={{
              background: loading
                ? "linear-gradient(135deg, #009a2e, #007a24)"
                : "linear-gradient(135deg, #00B900, #00a000)",
              boxShadow: loading
                ? "none"
                : "0 4px 20px rgba(0,185,0,0.4), 0 2px 8px rgba(0,0,0,0.3)",
            }}
          >
            {/* 按鈕 hover 光效 */}
            <span className="absolute inset-0 bg-white opacity-0 group-hover:opacity-10 transition-opacity duration-200 rounded-xl" />

            {loading ? (
              <>
                <svg
                  className="w-5 h-5 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                <span>跳轉中...</span>
              </>
            ) : (
              <>
                {/* LINE 官方 SVG Icon */}
                <svg
                  viewBox="0 0 24 24"
                  className="w-5 h-5 shrink-0"
                  fill="currentColor"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M19.365 9.89c.188 0 .341.153.341.341v1.289a.341.341 0 0 1-.341.341h-2.073v.866h2.073c.188 0 .341.153.341.341v1.289a.341.341 0 0 1-.341.341h-3.703a.341.341 0 0 1-.341-.341V9.89c0-.188.153-.341.341-.341h3.703zm-10.497 0c.188 0 .341.153.341.341v4.027l.002.086a.341.341 0 0 1-.343.255H7.579a.341.341 0 0 1-.341-.341V9.89c0-.188.153-.341.341-.341h1.289zm-2.918 0c.188 0 .341.153.341.341v5.627a.341.341 0 0 1-.341.341H4.9a.341.341 0 0 1-.341-.341V9.89c0-.188.153-.341.341-.341h1.05zm5.785 0c.188 0 .341.153.341.341v2.61l1.648-2.785a.341.341 0 0 1 .295-.166h1.289c.188 0 .341.153.341.341v5.627a.341.341 0 0 1-.341.341h-1.289a.341.341 0 0 1-.341-.341v-2.59l-1.648 2.765a.341.341 0 0 1-.295.166H10.45a.341.341 0 0 1-.341-.341V9.89c0-.188.153-.341.341-.341h1.285zm8.265-7.89C21 2 24 5 24 8.75c0 3.375-2.625 6.375-6.525 7.125-.375.075-.75-.15-.825-.525-.075-.375.15-.75.525-.825C20.7 13.85 23.025 11.45 23.025 8.75c0-3.15-2.475-5.625-5.625-5.625H6.6C3.45 3.125.975 5.6.975 8.75c0 2.7 2.325 5.1 5.85 5.775.375.075.6.45.525.825-.075.375-.45.6-.825.525C2.625 15.125 0 12.125 0 8.75 0 5 3 2 6.6 2h12.4z" />
                </svg>
                <span>使用 LINE 登入</span>
              </>
            )}
          </button>

          {/* 分隔線 */}
          <div className="flex items-center gap-2 my-4">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-zinc-600 text-xs uppercase">or</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          {/* 測試按鈕 */}
          <Link
            href="/test-game"
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white font-bold text-sm transition-all"
          >
            🎮 免登入直接測試轉珠
          </Link>

          {/* 底部說明 */}
          <p className="text-zinc-600 text-[10px] text-center mt-5 leading-relaxed">
            登入即代表您同意我們的服務條款
            <br />
            每張卡片可掃描 QR Code 記錄收藏進度
          </p>
        </div>
      </div>
    </main>
  );
}
