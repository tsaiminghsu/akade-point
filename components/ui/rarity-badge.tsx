import { cn } from "@/lib/utils";
import type { Rarity } from "@/lib/dynamo/cards";

const styles: Record<Rarity, string> = {
  N: "bg-zinc-600 text-zinc-100",
  R: "bg-blue-600 text-blue-100",
  SR: "bg-amber-500 text-amber-900 font-bold",
  SSR: "bg-gradient-to-r from-yellow-400 via-pink-500 to-purple-500 text-white font-bold",
};

export function RarityBadge({
  rarity,
  className,
}: {
  rarity: Rarity;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold",
        styles[rarity],
        className
      )}
    >
      {rarity}
    </span>
  );
}
