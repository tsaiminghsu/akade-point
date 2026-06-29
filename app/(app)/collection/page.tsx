"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface CardDetail {
  id: string;
  nameZh: string;
  nameEn: string;
  rarity: "N" | "R" | "SR" | "SSR";
  element: "FIRE" | "WATER" | "WOOD" | "LIGHT" | "DARK";
  emoji: string;
  basePoints: number;
  boostZh: string;
  desc: string;
}

const SERIES_1_CARDS: CardDetail[] = [
  {
    id: "001",
    nameZh: "探索機器人",
    nameEn: "Explorer Robot",
    rarity: "N",
    element: "FIRE",
    emoji: "🤖",
    basePoints: 100,
    boostZh: "火屬性傷害 +10%",
    desc: "配備高度適應性履帶與熱能感應探針，專門部署於極端高溫或火山區域，進行初期的礦石採集與地形探勘。"
  },
  {
    id: "002",
    nameZh: "分析機器人",
    nameEn: "Analysis Robot",
    rarity: "N",
    element: "WATER",
    emoji: "📊",
    basePoints: 200,
    boostZh: "水屬性傷害 +10%",
    desc: "內部搭載高速量子分析晶片與深海聲納掃描儀，能精準解析水源成分，在惡劣的水下環境分析出珍貴的能量波動。"
  },
  {
    id: "003",
    nameZh: "守護機器人",
    nameEn: "Guardian Robot",
    rarity: "R",
    element: "WOOD",
    emoji: "🛡️",
    basePoints: 300,
    boostZh: "木屬性傷害 +15%",
    desc: "使用高強度生物合金與能量防護盾，負責保護核心森林基地的安全，能與周圍的植物磁場進行頻率共振。"
  },
  {
    id: "004",
    nameZh: "能源機器人",
    nameEn: "Energy Robot",
    rarity: "R",
    element: "LIGHT",
    emoji: "⚡",
    basePoints: 500,
    boostZh: "光屬性傷害 +15%",
    desc: "擁有高效率太陽能收集板與無線能量傳輸單元，是小隊持續運作的能量樞紐，能釋放強光干擾敵方視線。"
  },
  {
    id: "005",
    nameZh: "星際機器人",
    nameEn: "Stellar Robot",
    rarity: "SR",
    element: "DARK",
    emoji: "🌌",
    basePoints: 1000,
    boostZh: "暗屬性傷害 +20%",
    desc: "採用反物質塗層與暗物質驅動核心，能在超限真空星系中自由穿梭，並在暗處實施精確打擊。"
  },
  {
    id: "SSR_1",
    nameZh: "機器人之王",
    nameEn: "King of Robots",
    rarity: "SSR",
    element: "LIGHT",
    emoji: "👑",
    basePoints: 2500,
    boostZh: "全屬性傷害 +30%",
    desc: "集齊第一彈所有核心晶片後，由主神機庫所解鎖的終極指揮機體。掌握全屬性能量共鳴，是機器人宇宙的至高王座。"
  }
];

const SERIES_2_CARDS: CardDetail[] = [
  {
    id: "006",
    nameZh: "採礦機器人",
    nameEn: "Miner Robot",
    rarity: "N",
    element: "WOOD",
    emoji: "⛏️",
    basePoints: 120,
    boostZh: "木屬性傷害 +10%",
    desc: "搭載重型震波鑽頭與生物能儲藏槽，專門在繁茂星系的雨林地底下挖掘稀有元素。"
  },
  {
    id: "007",
    nameZh: "醫療機器人",
    nameEn: "Medical Robot",
    rarity: "N",
    element: "WATER",
    emoji: "💉",
    basePoints: 180,
    boostZh: "水屬性恢復效果 +15%",
    desc: "攜帶無菌噴霧與生命體徵分析儀，能在嚴酷的太空環境中迅速修復受損的生化體。"
  },
  {
    id: "008",
    nameZh: "戰術護衛兵",
    nameEn: "Defender Drone",
    rarity: "R",
    element: "DARK",
    emoji: "💂",
    basePoints: 320,
    boostZh: "暗屬性傷害 +15%",
    desc: "配備微型磁軌炮與雷達干擾盾，是極速戰術護衛編組的中堅力量。"
  },
  {
    id: "009",
    nameZh: "超載加速器",
    nameEn: "Overdrive Booster",
    rarity: "R",
    element: "LIGHT",
    emoji: "🚀",
    basePoints: 480,
    boostZh: "光屬性傷害 +15%",
    desc: "運用重力偏折引擎與推進器，能在短時間內使發動機產生三倍的超載能量輸出。"
  },
  {
    id: "010",
    nameZh: "銀河裁決者",
    nameEn: "Galactic Arbiter",
    rarity: "SR",
    element: "FIRE",
    emoji: "☄️",
    basePoints: 1100,
    boostZh: "火屬性傷害 +20%",
    desc: "手持電漿裁決巨劍，裝備聚變噴射背包，是銀河聯邦用以裁決叛亂勢力的終極機動裝甲。"
  },
  {
    id: "SSR_2",
    nameZh: "銀河君王",
    nameEn: "Galactic Monarch",
    rarity: "SSR",
    element: "DARK",
    emoji: "🪐",
    basePoints: 2500,
    boostZh: "全屬性傷害 +30% (二代限定)",
    desc: "解鎖第二彈所有宇宙模組後啟動的終極主宰機體。能夠直接操控引力黑洞，扭曲星宿的運行軌跡。"
  }
];

