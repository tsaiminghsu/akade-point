'use client';

import { useSlotStore } from '@/store/useSlotStore';
import { motion, AnimatePresence } from 'framer-motion';
import { soundEngine } from '@/lib/temple-of-desert-god/SoundEngine';

export default function GameHUD() {
  const {
    balance, totalBet, betLevelIndex, displayWin,
    phase, bonusState, config,
    setBetLevel, startSpin,
  } = useSlotStore();

  const isSpinning = phase !== 'IDLE' && phase !== 'FREE_SPIN_IDLE' && phase !== 'ERROR';
  const isFreeGame = bonusState.active;
  const canSpin = !isSpinning && config !== null && (isFreeGame || balance >= totalBet);

  const handleSpin = () => {
    soundEngine.init();
    startSpin();
  };

  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-4 select-none">
      {/* Top bar */}
      <div className="flex justify-between items-center pointer-events-none">
        <div className="bg-black/60 border border-yellow-800 rounded-lg px-4 py-2">
          <p className="text-yellow-500 text-xs tracking-widest mb-0.5">BALANCE</p>
          <p className="text-yellow-300 text-xl font-bold font-mono">
            {balance.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>

        {/* Free spin counter */}
        <AnimatePresence>
          {isFreeGame && (
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              className="bg-yellow-900/80 border-2 border-yellow-400 rounded-xl px-6 py-2 text-center"
            >
              <p className="text-yellow-300 text-xs tracking-widest">FREE SPINS</p>
              <p className="text-yellow-100 text-3xl font-bold">{bonusState.remainingFreeSpins}</p>
              {bonusState.godPower && (
                <p className="text-yellow-400 text-xs">{bonusState.godPower.replace('_', ' ')}</p>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="bg-black/60 border border-yellow-800 rounded-lg px-4 py-2 text-right">
          <p className="text-yellow-500 text-xs tracking-widest mb-0.5">WIN</p>
          <motion.p
            key={Math.round(displayWin)}
            className="text-yellow-300 text-xl font-bold font-mono"
          >
            {displayWin > 0
              ? displayWin.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
              : '—'}
          </motion.p>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="flex items-center justify-between gap-4 pointer-events-auto">
        {/* Bet controls */}
        <div className="flex items-center gap-2 bg-black/60 border border-yellow-800 rounded-xl px-4 py-3">
          <button
            onClick={() => setBetLevel(betLevelIndex - 1)}
            disabled={isSpinning || betLevelIndex <= 0}
            className="w-8 h-8 rounded-full bg-yellow-800 hover:bg-yellow-700 disabled:opacity-30 text-yellow-200 font-bold text-lg flex items-center justify-center transition"
          >
            −
          </button>
          <div className="text-center min-w-[80px]">
            <p className="text-yellow-500 text-xs tracking-widest">TOTAL BET</p>
            <p className="text-yellow-200 font-bold font-mono">{totalBet}</p>
          </div>
          <button
            onClick={() => setBetLevel(betLevelIndex + 1)}
            disabled={isSpinning || !config || betLevelIndex >= config.betLevels.length - 1}
            className="w-8 h-8 rounded-full bg-yellow-800 hover:bg-yellow-700 disabled:opacity-30 text-yellow-200 font-bold text-lg flex items-center justify-center transition"
          >
            +
          </button>
        </div>

        {/* Spin button */}
        <motion.button
          onClick={handleSpin}
          disabled={!canSpin}
          whileTap={{ scale: 0.92 }}
          whileHover={canSpin ? { scale: 1.05 } : {}}
          className={`
            w-24 h-24 rounded-full border-4 font-bold text-base tracking-widest
            transition-all shadow-xl flex flex-col items-center justify-center
            ${canSpin
              ? 'bg-gradient-to-b from-yellow-500 to-yellow-700 border-yellow-300 text-yellow-950 hover:from-yellow-400 cursor-pointer shadow-yellow-600/40'
              : 'bg-gray-800 border-gray-600 text-gray-500 cursor-not-allowed'
            }
          `}
          style={{ boxShadow: canSpin ? '0 0 30px rgba(255,215,0,0.4), 0 4px 12px rgba(0,0,0,0.5)' : undefined }}
        >
          {isFreeGame ? (
            <>
              <span className="text-xs">FREE</span>
              <span className="text-lg">SPIN</span>
            </>
          ) : (
            <>
              {isSpinning ? (
                <motion.span
                  animate={{ rotate: 360 }}
                  transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
                  className="text-2xl"
                >
                  ◎
                </motion.span>
              ) : (
                <span className="text-xl">SPIN</span>
              )}
            </>
          )}
        </motion.button>

        {/* Phase / info panel */}
        <div className="bg-black/60 border border-yellow-800 rounded-xl px-4 py-3 min-w-[120px]">
          <p className="text-yellow-500 text-xs tracking-widest mb-0.5">40 LINES</p>
          {isFreeGame ? (
            <p className="text-orange-400 text-xs font-bold">FREE GAME</p>
          ) : (
            <p className="text-yellow-300 text-xs">BET/LINE: {(totalBet / 40).toFixed(2)}</p>
          )}
          {bonusState.totalBonusWin > 0 && isFreeGame && (
            <p className="text-yellow-400 text-xs mt-1">Bonus: {bonusState.totalBonusWin.toFixed(2)}</p>
          )}
        </div>
      </div>
    </div>
  );
}
