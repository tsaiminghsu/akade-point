"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { OrbColor } from "@/lib/game/orb-generator";

const ORB_STYLE: Record<OrbColor, string> = {
  FIRE: "orb-fire",
  WATER: "orb-water",
  WOOD: "orb-wood",
  LIGHT: "orb-light",
  DARK: "orb-dark",
  RECOVERY: "orb-recovery",
};

const ORB_EMOJI: Record<OrbColor, string> = {
  FIRE: "🔥",
  WATER: "💧",
  WOOD: "🌿",
  LIGHT: "✨",
  DARK: "🌑",
  RECOVERY: "💗",
};

export function OrbCell({
  color,
  isHeld,
  isMatched,
  size = 52,
}: {
  color: OrbColor;
  isHeld: boolean;
  isMatched?: boolean;
  size?: number;
}) {
  return (
    <motion.div
      className={cn(
        "rounded-full flex items-center justify-center text-lg select-none cursor-pointer border-2 transition-opacity",
        ORB_STYLE[color],
        isHeld ? "border-white scale-110 z-10" : "border-transparent",
        isMatched ? "border-red-500 animate-ping opacity-50" : ""
      )}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      animate={{ 
        scale: isHeld ? 1.15 : isMatched ? 0.3 : 1,
        opacity: isMatched ? 0.2 : 1 
      }}
      transition={{ type: "spring", stiffness: 400, damping: 20 }}
    >
      {ORB_EMOJI[color]}
    </motion.div>
  );
}
