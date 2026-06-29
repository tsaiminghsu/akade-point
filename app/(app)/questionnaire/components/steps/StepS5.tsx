"use client";

import { useFormContext } from "react-hook-form";
import { S5_INTEREST_OPTIONS } from "@/types/questionnaire";
import type { FullQuestionnaireValues, InterestId } from "@/types/questionnaire";
import ChoiceChip from "@/app/(app)/questionnaire/components/ChoiceChip";

export default function StepS5() {
  const { watch, setValue } = useFormContext<FullQuestionnaireValues>();
  const selected = watch("s5Interests") ?? [];

  const toggle = (id: InterestId) => {
    if (selected.includes(id)) {
      setValue("s5Interests", selected.filter((x) => x !== id));
    } else {
      setValue("s5Interests", [...selected, id]);
    }
  };

  return (
    <div className="space-y-4">
      <div className="text-center mb-4">
        <div className="text-3xl mb-2">🎯</div>
        <h2 className="text-lg font-bold text-white">遊戲興趣領域</h2>
        <p className="text-sm text-zinc-400 mt-1">您最享受遊戲的哪些面向？可複選。</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {S5_INTEREST_OPTIONS.map((opt) => (
          <ChoiceChip
            key={opt.id}
            label={opt.label}
            selected={selected.includes(opt.id)}
            onClick={() => toggle(opt.id)}
          />
        ))}
      </div>

      {selected.length > 0 && (
        <p className="text-xs text-amber-400 text-center">
          已選擇 {selected.length} 個興趣領域
        </p>
      )}
    </div>
  );
}
