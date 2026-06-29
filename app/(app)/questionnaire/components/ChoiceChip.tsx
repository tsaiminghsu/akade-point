interface ChoiceChipProps {
  label: string;
  selected: boolean;
  onClick: () => void;
  description?: string;
}

export default function ChoiceChip({ label, selected, onClick, description }: ChoiceChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-3 py-2 text-left text-sm font-medium transition ${
        selected
          ? "border-amber-500 bg-amber-950 text-amber-200"
          : "border-zinc-600 bg-zinc-800 text-zinc-300 hover:border-amber-600 hover:bg-zinc-700"
      }`}
    >
      <span className="block">{label}</span>
      {description && <span className="block text-xs mt-0.5 opacity-70">{description}</span>}
    </button>
  );
}
