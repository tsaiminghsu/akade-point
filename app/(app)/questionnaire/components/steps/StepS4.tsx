"use client";

import { useFormContext } from "react-hook-form";
import { S4_RARITY_PREFS, S4_ELEMENT_PREFS, S4_PLAYSTYLES } from "@/types/questionnaire";
import type { FullQuestionnaireValues } from "@/types/questionnaire";
import ChoiceChip from "@/app/(app)/questionnaire/components/ChoiceChip";

export default function StepS4() {
  const { watch, setValue } = useFormContext<FullQuestionnaireValues>();
  const favoriteRarity = watch("favoriteRarity");
  const favoriteElement = watch("favoriteElement");
  const playstyle = watch("playstyle");

  return (
    <div className="space-y-6">
      <div className="text-center mb-4">
        <div className="text-3xl mb-2">🃏</div>
        <h2 className="text-lg font-bold text-white">卡牌偏好設定</h2>
        <p className="text-sm text-zinc-400 mt-1">您最偏好哪種類型的卡牌？</p>
      </div>

      <div>
        <p className="text-sm font-semibold text-zinc-300 mb-2">偏好稀有度</p>
        <div className="space-y-2">
          {S4_RARITY_PREFS.map((opt) => (
            <ChoiceChip key={opt.id} label={opt.label} selected={favoriteRarity === opt.id} onClick={() => setValue("favoriteRarity", opt.id)} />
          ))}
        </div>
      </div>

      <div>
        <p className="text-sm font-semibold text-zinc-300 mb-2">偏好元素屬性</p>
        <div className="space-y-2">
          {S4_ELEMENT_PREFS.map((opt) => (
            <ChoiceChip key={opt.id} label={opt.label} selected={favoriteElement === opt.id} onClick={() => setValue("favoriteElement", opt.id)} />
          ))}
        </div>
      </div>

      <div>
        <p className="text-sm font-semibold text-zinc-300 mb-2">遊戲風格</p>
        <div className="space-y-2">
          {S4_PLAYSTYLES.map((opt) => (
            <ChoiceChip key={opt.id} label={opt.label} selected={playstyle === opt.id} onClick={() => setValue("playstyle", opt.id)} />
          ))}
        </div>
      </div>
    </div>
  );
}
