"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { Printer, RefreshCw } from "lucide-react";
import type { Rarity } from "@/lib/dynamo/cards";

type ElementType = "FIRE" | "WATER" | "WOOD" | "LIGHT" | "DARK";

type CatalogCard = {
  id: string;
  nameZh: string;
  nameEn: string;
  rarity: Rarity;
  element: ElementType;
  emoji: string;
  basePoints: number;
  boostZh: string;
  desc: string;
};

const CATALOG_CARDS: CatalogCard[] = [
  { id: "001", nameZh: "探索機器人", nameEn: "Explorer Robot", rarity: "N", element: "FIRE", emoji: "🤖", basePoints: 100, boostZh: "火屬性傷害 +10%", desc: "極端高溫與火山區域的初期探勘機體。" },
  { id: "002", nameZh: "分析機器人", nameEn: "Analysis Robot", rarity: "N", element: "WATER", emoji: "📊", basePoints: 200, boostZh: "水屬性傷害 +10%", desc: "以量子分析晶片解析水源與能量波動。" },
  { id: "003", nameZh: "守護機器人", nameEn: "Guardian Robot", rarity: "R", element: "WOOD", emoji: "🛡️", basePoints: 300, boostZh: "木屬性傷害 +15%", desc: "森林基地防衛核心，能與植物磁場共振。" },
  { id: "004", nameZh: "能源機器人", nameEn: "Energy Robot", rarity: "R", element: "LIGHT", emoji: "⚡", basePoints: 500, boostZh: "光屬性傷害 +15%", desc: "小隊持續運作的太陽能樞紐。" },
  { id: "005", nameZh: "星際機器人", nameEn: "Stellar Robot", rarity: "SR", element: "DARK", emoji: "🌌", basePoints: 1000, boostZh: "暗屬性傷害 +20%", desc: "反物質塗層與暗物質核心的星際機體。" },
  { id: "SSR_1", nameZh: "機器人之王", nameEn: "King of Robots", rarity: "SSR", element: "LIGHT", emoji: "👑", basePoints: 2500, boostZh: "全屬性傷害 +30%", desc: "第一彈核心晶片解鎖的終極指揮機體。" },
  { id: "006", nameZh: "採礦機器人", nameEn: "Miner Robot", rarity: "N", element: "WOOD", emoji: "⛏️", basePoints: 120, boostZh: "木屬性傷害 +10%", desc: "雨林地底挖掘稀有元素的重型機體。" },
  { id: "007", nameZh: "醫療機器人", nameEn: "Medical Robot", rarity: "N", element: "WATER", emoji: "💉", basePoints: 180, boostZh: "水屬性恢復效果 +15%", desc: "嚴酷太空環境中的修復支援單位。" },
  { id: "008", nameZh: "戰術護衛兵", nameEn: "Defender Drone", rarity: "R", element: "DARK", emoji: "💂", basePoints: 320, boostZh: "暗屬性傷害 +15%", desc: "高速戰術護衛編組的中堅力量。" },
  { id: "009", nameZh: "超載加速器", nameEn: "Overdrive Booster", rarity: "R", element: "LIGHT", emoji: "🚀", basePoints: 480, boostZh: "光屬性傷害 +15%", desc: "短時間釋放三倍超載能量輸出。" },
  { id: "010", nameZh: "銀河裁決者", nameEn: "Galactic Arbiter", rarity: "SR", element: "FIRE", emoji: "☄️", basePoints: 1100, boostZh: "火屬性傷害 +20%", desc: "銀河聯邦裁決叛亂勢力的機動裝甲。" },
  { id: "SSR_2", nameZh: "銀河君王", nameEn: "Galactic Monarch", rarity: "SSR", element: "DARK", emoji: "🪐", basePoints: 2500, boostZh: "全屬性傷害 +30%", desc: "第二彈宇宙模組解鎖的引力主宰。" },
  { id: "011", nameZh: "重力偏折儀", nameEn: "Gravity Deflector", rarity: "N", element: "LIGHT", emoji: "🔮", basePoints: 150, boostZh: "6 Combo 以上光屬性增傷 15%", desc: "折射強光並聚集重力波能量。" },
  { id: "012", nameZh: "等離子體", nameEn: "Plasma Sphere", rarity: "N", element: "FIRE", emoji: "☄️", basePoints: 160, boostZh: "火屬性 20% 機率 1.5 倍爆擊", desc: "受磁籠約束的高能帶電離子流。" },
  { id: "013", nameZh: "共振接收器", nameEn: "Resonance Receiver", rarity: "R", element: "WATER", emoji: "📡", basePoints: 350, boostZh: "水屬性傷害 +15%", desc: "接收深空雜音並轉換為動力源。" },
  { id: "014", nameZh: "時空擾動者", nameEn: "Time Disruptor", rarity: "R", element: "WOOD", emoji: "⏳", basePoints: 450, boostZh: "轉珠時間延長 1.0 秒", desc: "短暫延緩周圍環境熵增的防禦組件。" },
  { id: "015", nameZh: "虛空觀察者", nameEn: "Void Observer", rarity: "SR", element: "DARK", emoji: "👁️", basePoints: 1200, boostZh: "暗屬性有 5% 機率無視相剋", desc: "觀測虛空維度並發射暗物質射線。" },
  { id: "SSR_3", nameZh: "量子主宰", nameEn: "Quantum Monarch", rarity: "SSR", element: "LIGHT", emoji: "🧬", basePoints: 3000, boostZh: "每 Combo 傷害加成提升至 +35%", desc: "第三彈超弦晶片啟動的最終形態。" },
  { id: "016", nameZh: "日冕爆發機", nameEn: "Solar Coronal", rarity: "N", element: "DARK", emoji: "☀️", basePoints: 150, boostZh: "對火屬性 Boss 傷害 +20%", desc: "以日冕磁重聯能量干擾高熱機體。" },
  { id: "017", nameZh: "凋零核心", nameEn: "Decay Core", rarity: "N", element: "WOOD", emoji: "🥀", basePoints: 160, boostZh: "木屬性傷害 +15%", desc: "高速衰變粒子侵蝕金屬結構。" },
  { id: "018", nameZh: "絕對零度", nameEn: "Absolute Zero", rarity: "R", element: "WATER", emoji: "❄️", basePoints: 380, boostZh: "對水屬性 Boss 傷害 +25%", desc: "使分子運動停滯的超低溫力場。" },
  { id: "019", nameZh: "超新星發射器", nameEn: "Supernova Blaster", rarity: "R", element: "LIGHT", emoji: "💥", basePoints: 500, boostZh: "血量低於 20% 光屬性攻擊 +50%", desc: "死線危機中啟動的聚變爆發組件。" },
  { id: "020", nameZh: "湮滅使者", nameEn: "Annihilation Harbinger", rarity: "SR", element: "FIRE", emoji: "☣️", basePoints: 1250, boostZh: "火屬性傷害 +25%", desc: "以正負電子對湮滅釋放高密度熱能束。" },
  { id: "SSR_4", nameZh: "虛空終結者", nameEn: "Void Terminator", rarity: "SSR", element: "DARK", emoji: "🕳️", basePoints: 3500, boostZh: "對所有 Boss 傷害 +40%", desc: "將黑洞奇點置於核心的反物質武裝。" },
];

