"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export function GameTimer({
  seconds,
  onExpire,
}: {
  seconds: number;
  onExpire: () => void;
}) {
  const [remaining, setRemaining] = useState(seconds);
  const expiredRef = useRef(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining((prev) => {
        const next = prev - 1;
        if (next <= 0 && !expiredRef.current) {
          expiredRef.current = true;
          clearInterval(interval);
          onExpire();
          return 0;
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [onExpire]);

  const pct = (remaining / seconds) * 100;

  return (
    <div className="flex flex-col items-center gap-1">
      <span
        className={cn(
          "text-3xl font-bold tabular-nums",
          remaining <= 10 ? "text-red-400 animate-pulse" : "text-amber-400"
        )}
      >
        {remaining}
      </span>
      <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-1000",
            remaining <= 10 ? "bg-red-500" : "bg-amber-400"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
