"use client";

import { useFormContext } from "react-hook-form";
import { S3_DAILY_HOURS, S3_PLATFORMS, S3_SESSION_LENGTHS, S3_PLAY_FREQUENCIES } from "@/types/questionnaire";
import type { FullQuestionnaireValues } from "@/types/questionnaire";
import ChoiceChip from "@/app/(app)/questionnaire/components/ChoiceChip";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-sm font-semibold text-zinc-300 mb-2">{title}</p>
      {children}
    </div>
  );
}

export default function StepS3() {
  const { watch, setValue } = useFormContext<FullQuestionnaireValues>();
  const dailyHours = watch("dailyHours");
  const platform = watch("platform");
  const sessionLength = watch("sessionLength");
  const playFrequency = watch("playFrequency");

  return (
    <div className="space-y-6">
      <div className="text-center mb-4">
        <div className="text-3xl mb-2">⏱️</div>
        <h2 className="text-lg font-bold text-white">遊戲習慣</h2>
        <p className="text-sm text-zinc-400 mt-1">您平常的遊戲習慣是什麼？</p>
      </div>

      <Section title="每日遊戲時間">
        <div className="grid grid-cols-2 gap-2">
          {S3_DAILY_HOURS.map((opt) => (
            <ChoiceChip key={opt.id} label={opt.label} selected={dailyHours === opt.id} onClick={() => setValue("dailyHours", opt.id)} />
          ))}
        </div>
      </Section>

      <Section title="主要遊戲平台">
        <div className="grid grid-cols-2 gap-2">
          {S3_PLATFORMS.map((opt) => (
            <ChoiceChip key={opt.id} label={opt.label} selected={platform === opt.id} onClick={() => setValue("platform", opt.id)} />
          ))}
        </div>
      </Section>

      <Section title="單次遊戲時長">
        <div className="grid grid-cols-2 gap-2">
          {S3_SESSION_LENGTHS.map((opt) => (
            <ChoiceChip key={opt.id} label={opt.label} selected={sessionLength === opt.id} onClick={() => setValue("sessionLength", opt.id)} />
          ))}
        </div>
      </Section>

      <Section title="遊戲頻率">
        <div className="grid grid-cols-2 gap-2">
          {S3_PLAY_FREQUENCIES.map((opt) => (
            <ChoiceChip key={opt.id} label={opt.label} selected={playFrequency === opt.id} onClick={() => setValue("playFrequency", opt.id)} />
          ))}
        </div>
      </Section>
    </div>
  );
}