const RARITY_STYLE: Record<Rarity, { frame: string; accent: string; badge: string }> = {
  N: { frame: "border-zinc-400", accent: "from-zinc-200 to-zinc-500", badge: "bg-zinc-600 text-white" },
  R: { frame: "border-blue-400", accent: "from-sky-200 to-blue-600", badge: "bg-blue-500 text-white" },
  SR: { frame: "border-purple-400", accent: "from-fuchsia-200 to-purple-600", badge: "bg-purple-500 text-white" },
  SSR: { frame: "border-amber-300", accent: "from-yellow-100 via-amber-300 to-fuchsia-500", badge: "bg-amber-400 text-black" },
};

const ELEMENT_STYLE: Record<ElementType, { label: string; dot: string; text: string }> = {
  FIRE: { label: "火", dot: "bg-red-500", text: "text-red-300" },
  WATER: { label: "水", dot: "bg-blue-500", text: "text-blue-300" },
  WOOD: { label: "木", dot: "bg-emerald-500", text: "text-emerald-300" },
  LIGHT: { label: "光", dot: "bg-yellow-300", text: "text-yellow-200" },
  DARK: { label: "暗", dot: "bg-purple-600", text: "text-purple-300" },
};

type PrintCard = CatalogCard & { serial: string; registerUrl: string };

