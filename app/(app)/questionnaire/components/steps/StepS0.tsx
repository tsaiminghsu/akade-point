"use client";

import { useFormContext } from "react-hook-form";
import type { FullQuestionnaireValues } from "@/types/questionnaire";

function ConsentItem({
  field,
  title,
  children,
}: {
  field: keyof Pick<FullQuestionnaireValues, "agreedToTerms" | "agreedToPrivacy" | "agreedToDataUse">;
  title: string;
  children: React.ReactNode;
}) {
  const { watch, setValue } = useFormContext<FullQuestionnaireValues>();
  const checked = watch(field);

  return (
    <div className={`rounded-xl border p-4 transition ${checked ? "border-amber-500 bg-amber-950/30" : "border-zinc-600 bg-zinc-800"}`}>
      <p className="text-sm font-semibold text-zinc-200 mb-2">{title}</p>
      <div className="text-xs text-zinc-400 space-y-1 mb-3">{children}</div>
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={!!checked}
          onChange={(e) => setValue(field, e.target.checked)}
          className="h-4 w-4 accent-amber-500"
        />
        <span className={`text-sm font-medium ${checked ? "text-amber-300" : "text-zinc-400"}`}>
          我已閱讀並同意上述條款
        </span>
      </label>
    </div>
  );
}

export default function StepS0() {
  return (
    <div className="space-y-4">
      <div className="text-center mb-4">
        <div className="text-3xl mb-2">📋</div>
        <h2 className="text-lg font-bold text-white">服務條款與資料同意</h2>
        <p className="text-sm text-zinc-400 mt-1">請閱讀並同意以下條款，以繼續填寫問卷。</p>
      </div>

      <ConsentItem field="agreedToTerms" title="服務使用條款">
        <p>本問卷由機器人收藏宇宙（Akade Point）提供，用於分析您的遊戲偏好並提供個人化卡牌推薦。</p>
        <p>問卷結果為參考建議，實際遊戲體驗因個人差異而有所不同。</p>
      </ConsentItem>

      <ConsentItem field="agreedToPrivacy" title="隱私權保護聲明">
        <p>我們僅收集問卷填寫過程中您主動提供的遊戲偏好資訊，不會蒐集您的個人識別資料。</p>
        <p>您的回答將以匿名方式儲存，並用於改善遊戲推薦服務。</p>
      </ConsentItem>

      <ConsentItem field="agreedToDataUse" title="資料使用同意">
        <p>您同意我們使用您的問卷回答來生成個人化推薦報告，並用於優化 Akade Point 的卡牌推薦系統。</p>
        <p>您可隨時要求刪除您的問卷資料，請聯繫系統管理員。</p>
      </ConsentItem>
    </div>
  );
}
