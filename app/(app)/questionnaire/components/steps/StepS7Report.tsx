"use client";

import { useFormContext } from "react-hook-form";
import { S4_ELEMENT_PREFS, S4_PLAYSTYLES, S4_RARITY_PREFS, S5_INTEREST_OPTIONS } from "@/types/questionnaire";
import type { FullQuestionnaireValues } from "@/types/questionnaire";
import Link from "next/link";

const ELEMENT_ICONS: Record<string, string> = {
  fire: "🔥",
  water: "💧",
  earth: "🌍",
  light: "✨",
  dark: "🌑",
};

const PLAYSTYLE_ICONS: Record<string, string> = {
  aggressive: "⚔️",
  defensive: "🛡️",
  balanced: "⚖️",
  support: "💫",
  control: "🎭",
};

function AffinityBadge({ label, icon, color }: { label: string; icon: string; color: string }) {
  return (
    <div className={`flex items-center gap-2 rounded-xl px-4 py-2 ${color}`}>
      <span className="text-xl">{icon}</span>
      <span className="text-sm font-semibold">{label}</span>
    </div>
  );
}

export default function StepS7Report() {
  const { getValues } = useFormContext<FullQuestionnaireValues>();
  const values = getValues();

  const favoriteElementLabel = S4_ELEMENT_PREFS.find((e) => e.id === values.favoriteElement)?.label ?? "未指定";
  const playstyleLabel = S4_PLAYSTYLES.find((p) => p.id === values.playstyle)?.label ?? "未指定";
  const rarityLabel = S4_RARITY_PREFS.find((r) => r.id === values.favoriteRarity)?.label.split(" — ")[0] ?? "未指定";
  const elementIcon = ELEMENT_ICONS[values.favoriteElement] ?? "🃏";
  const playstyleIcon = PLAYSTYLE_ICONS[values.playstyle] ?? "🎮";
  const selectedInterests = S5_INTEREST_OPTIONS.filter((o) => values.s5Interests.includes(o.id));

  const genreLabel = values.s1Genres.length > 0 ? `${values.s1Genres.length} 種遊戲類型` : "綜合型";

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="text-4xl mb-3">🏆</div>
        <h2 className="text-xl font-bold text-white">您的玩家偏好報告</h2>
        <p className="text-sm text-zinc-400 mt-1">根據您的回答生成以下個人化分析</p>
      </div>

      {/* Player type card */}
      <div className="rounded-2xl border border-amber-700 bg-amber-950/40 p-4">
        <p className="text-xs font-semibold text-amber-400 mb-3">🎮 玩家類型分析</p>
        <div className="space-y-2">
          <AffinityBadge label={favoriteElementLabel.split("—")[0].trim()} icon={elementIcon} color="bg-zinc-800 text-zinc-200" />
          <AffinityBadge label={playstyleLabel.split("—")[0].trim()} icon={playstyleIcon} color="bg-zinc-800 text-zinc-200" />
          <AffinityBadge label={rarityLabel} icon="⭐" color="bg-zinc-800 text-zinc-200" />
        </div>
      </div>

      {/* Genre summary */}
      {values.s1Genres.length > 0 && (
        <div className="rounded-xl border border-zinc-700 bg-zinc-800 p-4">
          <p className="text-xs font-semibold text-zinc-400 mb-2">遊戲類型偏好 ({genreLabel})</p>
          <div className="flex flex-wrap gap-2">
            {values.s1Genres.map((id) => (
              <span key={id} className="text-xs px-2 py-1 rounded-full bg-indigo-900 text-indigo-200">
                {id}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Interest areas */}
      {selectedInterests.length > 0 && (
        <div className="rounded-xl border border-zinc-700 bg-zinc-800 p-4">
          <p className="text-xs font-semibold text-zinc-400 mb-2">主要興趣領域</p>
          <ul className="space-y-1">
            {selectedInterests.map((opt) => (
              <li key={opt.id} className="text-sm text-zinc-300 flex items-center gap-2">
                <span className="text-amber-500">→</span>
                {opt.label}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Card recommendation */}
      <div className="rounded-xl border border-zinc-700 bg-zinc-800 p-4">
        <p className="text-xs font-semibold text-zinc-400 mb-2">🃏 推薦卡牌方向</p>
        <p className="text-sm text-zinc-300">
          根據您的偏好，建議從{" "}
          <span className="text-amber-300 font-medium">{favoriteElementLabel.split("—")[0].trim()}</span>{" "}
          系卡牌開始收集，搭配{" "}
          <span className="text-amber-300 font-medium">{playstyleLabel.split("—")[0].trim()}</span>{" "}
          打法，前往收藏頁查看您的進度。
        </p>
      </div>

      {/* CTA */}
      <div className="flex flex-col gap-3">
        <Link
          href="/collection"
          className="block text-center rounded-xl bg-amber-500 px-4 py-3 text-sm font-semibold text-black hover:bg-amber-400 transition"
        >
          查看我的卡牌收藏 →
        </Link>
        <Link
          href="/questionnaire"
          className="block text-center rounded-xl border border-zinc-600 bg-zinc-800 px-4 py-3 text-sm font-medium text-zinc-300 hover:bg-zinc-700 transition"
        >
          重新填寫問卷
        </Link>
      </div>
    </div>
  );
}
