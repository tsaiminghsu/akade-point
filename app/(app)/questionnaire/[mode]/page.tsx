"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useForm, FormProvider } from "react-hook-form";
import type { ComponentType } from "react";
import {
  QUESTIONNAIRE_MODE_CONFIGS,
  FULL_QUESTIONNAIRE_DEFAULT,
  STEP_TITLES,
  STANDARD_STEPS,
  QUICK_STEPS,
} from "@/types/questionnaire";
import type { FullQuestionnaireValues, StepId, QuestionnaireMode } from "@/types/questionnaire";

import ProgressHeader from "@/app/(app)/questionnaire/components/ProgressHeader";
import FormNavigation from "@/app/(app)/questionnaire/components/FormNavigation";
import StepS0 from "@/app/(app)/questionnaire/components/steps/StepS0";
import StepS1 from "@/app/(app)/questionnaire/components/steps/StepS1";
import StepS2 from "@/app/(app)/questionnaire/components/steps/StepS2";
import StepS3 from "@/app/(app)/questionnaire/components/steps/StepS3";
import StepS4 from "@/app/(app)/questionnaire/components/steps/StepS4";
import StepS5 from "@/app/(app)/questionnaire/components/steps/StepS5";
import StepS6 from "@/app/(app)/questionnaire/components/steps/StepS6";
import StepS7Report from "@/app/(app)/questionnaire/components/steps/StepS7Report";

const STEP_COMPONENT_MAP: Record<StepId, ComponentType> = {
  S0: StepS0,
  S1: StepS1,
  S2: StepS2,
  S3: StepS3,
  S4: StepS4,
  S5: StepS5,
  S6: StepS6,
  S7: StepS7Report,
};

const STEP_REQUIRED_FIELDS: Partial<Record<StepId, (keyof FullQuestionnaireValues)[]>> = {
  S0: ["agreedToTerms", "agreedToPrivacy", "agreedToDataUse"],
  S1: ["s1Genres"],
};

function validateStep(stepId: StepId, values: FullQuestionnaireValues): string | null {
  if (stepId === "S0") {
    if (!values.agreedToTerms) return "請同意服務使用條款";
    if (!values.agreedToPrivacy) return "請同意隱私權保護聲明";
    if (!values.agreedToDataUse) return "請同意資料使用聲明";
  }
  if (stepId === "S1" && (!values.s1Genres || values.s1Genres.length === 0)) {
    return "請至少選擇一個遊戲類型";
  }
  return null;
}

export default function QuestionnaireModePage() {
  const params = useParams();
  const router = useRouter();
  const mode = params?.mode as QuestionnaireMode;

  const modeConfig = QUESTIONNAIRE_MODE_CONFIGS[mode];
  const steps = mode === "quick" ? QUICK_STEPS : STANDARD_STEPS;

  const [stepIndex, setStepIndex] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);

  const methods = useForm<FullQuestionnaireValues>({
    defaultValues: FULL_QUESTIONNAIRE_DEFAULT,
    mode: "onTouched",
  });

  if (!modeConfig) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-950">
        <div className="text-center">
          <p className="text-zinc-500">找不到此評估模式</p>
          <button
            onClick={() => router.push("/questionnaire")}
            className="mt-4 rounded-xl bg-amber-500 px-6 py-2 text-sm text-black font-medium"
          >
            返回選擇
          </button>
        </div>
      </main>
    );
  }

  const currentStepId = steps[stepIndex];
  const isFirstStep = stepIndex === 0;
  const isLastStep = stepIndex === steps.length - 1;
  const nextStepId = steps[stepIndex + 1];
  const isSubmitStep = currentStepId !== "S7" && nextStepId === "S7";
  const isReportStep = currentStepId === "S7";

  const handleNext = async () => {
    setStepError(null);
    const requiredFields = STEP_REQUIRED_FIELDS[currentStepId] ?? [];
    let valid = true;

    if (requiredFields.length > 0) {
      valid = await methods.trigger(requiredFields as Parameters<typeof methods.trigger>[0]);
    }

    const customError = validateStep(currentStepId, methods.getValues());
    if (customError) { setStepError(customError); return; }
    if (!valid) return;

    if (isSubmitStep || (isLastStep && !isReportStep)) {
      await handleSubmit();
      return;
    }

    setStepIndex((prev) => prev + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handlePrev = () => {
    setStepError(null);
    setStepIndex((prev) => prev - 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSubmit = async () => {
    if (isReportStep) return;
    setIsSubmitting(true);
    setStepError(null);
    try {
      const values = methods.getValues();
      const response = await fetch("/api/questionnaire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, mode, submittedAt: new Date().toISOString() }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { message?: string };
        throw new Error(data.message || `提交失敗（${response.status}）`);
      }
      setStepIndex(steps.length - 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setStepError(err instanceof Error ? err.message : "問卷提交失敗，請稍後再試");
    } finally {
      setIsSubmitting(false);
    }
  };

  const StepComponent = STEP_COMPONENT_MAP[currentStepId];

  return (
    <main className="min-h-screen bg-zinc-950 pb-10">
      <ProgressHeader
        currentStep={stepIndex + 1}
        totalSteps={steps.length}
        stepTitle={STEP_TITLES[currentStepId]}
      />

      <div className="mx-auto w-full max-w-lg px-4 pt-6">
        <FormProvider {...methods}>
          <div className="rounded-2xl border border-zinc-700 bg-zinc-900 p-4 shadow-lg">
            <StepComponent />

            {stepError && (
              <p className="mt-3 rounded-lg bg-red-950 border border-red-800 px-3 py-2 text-xs text-red-300">
                ⚠ {stepError}
              </p>
            )}

            {!isReportStep && (
              <FormNavigation
                isFirstStep={isFirstStep}
                isLastStep={isSubmitStep || (isLastStep && !isReportStep)}
                onPrevious={handlePrev}
                onNext={handleNext}
                isSubmitting={isSubmitting}
              />
            )}
          </div>
        </FormProvider>
      </div>
    </main>
  );
}
