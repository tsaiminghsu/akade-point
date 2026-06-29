"use client";

import { useFormContext } from "react-hook-form";
import { S1_GENRES } from "@/types/questionnaire";
import type { FullQuestionnaireValues, GenreId } from "@/types/questionnaire";
import ChoiceChip from "@/app/(app)/questionnaire/components/ChoiceChip";

export default function StepS1() {
  const { watch, setValue } = useFormContext<FullQuestionnaireValues>();
  const selected = watch("s1Genres") ?? [];

  const toggle = (id: GenreId) => {
    if (selected.includes(id)) {
      setValue("s1Genres", selected.filter((x) => x !== id));
    } else {
      setValue("s1Genres", [...selected, id]);
    }
  };

  return (
    <div className="space-y-4">
      <div className="text-center mb-4">
        <div className="text-3xl mb-2">🎮</div>
        <h2 className="text-lg font-bold text-white">遊戲類型偏好</h2>
        <p className="text-sm text-zinc-400 mt-1">您喜歡哪些類型的遊戲？可複選。</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {S1_GENRES.map((genre) => (
          <ChoiceChip
            key={genre.id}
            label={genre.label}
            selected={selected.includes(genre.id)}
            onClick={() => toggle(genre.id)}
          />
        ))}
      </div>

      {selected.length > 0 && (
        <p className="text-xs text-amber-400 text-center">
          已選擇 {selected.length} 個類型
        </p>
      )}
    </div>
  );
}