function buildCards(counts: Record<string, number>, batchCode: string, origin: string): PrintCard[] {
  return CATALOG_CARDS.flatMap((card) => {
    const count = counts[card.id] ?? 0;
    if (count <= 0) return [];
    return Array.from({ length: count }, (_, index) => {
      const serial = `${batchCode}-${card.id}-${String(index + 1).padStart(3, "0")}`;
      return { ...card, serial, registerUrl: `${origin}/register/PRINT-${serial}` };
    });
  });
}

function PrintableRobotCard({ card, qrSrc }: { card: PrintCard; qrSrc?: string }) {
  const rarity = RARITY_STYLE[card.rarity];
  const element = ELEMENT_STYLE[card.element];

  return (
    <div className="cut-slot relative h-[95mm] w-[70mm] break-inside-avoid p-[3.5mm]">
      <span className="crop crop-tl" />
      <span className="crop crop-tr" />
      <span className="crop crop-bl" />
      <span className="crop crop-br" />

      <article className={`print-card relative flex h-[88mm] w-[63mm] flex-col overflow-hidden rounded-[4mm] border-2 ${rarity.frame} bg-slate-950 text-white`}>
        <div className={`h-[3mm] bg-gradient-to-r ${rarity.accent}`} />
        <div className="flex flex-1 flex-col p-[3mm]">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-mono text-[8px] text-slate-400">#{card.id}</p>
              <h2 className="mt-0 text-[16px] font-black leading-tight text-white">{card.nameZh}</h2>
              <p className="truncate text-[8px] uppercase text-slate-400">{card.nameEn}</p>
            </div>
            <span className={`rounded px-2 py-1 text-[10px] font-black ${rarity.badge}`}>{card.rarity}</span>
          </div>

          <div className="my-[3mm] grid flex-1 place-items-center rounded border border-white/10 bg-white/[0.04]">
            <div className="text-[44px] leading-none">{card.emoji}</div>
          </div>

          <div className="mb-[2mm] flex items-center justify-between gap-2 rounded bg-black/20 px-2 py-1">
            <span className="flex items-center gap-1 text-[9px] font-bold">
              <span className={`h-2 w-2 rounded-full ${element.dot}`} />
              <span className={element.text}>{element.label}屬性</span>
            </span>
            <span className="text-[10px] font-black text-amber-300">{card.basePoints.toLocaleString()} PT</span>
          </div>

          <p className="line-clamp-2 min-h-[22px] text-[8px] leading-snug text-slate-300">{card.desc}</p>
          <p className="mt-1 line-clamp-2 min-h-[20px] rounded border border-amber-300/20 bg-amber-300/10 px-1.5 py-1 text-[8px] font-bold leading-snug text-amber-200">
            {card.boostZh}
          </p>

          <div className="mt-auto grid grid-cols-[1fr_auto] items-end gap-2 pt-2">
            <p className="truncate font-mono text-[7px] text-slate-500">{card.serial}</p>
            <div className="rounded bg-white p-1">
              {qrSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qrSrc} alt={`${card.serial} QR`} className="h-[16mm] w-[16mm]" />
              ) : (
                <div className="h-[16mm] w-[16mm] bg-slate-200" />
              )}
            </div>
          </div>
        </div>
      </article>
    </div>
  );
}

const defaultCounts = Object.fromEntries(CATALOG_CARDS.map((card) => [card.id, 1]));

