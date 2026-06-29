"use client";

import { useFormContext } from "react-hook-form";
import { S6_YEARS_GAMING, S6_SPENDING_HABITS } from "@/types/questionnaire";
import type { FullQuestionnaireValues } from "@/types/questionnaire";
import ChoiceChip from "@/app/(app)/questionnaire/components/ChoiceChip";

export default function StepS6() {
  const { watch, setValue } = useFormContext<FullQuestionnaireValues>();
  const currentGames = watch("currentGames");
  const yearsGaming = watch("yearsGaming");
  const spendingHabit = watch("spendingHabit");

  return (
    <div className="space-y-6">
      <div className="text-center mb-4">
        <div className="text-3xl mb-2">🕹️</div>
        <h2 className="text-lg font-bold text-white">遊戲歷程</h2>
        <p className="text-sm text-zinc-400 mt-1">分享一下您的遊戲背景。</p>
      </div>

      <div>
        <label className="block text-sm font-semibold text-zinc-300 mb-2">
          您目前在玩哪些遊戲？（選填）
        </label>
        <textarea
          value={currentGames}
          onChange={(e) => setValue("currentGames", e.target.value)}
          placeholder="例如：原神、寶可夢、英雄聯盟…"
          rows={3}
          className="w-full rounded-xl border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-amber-500 resize-none"
        />
      </div>

      <div>
        <p className="text-sm font-semibold text-zinc-300 mb-2">您玩遊戲多少年了？</p>
        <div className="grid grid-cols-2 gap-2">
          {S6_YEARS_GAMING.map((opt) => (
            <ChoiceChip key={opt.id} label={opt.label} selected={yearsGaming === opt.id} onClick={() => setValue("yearsGaming", opt.id)} />
          ))}
        </div>
      </div>

      <div>
        <p className="text-sm font-semibold text-zinc-300 mb-2">您的遊戲消費習慣</p>
        <div className="space-y-2">
          {S6_SPENDING_HABITS.map((opt) => (
            <ChoiceChip key={opt.id} label={opt.label} selected={spendingHabit === opt.id} onClick={() => setValue("spendingHabit", opt.id)} />
          ))}
        </div>
      </div>
    </div>
  );
}
