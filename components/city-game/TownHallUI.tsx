'use client';
import { useEffect, useState } from 'react';

// ─── Mock News / Bulletin Data ────────────────────────────────────────────────

const ANNOUNCEMENTS = [
  {
    id: 'a1',
    category: '🏛️ 市政公告',
    title: '城市道路拓寬計畫啟動',
    date: '2026-06-21',
    content: '本市將於本月底啟動東區主幹道拓寬工程，預計為期三個月。施工期間請市民配合改道，敬請見諒。工程完工後道路通行能力預計提升 40%，有效緩解尖峰時段交通壅塞問題。',
    tag: 'official',
  },
  {
    id: 'a2',
    category: '🚌 交通資訊',
    title: '計程車派遣系統全面升級',
    date: '2026-06-20',
    content: '本市計程車智慧調度平台完成升級，市民可透過手機即時叫車，預計等候時間縮短至 3 分鐘以內。新系統支援 GPS 即時追蹤，並提供公開費率透明查詢功能。',
    tag: 'transport',
  },
  {
    id: 'a3',
    category: '🌿 環境公告',
    title: '公園綠化美化工程完工',
    date: '2026-06-19',
    content: '城市中央公園美化工程已於本週正式完工，新增綠地面積 3.2 公頃、步行棧道 1.8 公里，並設置無障礙設施。市民可自本週末起入園享受全新的悠閒環境。',
    tag: 'environment',
  },
  {
    id: 'a4',
    category: '⚡ 緊急公告',
    title: '北區電力網路維修通知',
    date: '2026-06-18',
    content: '北區電力設施將於明日 00:00–06:00 進行定期維護，期間部分區域可能出現短暫停電。請市民提前備妥緊急照明設備，不便之處敬請見諒。',
    tag: 'urgent',
  },
  {
    id: 'a5',
    category: '🎉 活動資訊',
    title: '城市文化節暨美食嘉年華',
    date: '2026-06-17',
    content: '一年一度的城市文化節將於本月 28 日至 30 日在市民廣場盛大舉行，涵蓋在地特色美食展、街頭藝術表演、親子互動活動等精彩節目，歡迎全家共同參與！',
    tag: 'event',
  },
  {
    id: 'a6',
    category: '🚁 航空管制',
    title: '城市上空無人機飛行限制更新',
    date: '2026-06-15',
    content: '依最新航空安全法規，城市中心區域（半徑 500m 範圍）禁止高度超過 50m 的無人機飛行。違規者將依法開罰，請合法使用飛行裝置，確保飛行安全。',
    tag: 'notice',
  },
];

const TAG_STYLE: Record<string, string> = {
  official:    'bg-blue-900/70 text-blue-300 border border-blue-700/60',
  transport:   'bg-amber-900/70 text-amber-300 border border-amber-700/60',
  environment: 'bg-green-900/70 text-green-300 border border-green-700/60',
  urgent:      'bg-red-900/70 text-red-300 border border-red-700/60',
  event:       'bg-purple-900/70 text-purple-300 border border-purple-700/60',
  notice:      'bg-slate-700/70 text-slate-300 border border-slate-600/60',
};