const SERIES_3_CARDS: CardDetail[] = [
  {
    id: "011",
    nameZh: "重力偏折儀",
    nameEn: "Gravity Deflector",
    rarity: "N",
    element: "LIGHT",
    emoji: "🔮",
    basePoints: 150,
    boostZh: "達 6 Combo 以上時，光屬性額外增傷 15%",
    desc: "利用超弦力場干涉重力波方向，能折射強光以聚集能量，並在連擊達到高點時瞬間引爆。"
  },
  {
    id: "012",
    nameZh: "等離子體",
    nameEn: "Plasma Sphere",
    rarity: "N",
    element: "FIRE",
    emoji: "☄️",
    basePoints: 160,
    boostZh: "火屬性有 20% 機率造成 1.5 倍爆擊",
    desc: "將帶電離子流約束在微型磁籠中的高能個體，發射時會帶起不穩定的電弧裂變。"
  },
  {
    id: "013",
    nameZh: "共振接收器",
    nameEn: "Resonance Receiver",
    rarity: "R",
    element: "WATER",
    emoji: "📡",
    basePoints: 350,
    boostZh: "水屬性傷害 +15%",
    desc: "主要部署於液態行星接收深空雜音，能將微弱的分子共振轉換為持續性的動力源。"
  },
  {
    id: "014",
    nameZh: "時空擾動者",
    nameEn: "Time Disruptor",
    rarity: "R",
    element: "WOOD",
    emoji: "⏳",
    basePoints: 450,
    boostZh: "轉珠時間延長 1.0 秒",
    desc: "內建微型時間停滯力場的防禦組件，能短暫延緩周圍環境的熵增過程，給予轉珠時更從容的排序判斷。"
  },
  {
    id: "015",
    nameZh: "虛空觀察者",
    nameEn: "Void Observer",
    rarity: "SR",
    element: "DARK",
    emoji: "👁️",
    basePoints: 1200,
    boostZh: "暗屬性攻擊有 5% 機率無視屬性相剋",
    desc: "能在亞原子層級觀測虛空維度，其暗物质射線不受普通光譜偏折影響，能強行打穿反制抗性。"
  },
  {
    id: "SSR_3",
    nameZh: "量子主宰",
    nameEn: "Quantum Monarch",
    rarity: "SSR",
    element: "LIGHT",
    emoji: "🧬",
    basePoints: 3000,
    boostZh: "每 Combo 的最終傷害加成提升至 +35%",
    desc: "解鎖第三彈超弦晶片後現身的最終超載形態。調和微觀世界的弦震頻率，使轉珠的 Combo 戰法獲得前所未有的放大效應。"
  }
];