export default function PrintCardsPage() {
  const [batchCode, setBatchCode] = useState("RCU-001");
  const [origin, setOrigin] = useState("https://example.com");
  const [counts, setCounts] = useState<Record<string, number>>(defaultCounts);
  const [qrCodes, setQrCodes] = useState<Record<string, string>>({});

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const cards = useMemo(
    () => buildCards(counts, batchCode.trim() || "RCU", origin),
    [batchCode, counts, origin]
  );

  useEffect(() => {
    let cancelled = false;
    async function generateQrCodes() {
      const entries = await Promise.all(
        cards.map(async (card) => [
          card.serial,
          await QRCode.toDataURL(card.registerUrl, { margin: 1, width: 132 }),
        ])
      );
      if (!cancelled) setQrCodes(Object.fromEntries(entries));
    }

    generateQrCodes();
    return () => {
      cancelled = true;
    };
  }, [cards]);

  return (
    <main className="min-h-dvh bg-slate-950 text-white">
      <style jsx global>{`
        @page {
          size: A4;
          margin: 8mm;
        }

        .crop {
          position: absolute;
          width: 7mm;
          height: 7mm;
          pointer-events: none;
        }

        .crop::before,
        .crop::after {
          content: "";
          position: absolute;
          background: #111827;
        }

        .crop::before {
          width: 7mm;
          height: 0.25mm;
        }

        .crop::after {
          width: 0.25mm;
          height: 7mm;
        }

        .crop-tl { left: 0; top: 0; }
        .crop-tl::before, .crop-tl::after { left: 0; top: 0; }
        .crop-tr { right: 0; top: 0; }
        .crop-tr::before { right: 0; top: 0; }
        .crop-tr::after { right: 0; top: 0; }
        .crop-bl { left: 0; bottom: 0; }
        .crop-bl::before { left: 0; bottom: 0; }
        .crop-bl::after { left: 0; bottom: 0; }
        .crop-br { right: 0; bottom: 0; }
        .crop-br::before { right: 0; bottom: 0; }
        .crop-br::after { right: 0; bottom: 0; }

        @media print {
          html,
          body {
            width: 210mm;
            background: white !important;
          }

          body * {
            visibility: hidden;
          }

          .print-area,
          .print-area * {
            visibility: visible;
          }

          .print-area {
            position: absolute;
            inset: 0;
            padding: 0 !important;
            background: white !important;
          }

          .print-sheet {
            display: grid !important;
            grid-template-columns: repeat(2, 70mm);
            gap: 4mm 10mm;
            justify-content: center;
            align-content: start;
          }

          .print-card {
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }

          .cut-slot {
            page-break-inside: avoid;
          }
        }
      `}</style>

      <section className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4 print:hidden">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase text-amber-300">A4 Card Template</p>
              <h1 className="mt-1 text-2xl font-black text-white">機器人收藏宇宙列印卡片</h1>
              <p className="mt-1 text-sm text-slate-400">
                依照圖鑑角色生成 {cards.length} 張。列印紙張請選 A4，縮放建議 100%。
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setCounts(defaultCounts)}
                className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/10 px-4 py-2 text-sm font-bold text-white hover:bg-white/15"
              >
                <RefreshCw size={16} />
                每款 1 張
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-2 rounded-lg bg-amber-400 px-4 py-2 text-sm font-black text-slate-950 hover:bg-amber-300"
              >
                <Printer size={16} />
                列印 A4 公版
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-[220px_1fr]">
            <label className="field">
              <span>批次代碼</span>
              <input value={batchCode} onChange={(event) => setBatchCode(event.target.value)} />
            </label>

            <div className="grid max-h-64 gap-3 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-4">
              {CATALOG_CARDS.map((card) => (
                <label key={card.id} className="field">
                  <span>
                    {card.id} {card.nameZh} ({card.rarity})
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={99}
                    value={counts[card.id] ?? 0}
                    onChange={(event) =>
                      setCounts((current) => ({
                        ...current,
                        [card.id]: Number.parseInt(event.target.value, 10) || 0,
                      }))
                    }
                  />
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="print-area rounded-lg bg-white p-4">
          <div className="mb-3 text-center text-xs font-bold text-slate-500 print:hidden">
            A4 卡片公版預覽：外框為裁切空間，四角黑線為裁減線。
          </div>
          <div className="print-sheet grid justify-center gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {cards.map((card) => (
              <PrintableRobotCard key={card.serial} card={card} qrSrc={qrCodes[card.serial]} />
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
