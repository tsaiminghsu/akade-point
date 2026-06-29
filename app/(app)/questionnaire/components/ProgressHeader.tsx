interface ProgressHeaderProps {
  currentStep: number;
  totalSteps: number;
  stepTitle?: string;
}

export default function ProgressHeader({ currentStep, totalSteps, stepTitle }: ProgressHeaderProps) {
  const progress = (currentStep / totalSteps) * 100;

  return (
    <section className="sticky top-0 z-20 bg-zinc-900 border-b border-zinc-700 pt-3 pb-3">
      <div className="mx-auto w-full max-w-lg px-4">
        <div className="mb-1.5 flex items-center justify-between text-xs font-semibold text-amber-400">
          <span className="truncate">{stepTitle ?? "問卷進度"}</span>
          <span className="ml-2 shrink-0 text-zinc-400">{currentStep} / {totalSteps}</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-700">
          <div
            className="h-full rounded-full bg-amber-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </section>
  );
}
