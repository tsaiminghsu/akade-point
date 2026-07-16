'use client';

import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSlotStore } from '@/store/useSlotStore';
import { WIN_TIERS } from '@/lib/temple-of-desert-god/constants';

export default function WinCelebration() {
  const { phase, displayWin, totalBet, bonusState, dismissBigWin } = useSlotStore();
  const isVisible = phase === 'BIG_WIN';
  const dismissTimer = useRef<ReturnType<typeof setTimeout>>();

  // Determine win tier
  const ratio = totalBet > 0 ? displayWin / totalBet : 0;
  let winTier = WIN_TIERS[0];
  for (const t of WIN_TIERS) {
    if (ratio >= t.multiplier) winTier = t;
  }

  useEffect(() => {
    if (isVisible) {
      dismissTimer.current = setTimeout(dismissBigWin, 6000);
    }
    return () => { if (dismissTimer.current) clearTimeout(dismissTimer.current); };
  }, [isVisible, dismissBigWin]);

  const confettiColors = ['#FFD700', '#FF6B35', '#FF0080', '#00FFFF', '#FFD700'];

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          key="bigwin"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-40 flex flex-col items-center justify-center cursor-pointer"
          style={{ background: 'radial-gradient(ellipse at center, rgba(255,140,0,0.25) 0%, rgba(0,0,0,0.75) 100%)' }}
          onClick={dismissBigWin}
        >
          {/* Confetti */}
          {confettiColors.map((color, i) => (
            Array.from({ length: 8 }).map((_, j) => (
              <motion.div
                key={`conf-${i}-${j}`}
                className="absolute w-2 h-3 rounded-sm"
                style={{ background: color, left: `${10 + j * 12}%` }}
                initial={{ y: -20, x: 0, rotate: 0, opacity: 1 }}
                animate={{
                  y: '110vh',
                  x: [(j % 2 === 0 ? 30 : -30) * (1 + i * 0.3)],
                  rotate: [0, 360 * (j % 2 === 0 ? 1 : -1)],
                  opacity: [1, 1, 0],
                }}
                transition={{
                  duration: 2.5 + i * 0.3,
                  delay: j * 0.12 + i * 0.08,
                  ease: 'easeIn',
                }}
              />
            ))
          ))}

          {/* Win tier label */}
          <motion.div
            initial={{ scale: 0, rotate: -10 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 15, delay: 0.1 }}
            className="relative z-10 text-center"
          >
            <motion.h1
              animate={{ scale: [1, 1.04, 1] }}
              transition={{ duration: 1, repeat: Infinity }}
              className="text-6xl font-black tracking-widest"
              style={{
                fontFamily: 'serif',
                color: winTier.color,
                textShadow: `0 0 40px ${winTier.color}, 0 0 80px ${winTier.color}88, 0 4px 8px rgba(0,0,0,0.8)`,
              }}
            >
              {winTier.label}
            </motion.h1>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.5 }}
              className="mt-4"
            >
              <AnimatedCounter target={bonusState.active ? bonusState.totalBonusWin : displayWin} />
            </motion.div>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.7 }}
              transition={{ delay: 1 }}
              className="text-white text-sm mt-6"
            >
              Tap to continue
            </motion.p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function AnimatedCounter({ target }: { target: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let start = 0;
    const duration = 2000;
    const startTime = Date.now();

    const tick = () => {
      const elapsed = Date.now() - startTime;
      const t = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      start = eased * target;
      if (ref.current) {
        ref.current.textContent = start.toLocaleString('en', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
      }
      if (t < 1) requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  }, [target]);

  return (
    <div
      ref={ref}
      className="text-4xl font-bold font-mono text-yellow-300"
      style={{ textShadow: '0 0 20px rgba(255,215,0,0.8)' }}
    >
      0.00
    </div>
  );
}
