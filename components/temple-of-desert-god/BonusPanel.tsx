'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useSlotStore } from '@/store/useSlotStore';
import { GOD_POWERS } from '@/lib/temple-of-desert-god/constants';

export default function BonusPanel() {
  const { phase, bonusState, currentEvaluation } = useSlotStore();

  const showFreeSpinTrigger = phase === 'FREE_SPIN_TRIGGER';
  const showGodPowerReveal = phase === 'GOD_POWER_REVEAL';
  const showFreeSpinComplete = phase === 'FREE_SPIN_COMPLETE';

  const activePower = GOD_POWERS.find(g => g.type === bonusState.godPower);
  const scatterCount = currentEvaluation?.scatterCount ?? 4;
  const spinCount = currentEvaluation?.freeSpinCount ?? bonusState.totalFreeSpins;

  return (
    <AnimatePresence>
      {/* Free spin trigger announcement */}
      {showFreeSpinTrigger && (
        <motion.div
          key="trigger"
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.2 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none"
        >
          <div className="text-center">
            <motion.div
              animate={{ y: [-10, 10, -10] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="text-7xl mb-4"
            >
              🏛️
            </motion.div>
            <motion.h2
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 0.8, repeat: Infinity }}
              className="text-5xl font-bold text-yellow-300 tracking-widest"
              style={{ fontFamily: 'serif', textShadow: '0 0 30px #FFD700' }}
            >
              {scatterCount} SCATTERS!
            </motion.h2>
            <p className="text-3xl text-yellow-400 mt-2 font-bold">
              {spinCount} FREE SPINS AWARDED
            </p>
          </div>
        </motion.div>
      )}

      {/* God Power reveal */}
      {showGodPowerReveal && activePower && (
        <motion.div
          key="godpower"
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -50 }}
          transition={{ duration: 0.5 }}
          className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none"
        >
          <div className="bg-black/85 border-2 border-yellow-400 rounded-2xl px-12 py-8 text-center max-w-md">
            <p className="text-yellow-500 text-sm tracking-widest mb-3">GOD POWER ACTIVATED</p>
            <div className="text-6xl mb-4">{activePower.icon}</div>
            <h3 className="text-3xl font-bold text-yellow-300 mb-2" style={{ fontFamily: 'serif' }}>
              {activePower.label}
            </h3>
            <p className="text-yellow-400 text-base">{activePower.description}</p>
          </div>
        </motion.div>
      )}

      {/* Free spin complete summary */}
      {showFreeSpinComplete && (
        <motion.div
          key="complete"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none"
        >
          <div className="bg-black/85 border-2 border-yellow-400 rounded-2xl px-12 py-10 text-center">
            <p className="text-yellow-500 text-sm tracking-widest mb-2">FREE SPINS COMPLETE</p>
            <p className="text-yellow-300 text-lg mb-2">
              {bonusState.spinsUsed} spins played
            </p>
            <div className="text-5xl font-bold text-yellow-300 font-mono">
              +{bonusState.totalBonusWin.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="text-yellow-400 mt-2">BONUS WIN</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
