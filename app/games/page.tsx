import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: '遊戲大廳 | 機器人收藏宇宙',
  description: '探索機器人收藏宇宙的所有遊戲',
};

const GAMES = [
  {
    slug: 'combo-arena',
    name: '消除符石對抗賽',
    description: '拖拉六色符石消除連擊，累積戰力點數',
    tag: '解謎',
    tagColor: 'text-cyan-400 bg-cyan-400/10',
    icon: '🔮',
  },
  {
    slug: 'tiao-dou-ji',
    name: '3D 物理跳豆機',
    description: '物理模擬彈跳機台，體驗真實重力',
    tag: '物理',
    tagColor: 'text-green-400 bg-green-400/10',
    icon: '🫘',
  },
  {
    slug: 'city-game',
    name: '3D 模擬城市',
    description: '在 3D 城市中自由探索，支援 FPV 無人機賽道',
    tag: '探索',
    tagColor: 'text-blue-400 bg-blue-400/10',
    icon: '🏙️',
  },
  {
    slug: 'da-nu-shen',
    name: '3D 骰子大女神',
    description: '3D 物理骰子搖動，祈求幸運數字',
    tag: '機率',
    tagColor: 'text-purple-400 bg-purple-400/10',
    icon: '🎲',
  },
  {
    slug: 'jiu-gong-ge',
    name: '3D 投擲九宮格',
    description: '投擲符石到三維九宮格中，挑戰精準度',
    tag: '投擲',
    tagColor: 'text-orange-400 bg-orange-400/10',
    icon: '🎯',
  },
  {
    slug: 'scratch-card',
    name: '刮刮樂幸運發財券',
    description: '刮開刮刮樂，獲得隱藏獎勵',
    tag: '刮卡',
    tagColor: 'text-yellow-400 bg-yellow-400/10',
    icon: '🎟️',
  },
  {
    slug: 'minecraft',
    name: '方塊世界',
    description: '網頁版體素引擎，程序生成無限地形',
    tag: '沙盒',
    tagColor: 'text-lime-400 bg-lime-400/10',
    icon: '⛏️',
  },
  {
    slug: 'ship-tracker',
    name: '船隻追蹤',
    description: '即時船隻位置追蹤可視化',
    tag: '追蹤',
    tagColor: 'text-sky-400 bg-sky-400/10',
    icon: '🚢',
  },
  {
    slug: 'temple-of-desert-god',
    name: '沙漠神殿',
    description: '轉動拉霸機，挑戰神殿守護者',
    tag: '機率',
    tagColor: 'text-amber-400 bg-amber-400/10',
    icon: '🏛️',
  },
];

export default function GamesPage() {
  return (
    <main className="min-h-dvh bg-slate-950 text-white">
      <div className="mx-auto max-w-5xl px-4 py-12">
        <div className="mb-10">
          <h1 className="text-3xl font-bold tracking-tight">遊戲大廳</h1>
          <p className="mt-2 text-sm text-white/50">選擇遊戲開始挑戰，累積戰力點數</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {GAMES.map((game) => (
            <Link
              key={game.slug}
              href={`/games/${game.slug}`}
              className="group relative flex flex-col gap-3 rounded-xl border border-white/10 bg-white/5 p-5 transition-all hover:border-amber-400/40 hover:bg-white/8"
            >
              <div className="flex items-start justify-between">
                <span className="text-3xl">{game.icon}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${game.tagColor}`}>
                  {game.tag}
                </span>
              </div>
              <div>
                <h2 className="font-semibold leading-snug text-white group-hover:text-amber-300 transition-colors">
                  {game.name}
                </h2>
                <p className="mt-1 text-xs text-white/50 leading-relaxed">{game.description}</p>
              </div>
              <div className="mt-auto pt-2">
                <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-400">
                  開始遊戲
                  <svg className="h-3 w-3 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                </span>
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-12 text-center">
          <Link
            href="/"
            className="text-sm text-white/40 hover:text-white/70 transition-colors"
          >
            ← 回到首頁
          </Link>
        </div>
      </div>
    </main>
  );
}
