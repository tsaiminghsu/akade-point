'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import dynamic from 'next/dynamic'
import { SCRATCH_CARD_FLOATING_ROUTES, FLOATING_PANEL_INIT_CREDITS } from '@/lib/scratch-card/floatingPanelConfig'
import { useScratchCardStore } from '@/store/useScratchCardStore'

const ScratchCard = dynamic(() => import('@/components/dice-game/ScratchCard'), { ssr: false })

export default function ScratchCardFloatingPanel() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [credits, setCredits] = useState(FLOATING_PANEL_INIT_CREDITS)
  const snapshot = useScratchCardStore(s => s.snapshot)
  const targetRTP = useScratchCardStore(s => s.engineConfig.targetRTP)

  if (!pathname || !SCRATCH_CARD_FLOATING_ROUTES.includes(pathname)) return null

  const currentRTP = snapshot?.currentRTP ?? 0
  const rtpOk = snapshot !== null && currentRTP >= targetRTP - 0.03

  return (
    <>
      {/* Floating trigger button */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full
                   bg-gradient-to-br from-amber-500 to-orange-600
                   shadow-xl shadow-amber-500/30 flex items-center justify-center
                   hover:scale-110 active:scale-95 transition-transform"
        title="刮刮卡遊戲"
      >
        <span className="text-2xl">🎴</span>
        {/* RTP indicator dot */}
        <span
          className={[
            'absolute top-1 right-1 w-2.5 h-2.5 rounded-full border border-black/20',
            snapshot !== null
              ? rtpOk ? 'bg-emerald-400' : 'bg-amber-300'
              : 'bg-white/40',
          ].join(' ')}
        />
      </button>

      {/* Panel overlay */}
      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          {/* Panel */}
          <div
            className="relative w-full max-w-md h-[90vh] bg-[#0a0a1a] rounded-2xl
                       overflow-hidden border border-white/10 shadow-2xl shadow-black/50"
          >
            {/* Close button */}
            <button
              onClick={() => setOpen(false)}
              className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full
                         bg-white/10 hover:bg-white/20 text-white/70 text-sm
                         flex items-center justify-center transition-colors"
              title="關閉"
            >
              ✕
            </button>
            {/* ScratchCard uses absolute inset-0 internally, needs a relative parent */}
            <div className="relative w-full h-full">
              <ScratchCard credits={credits} onCreditsChange={setCredits} />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
