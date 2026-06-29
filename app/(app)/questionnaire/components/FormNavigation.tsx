interface FormNavigationProps {
  isFirstStep: boolean;
  isLastStep: boolean;
  onPrevious: () => void;
  onNext: () => void;
  isSubmitting?: boolean;
}

export default function FormNavigation({
  isFirstStep,
  isLastStep,
  onPrevious,
  onNext,
  isSubmitting = false,
}: FormNavigationProps) {
  return (
    <div className="mt-8 flex items-center justify-between gap-3">
      <button
        type="button"
        onClick={onPrevious}
        disabled={isFirstStep || isSubmitting}
        className="h-11 min-w-24 rounded-xl border border-zinc-600 bg-zinc-800 px-4 text-sm font-semibold text-zinc-300 transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        上一題
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={isSubmitting}
        className="h-11 flex-1 rounded-xl bg-amber-500 px-4 text-sm font-semibold text-black transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? "送出中..." : isLastStep ? "送出問卷" : "下一題"}
      </button>
    </div>
  );
}
