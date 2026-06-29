async function getStats() {
  // Direct call instead of fetch to avoid loopback in SSR
  const { listUsers } = await import("@/lib/dynamo/users");
  const { listCards } = await import("@/lib/dynamo/cards");
  const [users, cards] = await Promise.all([listUsers(), listCards()]);
  const registered = cards.filter((c) => c.isRegistered).length;
  const byRarity = { N: 0, R: 0, SR: 0 } as Record<string, number>;
  for (const c of cards) if (c.isRegistered && c.rarity in byRarity) byRarity[c.rarity]++;
  return {
    totalUsers: users.length,
    totalCards: cards.length,
    registeredCards: registered,
    unregisteredCards: cards.length - registered,
    totalPoints: users.reduce((s, u) => s + (u.totalPoints ?? 0), 0),
    byRarity,
  };
}

export default async function AdminPage() {
  const stats = await getStats();

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-white">活動統計</h1>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: "用戶數", value: stats.totalUsers },
          { label: "已登錄卡片", value: stats.registeredCards },
          { label: "未登錄卡片", value: stats.unregisteredCards },
          { label: "總卡片數", value: stats.totalCards },
          { label: "發放點數", value: stats.totalPoints.toLocaleString() },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white/5 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-amber-400">{value}</p>
            <p className="text-xs text-zinc-400 mt-1">{label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white/5 rounded-xl p-4 space-y-2">
        <p className="text-sm font-semibold text-zinc-300">按稀有度</p>
        {Object.entries(stats.byRarity).map(([rarity, count]) => (
          <div key={rarity} className="flex justify-between text-sm">
            <span className="text-zinc-400">{rarity}</span>
            <span className="text-white font-bold">{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
