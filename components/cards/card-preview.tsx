import { RarityBadge } from "@/components/ui/rarity-badge";
import { cn } from "@/lib/utils";
import type { Rarity } from "@/lib/dynamo/cards";

const BORDER_COLOR: Record<Rarity, string> = {
  N: "border-zinc-500",
  R: "border-blue-500",
  SR: "border-amber-400",
  SSR: "border-purple-400",
};

const ROBOT_EMOJI: Record<string, string> = {
  "001": "🤖",
  "002": "📊",
  "003": "🛡️",
  "004": "⚡",
  "005": "🌌",
};

export function CardPreview({
  cardNumber,
  nameZh,
  nameEn,
  rarity,
  basePoints,
  className,
}: {
  cardNumber: string;
  nameZh: string;
  nameEn: string;
  rarity: Rarity;
  basePoints: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border-2 bg-[hsl(222,47%,11%)] p-4 flex flex-col items-center gap-3",
        BORDER_COLOR[rarity],
        className
      )}
    >
      <div className="flex justify-between items-start w-full">
        <span className="text-zinc-400 text-xs font-mono">{cardNumber}</span>
        <RarityBadge rarity={rarity} />
      </div>
      <div className="text-6xl">{ROBOT_EMOJI[cardNumber] ?? "🤖"}</div>
      <div className="text-center">
        <p className="font-bold text-white">{nameZh}</p>
        <p className="text-zinc-400 text-xs">{nameEn}</p>
      </div>
      <div className="text-amber-400 font-bold">{basePoints.toLocaleString()} 點</div>
    </div>
  );
}
