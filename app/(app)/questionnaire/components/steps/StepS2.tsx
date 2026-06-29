"use client";

import { useFormContext } from "react-hook-form";
import { S2_AGE_RANGES, S2_EXPERIENCE_LEVELS } from "@/types/questionnaire";
import type { FullQuestionnaireValues } from "@/types/questionnaire";
import ChoiceChip from "@/app/(app)/questionnaire/components/ChoiceChip";

export default function StepS2() {
  const { watch, setValue } = useFormContext<FullQuestionnaireValues>();
  const ageRange = watch("ageRange");
  const experienceLevel = watch("experienceLevel");

  return (
    <div className="space-y-6">
      <div className="text-center mb-4">
        <div className="text-3xl mb-2">🧑‍💻</div>
        <h2 className="text-lg font-bold text-white">玩家基本資料</h2>
        <p className="text-sm text-zinc-400 mt-1">告訴我們一些關於您的基本資訊。</p>
      </div>

      <div>
        <p className="text-sm font-semibold text-zinc-300 mb-2">年齡範圍</p>
        <div className="grid grid-cols-2 gap-2">
          {S2_AGE_RANGES.map((opt) => (
            <ChoiceChip
              key={opt.id}
              label={opt.label}
              selected={ageRange === opt.id}
              onClick={() => setValue("ageRange", opt.id)}
            />
          ))}
        </div>
      </div>

      <div>
        <p className="text-sm font-semibold text-zinc-300 mb-2">遊戲經驗等級</p>
        <div className="space-y-2">
          {S2_EXPERIENCE_LEVELS.map((opt) => (
            <ChoiceChip
              key={opt.id}
              label={opt.label}
              selected={experienceLevel === opt.id}
              onClick={() => setValue("experienceLevel", opt.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