const SERIES_4_CARDS: CardDetail[] = [
  {
    id: "016",
    nameZh: "日冕爆發機",
    nameEn: "Solar Coronal",
    rarity: "N",
    element: "DARK",
    emoji: "☀️",
    basePoints: 150,
    boostZh: "對火屬性 Boss 傷害提升 20%",
    desc: "將日冕活動的磁重聯能量模擬於微晶片中，釋放出來的暗能量衝擊會強烈干擾高熱屬性機體。"
  },
  {
    id: "017",
    nameZh: "凋零核心",
    nameEn: "Decay Core",
    rarity: "N",
    element: "WOOD",
    emoji: "🥀",
    basePoints: 160,
    boostZh: "木屬性傷害提升 15%",
    desc: "釋放高速衰變粒子的有害核心，會侵蝕附近金屬的原子键結，並以生物電能的消逝作為轉化能量。"
  },
  {
    id: "018",
    nameZh: "絕對零度",
    nameEn: "Absolute Zero",
    rarity: "R",
    element: "WATER",
    emoji: "❄️",
    basePoints: 380,
    boostZh: "對水屬性 Boss 傷害提升 25%",
    desc: "使分子運動徹底停滯的超低溫力場產生器，能將冰晶屬性 Boss 凍結並使其結構脆化。"
  },
  {
    id: "019",
    nameZh: "超新星發射器",
    nameEn: "Supernova Blaster",
    rarity: "R",
    element: "LIGHT",
    emoji: "💥",
    basePoints: 500,
    boostZh: "血量低於 20% 時，光屬性攻擊力提升 50%",
    desc: "在小隊面臨毀滅危機時會強行啟動的死線組件，引爆過載聚變爐釋放超新星級別的光芒。"
  },
  {
    id: "020",
    nameZh: "湮滅使者",
    nameEn: "Annihilation Harbinger",
    rarity: "SR",
    element: "FIRE",
    emoji: "☣️",
    basePoints: 1250,
    boostZh: "火屬性傷害 +25%",
    desc: "以正負電子對湮滅為原理的終極熱能兵器，釋放出極高密度的能量束摧毀沿途的一切阻礙。"
  },
  {
    id: "SSR_4",
    nameZh: "虛空終結者",
    nameEn: "Void Terminator",
    rarity: "SSR",
    element: "DARK",
    emoji: "🕳️",
    basePoints: 3500,
    boostZh: "對所有 Boss 傷害加成 40%，但小隊血量上限 -20%",
    desc: "直面虛空邊緣黑洞而誕生的反物質武裝。將重力扭曲的奇點置於核心，用極端的生存代價換取毀天滅地的破壞力。"
  }
];

const TIERS = [
  { id: "SMALL", name: "小禮", desc: "任意 2 張 N 卡", bonus: "+50 點遊戲" },
  { id: "MEDIUM", name: "中禮", desc: "2N + 1R", bonus: "+150 點遊戲" },
  { id: "LARGE", name: "大禮", desc: "2N + 2R + 1SR", bonus: "+400 點遊戲" },
  { id: "SSR_COMPLETE", name: "SSR 傳說卡", desc: "完整套組", bonus: "機器人之王 + 1000 點遊戲" },
] as const;

