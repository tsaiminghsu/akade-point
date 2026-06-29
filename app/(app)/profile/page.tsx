import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUser } from "@/lib/dynamo/users";
import { getUserSessions } from "@/lib/dynamo/sessions";
import { getUserRegistrations } from "@/lib/dynamo/registrations";
import { SignOutButton } from "./sign-out-button";
import { Star, Ticket } from "lucide-react";

const TRIGGER_LABEL: Record<string, string> = {
  SMALL_GIFT: "小禮",
  MEDIUM_GIFT: "中禮",
  LARGE_GIFT: "大禮",
  SSR_COMPLETE: "SSR 傳說卡",
};

import { redirect } from "next/navigation";

export default async function ProfilePage() {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login");
  }
  const userId = (session.user as { id: string }).id;

  const [user, gameSessions, registrations] = await Promise.all([
    getUser(userId),
    getUserSessions(userId),
    getUserRegistrations(userId),
  ]);

  const completedGames = gameSessions.filter((s) => s.status === "COMPLETED");

  return (
    <div className="p-4 space-y-5">
      <div className="pt-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center text-2xl">
            🤖
          </div>
          <div>
            <p className="font-bold text-white">{user?.displayName ?? "收藏家"}</p>
            <p className="text-xs text-zinc-400">{user?.email ?? ""}</p>
          </div>
        </div>
        <SignOutButton />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-white/5 rounded-xl p-3 text-center">
          <div className="flex justify-center text-amber-400 mb-1"><Star className="w-4 h-4" /></div>
          <p className="text-xl font-bold text-white">{(user?.totalPoints ?? 0).toLocaleString()}</p>
          <p className="text-xs text-zinc-400">點數</p>
        </div>
        <div className="bg-white/5 rounded-xl p-3 text-center">
          <div className="flex justify-center text-purple-400 mb-1"><Ticket className="w-4 h-4" /></div>
          <p className="text-xl font-bold text-white">{user?.ticketCount ?? 0}</p>
          <p className="text-xs text-zinc-400">抽獎卷</p>
        </div>
        <div className="bg-white/5 rounded-xl p-3 text-center">
          <div className="text-xl mb-1">🃏</div>
          <p className="text-xl font-bold text-white">{registrations.length}</p>
          <p className="text-xs text-zinc-400">卡片</p>
        </div>
      </div>

      {/* Recent registrations */}
      {registrations.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-zinc-300">最近登錄</p>
          {registrations.slice(0, 5).map((reg) => (
            <div key={reg.registrationId} className="bg-white/5 rounded-xl p-3 flex items-center gap-3">
              <span className="text-2xl">
                {reg.cardNumber === "001" ? "🤖" : reg.cardNumber === "002" ? "📊" : reg.cardNumber === "003" ? "🛡️" : reg.cardNumber === "004" ? "⚡" : "🌌"}
              </span>
              <div className="flex-1">
                <p className="text-white text-sm">{reg.nameZh}</p>
                <p className="text-xs text-zinc-400">{reg.shopName}</p>
              </div>
              <span className={reg.choice === "POINTS" ? "text-amber-400 text-sm font-bold" : "text-purple-400 text-sm"}>
                {reg.choice === "POINTS" ? `+${reg.pointsAwarded}` : "🎫"}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Recent games */}
      {completedGames.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-zinc-300">遊戲記錄</p>
          {completedGames.slice(0, 5).map((g) => (
            <div key={g.sessionId} className="bg-white/5 rounded-xl p-3 flex items-center gap-3">
              <span className="text-xl">🎮</span>
              <div className="flex-1">
                <p className="text-white text-sm">{TRIGGER_LABEL[g.trigger] ?? g.trigger}</p>
                <p className="text-xs text-zinc-400">{g.combos} Combo × {g.multiplier}x</p>
              </div>
              <span className="text-amber-400 font-bold text-sm">+{g.totalPoints?.toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
