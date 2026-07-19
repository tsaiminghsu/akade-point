'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'

const ScratchCard = dynamic(
  () => import('@/components/dice-game/ScratchCard'),
  { ssr: false }
)

const ScratchCardGenerator = dynamic(
  () => import('@/components/scratch-card/ScratchCardGenerator'),
  { ssr: false }
)

type Tab = 'game' | 'generator'

const TABS: { id: Tab; label: string }[] = [
  { id: 'game',      label: '🎮 刮刮卡遊戲' },
  { id: 'generator', label: '🖨️ 刮刮卡產生器' },
]

export default function ScratchCardPage() {
  const [activeTab, setActiveTab] = useState<Tab>('game')
  const [credits, setCredits] = useState(10_000)

  return (
    <div className="fixed inset-0 bg-[#0a0a1a] flex flex-col">
      {/* Tab bar */}
      <div className="flex gap-1 p-2 shrink-0 bg-white/5 border-b border-white/10">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={[
              'px-4 py-1.5 rounded-lg text-sm font-bold transition-all',
              activeTab === tab.id
                ? 'bg-amber-500 text-black'
                : 'text-white/50 hover:text-white',
            ].join(' ')}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content — ScratchCard uses absolute inset-0 internally */}
      <div className="flex-1 relative overflow-hidden">
        {activeTab === 'game' && (
          <ScratchCard credits={credits} onCreditsChange={setCredits} />
        )}
        {activeTab === 'generator' && (
          <div className="absolute inset-0 overflow-y-auto">
            <ScratchCardGenerator />
          </div>
        )}
      </div>
    </div>
  )
}
