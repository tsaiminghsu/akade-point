"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, QrCode, LayoutGrid, User, Trophy, ClipboardList } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "首頁", icon: Home },
  { href: "/scan", label: "掃描", icon: QrCode },
  { href: "/collection", label: "集卡", icon: LayoutGrid },
  { href: "/questionnaire", label: "問卷", icon: ClipboardList },
  { href: "/leaderboard", label: "排行", icon: Trophy },
  { href: "/profile", label: "個人", icon: User },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-[hsl(222,47%,11%)] border-t border-white/10 safe-area-pb">
      <div className="max-w-lg mx-auto flex">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex-1 flex flex-col items-center gap-0.5 py-2 text-xs transition-colors",
                active ? "text-amber-400" : "text-zinc-400 hover:text-zinc-200"
              )}
            >
              <Icon className="w-5 h-5" />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
