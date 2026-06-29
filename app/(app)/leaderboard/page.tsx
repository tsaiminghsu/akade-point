import { getLeaderboard } from "@/lib/dynamo/users";
import { Trophy } from "lucide-react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const MEDAL = ["🥇", "🥈", "🥉"];

export default async function LeaderboardPage() {
  const [session, leaders] = await Promise.all([
    getServerSession(authOptions),
    getLeaderboard(20),
  ]);
  const myId = (session?.user as { id?: string } | undefined)?.id;

  return (
    <div className="p-4 space-y-4">
      <div className="pt-2 flex items-center gap-2">
        <Trophy className="w-5 h-5 text-amber-400" />
        <h1 className="text-xl font-bold text-white">排行榜</h1>
      </div>

      <div className="space-y-2">
        {leaders.map((user, i) => (
          <div
            key={user.userId}
            className={`flex items-center gap-3 rounded-xl p-3 ${
              user.userId === myId
                ? "bg-amber-400/10 border border-amber-400/30"
                : "bg-white/5"
            }`}
          >
            <span className="text-lg w-8 text-center">
              {i < 3 ? MEDAL[i] : <span className="text-zinc-500 text-sm">{i + 1}</span>}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-semibold truncate">
                {user.displayName ?? "收藏家"}
                {user.userId === myId && <span className="text-amber-400 text-xs ml-1">(我)</span>}
              </p>
            </div>
            <span className="text-amber-400 font-bold">
              {(user.totalPoints ?? 0).toLocaleString()}
            </span>
          </div>
        ))}

        {leaders.length === 0 && (
          <p className="text-center text-zinc-400 py-8">尚無排行資料</p>
        )}
      </div>
    </div>
  );
}
