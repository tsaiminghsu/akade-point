"use client";

import { useEffect, useState } from "react";

interface Shop {
  shopCode: string;
  name: string;
  location?: string;
  isActive: boolean;
}

export default function AdminShopsPage() {
  const [shops, setShops] = useState<Shop[]>([]);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [loading, setLoading] = useState(false);

  const loadShops = () =>
    fetch("/api/admin/shops").then((r) => r.json()).then((d) => setShops(d.shops ?? []));

  useEffect(() => { loadShops(); }, []);

  const addShop = async () => {
    setLoading(true);
    await fetch("/api/admin/shops", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shopCode: code, name, location }),
    });
    setCode(""); setName(""); setLocation("");
    await loadShops();
    setLoading(false);
  };

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-white">店家管理</h1>

      <div className="bg-white/5 rounded-xl p-4 space-y-3">
        <p className="font-semibold text-zinc-300">新增店家</p>
        <div className="grid grid-cols-2 gap-2">
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="代碼 e.g. TPE-001" className="bg-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-zinc-500" />
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="店家名稱" className="bg-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-zinc-500" />
        </div>
        <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="地址（選填）" className="w-full bg-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-zinc-500" />
        <button onClick={addShop} disabled={loading || !code || !name} className="w-full py-2 bg-amber-500 hover:bg-amber-400 disabled:bg-zinc-700 text-black font-bold rounded-lg text-sm transition-colors">
          新增
        </button>
      </div>

      <div className="space-y-2">
        {shops.map((shop) => (
          <div key={shop.shopCode} className="bg-white/5 rounded-xl p-3 flex items-center gap-3">
            <span className="font-mono text-amber-400 text-sm w-20 shrink-0">{shop.shopCode}</span>
            <div className="flex-1">
              <p className="text-white text-sm">{shop.name}</p>
              {shop.location && <p className="text-zinc-400 text-xs">{shop.location}</p>}
            </div>
            <span className={`text-xs px-2 py-0.5 rounded ${shop.isActive ? "bg-emerald-500/20 text-emerald-400" : "bg-zinc-500/20 text-zinc-400"}`}>
              {shop.isActive ? "啟用" : "停用"}
            </span>
          </div>
        ))}
        {shops.length === 0 && <p className="text-zinc-500 text-sm text-center py-4">尚無店家</p>}
      </div>
    </div>
  );
}
