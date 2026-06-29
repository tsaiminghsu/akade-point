"use client";

import Link from "next/link";
import { QUESTIONNAIRE_MODE_CONFIGS } from "@/types/questionnaire";
import type { QuestionnaireMode } from "@/types/questionnaire";

interface ModeConfig {
  id: QuestionnaireMode;
  label: string;
  description: string;
  stepCount: number;
  estimatedMinutes: number;
}

function ModeCard({ mode }: { mode: ModeConfig }) {
  return (
    <Link href={`/questionnaire/${mode.id}`} className="block">
      <div className="relative flex h-full flex-col rounded-2xl border-2 border-zinc-700 bg-zinc-800 p-5 shadow-sm transition-all hover:border-amber-500 hover:shadow-amber-900/30 hover:shadow-md">
        <span className="absolute right-4 top-4 rounded-full bg-amber-900 px-2.5 py-0.5 text-[11px] font-bold text-amber-300">
          {mode.stepCount} 步驟
        </span>

        <div className="text-4xl leading-none mb-3">
          {mode.id === "standard" ? "📋" : "⚡"}
        </div>

        <h3 className="text-lg font-bold text-white mb-1">{mode.label}</h3>
        <p className="flex-1 text-sm leading-relaxed text-zinc-400">{mode.description}</p>

        <div className="mt-4 flex items-center justify-between">
          <span className="text-xs text-zinc-500">⏱ 約 {mode.estimatedMinutes} 分鐘</span>
          <span className="rounded-full bg-amber-500 px-4 py-1.5 text-xs font-semibold text-black">
            開始 →
          </span>
        </div>
      </div>
    </Link>
  );
}

export default function QuestionnaireSelectorPage() {
  const modes = Object.values(QUESTIONNAIRE_MODE_CONFIGS);

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 text-center">
          <div className="mb-2 inline-block rounded-full bg-amber-900 px-4 py-1 text-xs font-semibold text-amber-300">
            玩家偏好分析
          </div>
          <h1 className="text-2xl font-bold text-white">
            開始您的玩家偏好評估
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            填寫完成後獲得個人化卡牌推薦，找到最適合您的遊戲風格。
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {modes.map((mode) => (
            <ModeCard key={mode.id} mode={mode} />
          ))}
        </div>

        <div className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 text-center text-xs text-zinc-500">
          <p>所有填寫資料僅用於個人化推薦，不會分享給第三方。</p>
          <p className="mt-1">推薦結果為參考建議，實際遊戲體驗因人而異。</p>
        </div>
      </div>
    </main>
  );
}
