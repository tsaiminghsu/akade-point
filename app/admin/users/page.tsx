async function getUsers() {
  const { listUsers } = await import("@/lib/dynamo/users");
  return listUsers();
}

export default async function AdminUsersPage() {
  const users = await getUsers();

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-white">用戶管理 ({users.length})</h1>
      <div className="bg-white/5 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-white/5">
            <tr>
              <th className="text-left p-3 text-zinc-400">名稱</th>
              <th className="text-right p-3 text-zinc-400">點數</th>
              <th className="text-right p-3 text-zinc-400">抽獎卷</th>
              <th className="text-right p-3 text-zinc-400">身份</th>
            </tr>
          </thead>
          <tbody>
            {users.sort((a, b) => (b.totalPoints ?? 0) - (a.totalPoints ?? 0)).map((u) => (
              <tr key={u.userId} className="border-t border-white/5">
                <td className="p-3">
                  <p className="text-white">{u.displayName ?? "匿名"}</p>
                  <p className="text-xs text-zinc-500">{u.email ?? u.userId.slice(0, 12)}</p>
                </td>
                <td className="p-3 text-right text-amber-400 font-bold">
                  {(u.totalPoints ?? 0).toLocaleString()}
                </td>
                <td className="p-3 text-right text-purple-400">{u.ticketCount ?? 0}</td>
                <td className="p-3 text-right">
                  {u.isAdmin ? (
                    <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded">管理員</span>
                  ) : (
                    <span className="text-xs text-zinc-500">用戶</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