export default function CollectionPage() {
  const router = useRouter();
  
  // Tabs & filters state
  const [activeTab, setActiveTab] = useState<"series_1" | "series_2" | "series_3" | "series_4">("series_1");
  const [searchQuery, setSearchQuery] = useState("");
  const [rarityFilter, setRarityFilter] = useState<"ALL" | "N" | "R" | "SR" | "SSR">("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "OWNED" | "LOCKED">("ALL");
  
  // Collection fetch state
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  
  // Selected Card for Modal
  const [selectedCard, setSelectedCard] = useState<CardDetail | null>(null);

  useEffect(() => {
    fetch("/api/collection")
      .then((res) => {
        if (res.status === 401) {
          setError("unauthorized");
          return;
        }
        if (!res.ok) throw new Error("載入收藏失敗");
        return res.json();
      })
      .then((data) => {
        if (data) setStatus(data);
      })
      .catch((err) => {
        setError(err.message || "伺服器載入異常");
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  // Map owned cards into a count dictionary
  const ownedCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    if (!status) return counts;
    
    // Series 1 N/R/SR
    status.cards?.forEach((card: { cardNumber: string }) => {
      counts[card.cardNumber] = (counts[card.cardNumber] ?? 0) + 1;
    });
    
    // Series 1 SSR
    if (status.claimedTiers?.includes("SSR_COMPLETE")) {
      counts["SSR_1"] = 1;
    }
    
    return counts;
  }, [status]);

  const cardsList = useMemo(() => {
    switch (activeTab) {
      case "series_1": return SERIES_1_CARDS;
      case "series_2": return SERIES_2_CARDS;
      case "series_3": return SERIES_3_CARDS;
      case "series_4": return SERIES_4_CARDS;
      default: return SERIES_1_CARDS;
    }
  }, [activeTab]);

  // Filtered cards calculation
  const filteredCards = useMemo(() => {
    return cardsList.filter((card) => {
      const isOwned = (ownedCounts[card.id] ?? 0) > 0;
      
      const matchesSearch = card.nameZh.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            card.nameEn.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesRarity = rarityFilter === "ALL" || card.rarity === rarityFilter;
      
      const matchesStatus = statusFilter === "ALL" ||
                            (statusFilter === "OWNED" && isOwned) ||
                            (statusFilter === "LOCKED" && !isOwned);
                            
      return matchesSearch && matchesRarity && matchesStatus;
    });
  }, [cardsList, searchQuery, rarityFilter, statusFilter, ownedCounts]);

  // Overall Statistics
  const stats = useMemo(() => {
    const totalS1Count = SERIES_1_CARDS.filter(c => (ownedCounts[c.id] ?? 0) > 0).length;
    const totalS2Count = SERIES_2_CARDS.filter(c => (ownedCounts[c.id] ?? 0) > 0).length;
    const totalS3Count = SERIES_3_CARDS.filter(c => (ownedCounts[c.id] ?? 0) > 0).length;
    const totalS4Count = SERIES_4_CARDS.filter(c => (ownedCounts[c.id] ?? 0) > 0).length;
    
    return {
      s1Progress: `${totalS1Count} / ${SERIES_1_CARDS.length}`,
      s2Progress: `${totalS2Count} / ${SERIES_2_CARDS.length}`,
      s3Progress: `${totalS3Count} / ${SERIES_3_CARDS.length}`,
      s4Progress: `${totalS4Count} / ${SERIES_4_CARDS.length}`,
      totalOwned: totalS1Count + totalS2Count + totalS3Count + totalS4Count,
      totalCards: SERIES_1_CARDS.length + SERIES_2_CARDS.length + SERIES_3_CARDS.length + SERIES_4_CARDS.length,
      nOwned: (status?.nCount ?? 0),
      rOwned: (status?.rCount ?? 0),
      srOwned: (status?.srCount ?? 0),
      ssrOwned: status?.claimedTiers?.includes("SSR_COMPLETE") ? 1 : 0
    };
  }, [status, ownedCounts]);

  if (loading) {
    return (
      <div className="p-4 space-y-6 max-w-md mx-auto pt-8">
        <div className="space-y-2 text-center">
          <div className="w-16 h-16 bg-white/5 rounded-2xl animate-pulse mx-auto" />
          <div className="h-5 w-32 bg-white/5 rounded animate-pulse mx-auto" />
          <div className="h-3 w-48 bg-white/5 rounded animate-pulse mx-auto" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div key={idx} className="h-28 bg-white/5 rounded-xl border border-white/5 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error === "unauthorized") {
    return (
      <div className="p-4 space-y-6 max-w-sm mx-auto text-center pt-24">
        <div className="text-6xl">🔒</div>
        <h1 className="text-xl font-extrabold text-white">尚未登入</h1>
        <p className="text-zinc-400 text-xs leading-relaxed">
          請先登入您的帳戶，以讀取已解鎖的機器人卡牌與兌換圖鑑獎勵！
        </p>
        <div className="pt-2 space-y-3">
          <Link
            href="/login"
            className="block w-full py-3 bg-amber-500 hover:bg-amber-400 text-black font-extrabold rounded-xl transition-all shadow-[0_4px_12px_rgba(251,191,36,0.3)]"
          >
            使用 LINE 登入
          </Link>
          <button
            onClick={() => {
              setStatus({
                nCount: 2,
                rCount: 2,
                srCount: 1,
                cards: [
                  { cardNumber: "001", rarity: "N" },
                  { cardNumber: "002", rarity: "N" },
                  { cardNumber: "003", rarity: "R" },
                  { cardNumber: "004", rarity: "R" },
                  { cardNumber: "005", rarity: "SR" }
                ],
                claimedTiers: ["SMALL", "MEDIUM", "LARGE"],
                eligibleTiers: ["SSR_COMPLETE"]
              });
              setError("");
            }}
            className="block w-full py-2.5 bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white rounded-xl text-xs transition-colors border border-white/5"
          >
            🛠️ 開發者免登入模擬測試圖鑑
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-5 max-w-md mx-auto relative pb-20">
      {/* Page Title & Overview */}
      <div className="pt-2 flex justify-between items-end">
        <div>
          <h1 className="text-xl font-black text-white flex items-center gap-1.5">
            🤖 機器人宇宙圖鑑
          </h1>
          <p className="text-zinc-500 text-[10px] uppercase tracking-wider mt-0.5">
            Robot Encyclopedia & Gallery
          </p>
        </div>
        <div className="text-right">
          <span className="text-xs bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded-full border border-amber-500/20 font-bold">
            已收集 {stats.totalOwned} / {stats.totalCards}
          </span>
        </div>
      </div>

      {/* Series Selection Tabs */}
      <div className="flex overflow-x-auto border-b border-white/10 scrollbar-none gap-2 pb-0.5">
        {(["series_1", "series_2", "series_3", "series_4"] as const).map((tab) => {
          const label = 
            tab === "series_1" ? "第一彈" :
            tab === "series_2" ? "第二彈" :
            tab === "series_3" ? "第三彈" : "第四彈";
          const subtitle = 
            tab === "series_1" ? "創世" :
            tab === "series_2" ? "星海" :
            tab === "series_3" ? "超弦" : "虛空";
          const progress = 
            tab === "series_1" ? stats.s1Progress :
            tab === "series_2" ? stats.s2Progress :
            tab === "series_3" ? stats.s3Progress : stats.s4Progress;
          const isPreview = tab !== "series_1";
          
          return (
            <button
              key={tab}
              onClick={() => {
                setActiveTab(tab);
                setSearchQuery("");
              }}
              className={cn(
                "flex-1 min-w-[78px] pb-2 text-xs font-bold transition-all relative border-b-2 text-center",
                activeTab === tab
                  ? "text-amber-400 border-amber-500 font-extrabold"
                  : "text-zinc-500 border-transparent hover:text-zinc-300"
              )}
            >
              <div className="flex items-center justify-center gap-0.5">
                <span>{label}</span>
                {isPreview && (
                  <span className="bg-purple-600 text-[6.5px] text-white px-0.5 rounded scale-75 font-black select-none">
                    P
                  </span>
                )}
              </div>
              <div className="text-[7.5px] font-medium opacity-80 mt-0.5">{subtitle} ({progress})</div>
            </button>
          );
        })}
      </div>

      {/* Filters Dashboard */}
      <div className="space-y-2 bg-white/5 p-3 rounded-xl border border-white/5">
        <input
          type="text"
          placeholder="搜尋機器人名稱 (中文/英文)..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full text-xs bg-zinc-950/80 border border-white/5 rounded-lg px-3 py-2 text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-amber-500/50"
        />

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <label className="text-[9px] text-zinc-500 font-bold uppercase block mb-1">稀有度</label>
            <select
              value={rarityFilter}
              onChange={(e) => setRarityFilter(e.target.value as any)}
              className="w-full bg-zinc-950/80 border border-white/5 rounded-lg px-2 py-1 text-zinc-300 focus:outline-none focus:border-amber-500/50"
            >
              <option value="ALL">全部稀有度</option>
              <option value="N">N (普通)</option>
              <option value="R">R (稀有)</option>
              <option value="SR">SR (超稀有)</option>
              <option value="SSR">SSR (傳說)</option>
            </select>
          </div>
          <div>
            <label className="text-[9px] text-zinc-500 font-bold uppercase block mb-1">解鎖狀態</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="w-full bg-zinc-950/80 border border-white/5 rounded-lg px-2 py-1 text-zinc-300 focus:outline-none focus:border-amber-500/50"
            >
              <option value="ALL">全部狀態</option>
              <option value="OWNED">已擁有 (Owned)</option>
              <option value="LOCKED">未擁有 (Locked)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Cards Illustrated Grid */}
      <div className="grid grid-cols-3 gap-3">
        {filteredCards.map((card) => {
          const count = ownedCounts[card.id] ?? 0;
          const isOwned = count > 0;
          
          return (
            <motion.div
              key={card.id}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setSelectedCard(card)}
              className={cn(
                "rounded-xl p-2 text-center border-2 cursor-pointer transition-all relative overflow-hidden select-none",
                isOwned
                  ? card.rarity === "SSR"
                    ? "border-amber-400 bg-amber-400/10 shadow-[0_0_12px_rgba(251,191,36,0.2)]"
                    : card.rarity === "SR"
                    ? "border-purple-500 bg-purple-500/10"
                    : card.rarity === "R"
                    ? "border-blue-500 bg-blue-500/10"
                    : "border-zinc-500 bg-zinc-500/10"
                  : "border-white/5 bg-white/5 opacity-40 hover:opacity-60"
              )}
            >
              {/* Element top-left indicator dot */}
              <div className={cn(
                "absolute top-1.5 left-1.5 w-2 h-2 rounded-full",
                card.element === "FIRE" ? "bg-red-500 shadow-[0_0_4px_#ef4444]" :
                card.element === "WATER" ? "bg-blue-500 shadow-[0_0_4px_#3b82f6]" :
                card.element === "WOOD" ? "bg-emerald-500 shadow-[0_0_4px_#10b981]" :
                card.element === "LIGHT" ? "bg-yellow-400 shadow-[0_0_4px_#facc15]" :
                "bg-purple-600 shadow-[0_0_4px_#a855f7]"
              )} />

              {/* Rarity label top-right */}
              <span className={cn(
                "absolute top-1 right-1 text-[7px] font-black px-1 rounded-sm",
                card.rarity === "SSR" ? "bg-amber-500 text-black" :
                card.rarity === "SR" ? "bg-purple-500 text-white" :
                card.rarity === "R" ? "bg-blue-500 text-white" :
                "bg-zinc-600 text-white"
              )}>
                {card.rarity}
              </span>

              {/* Central Emoji / Silhouette */}
              <div className="text-3xl my-3 flex justify-center items-center h-10 select-none">
                {isOwned ? card.emoji : "🔒"}
              </div>

              {/* Card Label */}
              <p className="text-[10px] font-bold text-zinc-200 mt-1 leading-tight truncate">
                {card.nameZh}
              </p>
              <p className="text-[7px] text-zinc-500 uppercase tracking-widest truncate font-mono">
                #{card.id}
              </p>

              {/* Owned Count tag */}
              {isOwned && count > 1 && (
                <span className="absolute bottom-1 right-1 text-[7px] bg-amber-500 text-black font-extrabold rounded px-1 scale-90">
                  ×{count}
                </span>
              )}
            </motion.div>
          );
        })}

        {filteredCards.length === 0 && (
          <div className="col-span-3 py-10 text-center text-zinc-500 text-xs">
            查無相符的圖鑑卡牌項目。
          </div>
        )}
      </div>

      {/* Series 1 Reward Tiers (Only render in Series 1 tab) */}
      {activeTab === "series_1" && (
        <div className="space-y-2 pt-2">
          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">🎁 第一彈集卡獎勵</p>
          <div className="space-y-2">
            {TIERS.map((tier) => {
              const eligible = status?.eligibleTiers?.includes(tier.id);
              const claimed = status?.claimedTiers?.includes(tier.id);
              return (
                <div
                  key={tier.id}
                  className={cn(
                    "rounded-xl p-3 border flex items-center gap-3 transition-colors text-xs",
                    claimed
                      ? "border-zinc-800 bg-white/5 opacity-40"
                      : eligible
                      ? "border-emerald-500/30 bg-emerald-500/10"
                      : "border-white/5 bg-zinc-950/40"
                  )}
                >
                  <div className="text-2xl select-none">
                    {claimed ? "✅" : eligible ? "🎁" : "🔒"}
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-zinc-200 text-xs">{tier.name}</p>
                    <p className="text-[10px] text-zinc-500 leading-tight">{tier.desc}</p>
                    <p className="text-[10px] text-emerald-400 font-semibold">{tier.bonus}</p>
                  </div>
                  {eligible && !claimed && (
                    <Link
                      href={`/collection/claim/${tier.id}`}
                      className="shrink-0 bg-emerald-500 hover:bg-emerald-400 text-black text-[10px] font-black px-2.5 py-1.5 rounded-lg transition-colors"
                    >
                      領取
                    </Link>
                  )}
                  {claimed && (
                    <span className="text-[10px] text-zinc-500">已領取</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Series 2 Event Info */}
      {activeTab === "series_2" && (
        <div className="bg-purple-950/10 border border-purple-500/15 rounded-xl p-4 text-center space-y-2.5">
          <div className="text-3xl">🌌</div>
          <div className="space-y-1">
            <p className="font-extrabold text-xs text-purple-300">第二彈：星海啟航活動籌備中</p>
            <p className="text-[9px] text-zinc-500 leading-relaxed px-4">
              全新 6 款太空機械兵種與星海君王卡牌即將解鎖！後續實體卡片發布活動時，將開放二代 QR Code 掃描登入與對戰加成。
            </p>
          </div>
          <span className="inline-block bg-purple-500/20 text-purple-300 text-[8px] font-bold px-2 py-0.5 rounded-full">
            預計解鎖：第二期活動開啟時
          </span>
        </div>
      )}

      {/* Series 3 Event Info */}
      {activeTab === "series_3" && (
        <div className="bg-purple-950/10 border border-purple-500/15 rounded-xl p-4 text-center space-y-2.5">
          <div className="text-3xl">🧬</div>
          <div className="space-y-1">
            <p className="font-extrabold text-xs text-purple-300">第三彈：超弦異變活動籌備中</p>
            <p className="text-[9px] text-zinc-500 leading-relaxed px-4">
              微觀世界的超量子重組即將開啟！將帶來極致的轉珠 Combo 增幅特效，解鎖全新加成維度，敬請期待。
            </p>
          </div>
          <span className="inline-block bg-purple-500/20 text-purple-300 text-[8px] font-bold px-2 py-0.5 rounded-full">
            預計解鎖：第三期活動開啟時
          </span>
        </div>
      )}

      {/* Series 4 Event Info */}
      {activeTab === "series_4" && (
        <div className="bg-purple-950/10 border border-purple-500/15 rounded-xl p-4 text-center space-y-2.5">
          <div className="text-3xl">🕳️</div>
          <div className="space-y-1">
            <p className="font-extrabold text-xs text-purple-300">第四彈：虛空終結活動籌備中</p>
            <p className="text-[9px] text-zinc-500 leading-relaxed px-4">
              首年最終彈！直面虛空奇點的反物質主宰將引爆超限爆發技能。帶來高風險、超高回報的終極戰術加成卡牌。
            </p>
          </div>
          <span className="inline-block bg-purple-500/20 text-purple-300 text-[8px] font-bold px-2 py-0.5 rounded-full">
            預計解鎖：第四期活動開啟時
          </span>
        </div>
      )}

      {/* Interactive Detail Modal / Encyclopedia Drawer */}
      <AnimatePresence>
        {selectedCard && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedCard(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            
            {/* Modal Body */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-sm rounded-2xl bg-zinc-900 border border-white/10 p-5 space-y-4 overflow-hidden shadow-2xl"
            >
              {/* Element radial glow effect in modal background */}
              <div className={cn(
                "absolute top-0 left-1/2 -translate-x-1/2 w-48 h-48 rounded-full blur-3xl opacity-10 pointer-events-none -z-10",
                selectedCard.element === "FIRE" ? "bg-red-500" :
                selectedCard.element === "WATER" ? "bg-blue-500" :
                selectedCard.element === "WOOD" ? "bg-emerald-500" :
                selectedCard.element === "LIGHT" ? "bg-yellow-400" :
                "bg-purple-600"
              )} />

              {/* Close Button */}
              <button
                onClick={() => setSelectedCard(null)}
                className="absolute top-3 right-3 text-zinc-500 hover:text-white text-lg font-bold"
              >
                ✕
              </button>

              {/* Big Holographic Card Container */}
              <div className={cn(
                "w-36 h-36 mx-auto rounded-2xl border-2 flex flex-col justify-center items-center relative overflow-hidden shadow-lg",
                (ownedCounts[selectedCard.id] ?? 0) > 0
                  ? selectedCard.rarity === "SSR"
                    ? "border-amber-400 bg-amber-400/5 shadow-[0_0_20px_rgba(251,191,36,0.3)]"
                    : selectedCard.rarity === "SR"
                    ? "border-purple-500 bg-purple-500/5"
                    : selectedCard.rarity === "R"
                    ? "border-blue-500 bg-blue-500/5"
                    : "border-zinc-500 bg-zinc-500/5"
                  : "border-white/10 bg-white/5 opacity-50"
              )}>
                <span className="absolute top-2 left-2 text-[8px] font-mono text-zinc-400">
                  #{selectedCard.id}
                </span>
                
                {/* Element icon top-right in hologram */}
                <span className={cn(
                  "absolute top-2 right-2 text-[10px] font-black px-1.5 py-0.2 rounded-full border bg-zinc-950",
                  selectedCard.element === "FIRE" ? "text-red-400 border-red-500/20" :
                  selectedCard.element === "WATER" ? "text-blue-400 border-blue-500/20" :
                  selectedCard.element === "WOOD" ? "text-emerald-400 border-emerald-500/20" :
                  selectedCard.element === "LIGHT" ? "text-yellow-400 border-yellow-500/20" :
                  "text-purple-400 border-purple-500/20"
                )}>
                  {selectedCard.element === "FIRE" ? "🔥" :
                   selectedCard.element === "WATER" ? "💧" :
                   selectedCard.element === "WOOD" ? "🌿" :
                   selectedCard.element === "LIGHT" ? "✨" :
                   "🌑"}
                </span>

                <div className="text-6xl select-none mb-1">
                  {(ownedCounts[selectedCard.id] ?? 0) > 0 ? selectedCard.emoji : "🔒"}
                </div>
                
                <span className={cn(
                  "text-[8px] font-black px-1.5 py-0.2 rounded mt-1 font-mono tracking-wider",
                  selectedCard.rarity === "SSR" ? "bg-amber-500 text-black" :
                  selectedCard.rarity === "SR" ? "bg-purple-500 text-white" :
                  selectedCard.rarity === "R" ? "bg-blue-500 text-white" :
                  "bg-zinc-600 text-white"
                )}>
                  {selectedCard.rarity} RARITY
                </span>
              </div>

              {/* Title & Stats */}
              <div className="text-center space-y-1">
                <h3 className="text-lg font-black text-white">{selectedCard.nameZh}</h3>
                <p className="text-[10px] text-zinc-500 font-mono tracking-wide uppercase">{selectedCard.nameEn}</p>
                <div className="flex justify-center gap-1.5 pt-1.5">
                  <span className="text-[9px] bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded-full">
                    屬性: {selectedCard.element}
                  </span>
                  <span className="text-[9px] bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded-full">
                    登錄積分: {selectedCard.basePoints} 點
                  </span>
                </div>
              </div>

              {/* Descriptions & Passive Skills */}
              <div className="space-y-2 text-xs border-t border-white/5 pt-3">
                <div className="space-y-1">
                  <p className="text-[10px] text-zinc-500 font-bold uppercase">🤖 機體介紹 (Lore)</p>
                  <p className="text-zinc-300 leading-relaxed text-[11px] bg-black/20 p-2 rounded-lg">
                    {selectedCard.desc}
                  </p>
                </div>

                <div className="space-y-1">
                  <p className="text-[10px] text-zinc-500 font-bold uppercase">⚔️ 轉珠戰鬥加成 (Combat Passive)</p>
                  <p className="text-amber-400 font-semibold text-[11px] bg-amber-500/5 border border-amber-500/10 p-2 rounded-lg flex items-center gap-1.5">
                    <span>🏆</span>
                    <span>此卡牌將為連擊小隊提供 <strong>{selectedCard.boostZh}</strong> 的被動加成</span>
                  </p>
                </div>
              </div>

              {/* Dynamic Status / Actions */}
              <div className="border-t border-white/5 pt-3 text-center space-y-2">
                <div className="flex justify-between items-center text-[10px] text-zinc-400 px-1">
                  <span>擁有數量：{(ownedCounts[selectedCard.id] ?? 0)} 張</span>
                  <span>
                    狀態：
                    {(ownedCounts[selectedCard.id] ?? 0) > 0 ? (
                      <span className="text-emerald-400 font-bold">已解鎖</span>
                    ) : (
                      <span className="text-zinc-500">未解鎖</span>
                    )}
                  </span>
                </div>

                {(ownedCounts[selectedCard.id] ?? 0) === 0 ? (
                  <button
                    onClick={() => {
                      setSelectedCard(null);
                      router.push("/scan");
                    }}
                    className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-black text-xs font-extrabold rounded-xl transition-all shadow-[0_4px_10px_rgba(251,191,36,0.2)]"
                  >
                    掃描實體 QR Code 以登錄此卡牌
                  </button>
                ) : (
                  <button
                    onClick={() => setSelectedCard(null)}
                    className="w-full py-2.5 bg-white/5 hover:bg-white/10 text-zinc-300 text-xs font-semibold rounded-xl transition-colors border border-white/5"
                  >
                    確定
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