const TAG_LABEL: Record<string, string> = {
  official: '官方', transport: '交通', environment: '環境',
  urgent: '緊急', event: '活動', notice: '通知',
};

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function TownHallUI({ open, onClose }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setSelected(null);
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.code === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  if (!open && !mounted) return null;

  const filters = ['all', 'official', 'transport', 'environment', 'urgent', 'event', 'notice'];
  const filtered = filter === 'all'
    ? ANNOUNCEMENTS
    : ANNOUNCEMENTS.filter(a => a.tag === filter);

  const detail = selected ? ANNOUNCEMENTS.find(a => a.id === selected) : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,10,0.72)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="relative w-[820px] max-w-[96vw] max-h-[88vh] flex flex-col"
        style={{
          background: 'linear-gradient(160deg, #0d1a2e 0%, #0a1220 60%, #0d1520 100%)',
          border: '1px solid rgba(96,165,250,0.22)',
          borderRadius: 20,
          boxShadow: '0 0 80px rgba(30,80,200,0.22), 0 8px 60px rgba(0,0,0,0.7)',
        }}
      >
        {/* ── Header ── */}
        <div
          className="flex items-center gap-4 px-7 py-5"
          style={{
            borderBottom: '1px solid rgba(96,165,250,0.15)',
            background: 'linear-gradient(90deg, rgba(30,60,120,0.35) 0%, transparent 100%)',
            borderRadius: '20px 20px 0 0',
          }}
        >
          <div
            className="flex items-center justify-center w-12 h-12 rounded-xl text-2xl"
            style={{ background: 'linear-gradient(135deg, #1e3a8a, #1d4ed8)', boxShadow: '0 0 20px rgba(59,130,246,0.4)' }}
          >
            🏛️
          </div>
          <div>
            <div className="text-lg font-bold text-white tracking-wide">城鎮中心辦事處</div>
            <div className="text-xs text-blue-400/70 mt-0.5">公告欄 · 時事資訊 · 市政消息</div>
          </div>
          <div className="ml-auto text-right">
            <div className="text-[11px] text-white/30 font-mono">AKADE CITY · CITY HALL</div>
            <div className="text-[11px] text-blue-400/50 font-mono mt-0.5">
              {new Date().toLocaleDateString('zh-TW')}
            </div>
          </div>
          <button
            onClick={onClose}
            className="ml-4 w-8 h-8 rounded-full flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all text-xl"
          >
            ×
          </button>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* ── Left: list ── */}
          <div className="w-64 shrink-0 flex flex-col border-r" style={{ borderColor: 'rgba(96,165,250,0.12)' }}>
            {/* Filter tabs */}
            <div className="flex flex-wrap gap-1 px-4 py-3" style={{ borderBottom: '1px solid rgba(96,165,250,0.10)' }}>
              {filters.map(f => (
                <button
                  key={f}
                  onClick={() => { setFilter(f); setSelected(null); }}
                  className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-all ${
                    filter === f
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/60'
                      : 'text-white/40 hover:text-white/70 hover:bg-white/10'
                  }`}
                >
                  {f === 'all' ? '全部' : TAG_LABEL[f]}
                </button>
              ))}
            </div>

            {/* List items */}
            <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5 scrollbar-thin">
              {filtered.map(item => (
                <button
                  key={item.id}
                  onClick={() => setSelected(item.id)}
                  className="w-full text-left rounded-xl p-3 transition-all hover:bg-white/8 group"
                  style={{
                    background: selected === item.id ? 'rgba(37,99,235,0.18)' : undefined,
                    border: selected === item.id ? '1px solid rgba(59,130,246,0.35)' : '1px solid transparent',
                  }}
                >
                  <div className="text-[10px] text-white/40 mb-1">{item.category}</div>
                  <div className="text-xs text-white/80 font-medium leading-snug line-clamp-2 group-hover:text-white transition-colors">
                    {item.title}
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${TAG_STYLE[item.tag]}`}>
                      {TAG_LABEL[item.tag]}
                    </span>
                    <span className="text-[9px] text-white/25 font-mono">{item.date}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* ── Right: detail ── */}
          <div className="flex-1 overflow-y-auto">
            {detail ? (
              <div className="px-8 py-7">
                {/* Tag + date row */}
                <div className="flex items-center gap-3 mb-4">
                  <span className={`text-[10px] px-2.5 py-1 rounded-full font-semibold ${TAG_STYLE[detail.tag]}`}>
                    {TAG_LABEL[detail.tag]}
                  </span>
                  <span className="text-[11px] text-white/35 font-mono">{detail.date}</span>
                  <span className="text-[11px] text-white/20 ml-auto">城鎮中心辦事處</span>
                </div>

                {/* Category */}
                <div className="text-sm text-blue-400/80 mb-2 font-medium">{detail.category}</div>

                {/* Title */}
                <h2 className="text-xl font-bold text-white leading-snug mb-5" style={{ letterSpacing: '-0.01em' }}>
                  {detail.title}
                </h2>

                {/* Divider */}
                <div style={{ height: 1, background: 'linear-gradient(90deg, rgba(96,165,250,0.3), transparent)' }} className="mb-5" />

                {/* Content */}
                <p className="text-sm text-white/70 leading-7 tracking-wide" style={{ textAlign: 'justify' }}>
                  {detail.content}
                </p>

                {/* Footer stamp */}
                <div
                  className="mt-8 px-4 py-3 rounded-xl text-[11px] text-white/30 flex items-center gap-2"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
                >
                  <span>🏛️</span>
                  <span>此公告由城鎮中心辦事處正式發布，具有法律效力。如有疑問請洽詢市政服務窗口。</span>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-5 text-white/20">
                <div className="text-6xl opacity-30">📋</div>
                <div className="text-center">
                  <div className="text-sm font-medium text-white/30">請選擇左側公告項目</div>
                  <div className="text-xs text-white/20 mt-1">點擊公告即可查看詳細內容</div>
                </div>
                {/* Quick stats */}
                <div className="flex gap-4 mt-4">
                  {[
                    { label: '今日公告', value: '6' },
                    { label: '緊急通知', value: '1' },
                    { label: '活動資訊', value: '1' },
                  ].map(stat => (
                    <div
                      key={stat.label}
                      className="flex flex-col items-center px-5 py-3 rounded-xl"
                      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
                    >
                      <div className="text-xl font-bold text-blue-400">{stat.value}</div>
                      <div className="text-[10px] text-white/30 mt-0.5">{stat.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Footer hint ── */}
        <div
          className="flex items-center justify-between px-7 py-3 text-[11px] text-white/20"
          style={{ borderTop: '1px solid rgba(96,165,250,0.10)', borderRadius: '0 0 20px 20px' }}
        >
          <span>按 <kbd className="bg-white/10 text-white/40 px-1.5 py-0.5 rounded text-[10px]">Esc</kbd> 或點擊外部關閉</span>
          <span className="font-mono">AKADE CITY · 市政資訊系統 v2.1</span>
        </div>
      </div>
    </div>
  );
}
