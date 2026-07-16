'use client';

import { motion } from 'framer-motion';

interface LoadingScreenProps {
  progress: number;  // 0–100
  error?: string;
}

export default function LoadingScreen({ progress, error }: LoadingScreenProps) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0D0818] z-50">
      {/* Animated pyramid */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="mb-8"
      >
        <svg width="120" height="100" viewBox="0 0 120 100">
          <defs>
            <linearGradient id="pyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FFD700" />
              <stop offset="100%" stopColor="#B8860B" />
            </linearGradient>
          </defs>
          <motion.polygon
            points="60,5 110,95 10,95"
            fill="url(#pyGrad)"
            stroke="#FFD700"
            strokeWidth="1.5"
            animate={{ opacity: [0.6, 1, 0.6] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
          <polygon points="60,5 85,50 35,50" fill="#FFD700" opacity="0.3" />
          <line x1="60" y1="5" x2="60" y2="95" stroke="#FFD700" strokeWidth="0.5" opacity="0.4" />
        </svg>
      </motion.div>

      <motion.h1
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3, duration: 0.8 }}
        className="text-3xl font-bold text-yellow-400 mb-2 tracking-widest"
        style={{ fontFamily: 'serif' }}
      >
        TEMPLE OF THE
      </motion.h1>
      <motion.h1
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5, duration: 0.8 }}
        className="text-4xl font-bold text-yellow-300 mb-10 tracking-widest"
        style={{ fontFamily: 'serif' }}
      >
        DESERT GOD
      </motion.h1>

      {error ? (
        <div className="text-red-400 text-sm px-6 text-center">{error}</div>
      ) : (
        <>
          <div className="w-64 h-3 bg-[#1A0A00] rounded-full border border-yellow-800 overflow-hidden mb-3">
            <motion.div
              className="h-full bg-gradient-to-r from-yellow-600 to-yellow-300 rounded-full"
              style={{ width: `${progress}%` }}
              transition={{ duration: 0.2 }}
            />
          </div>
          <p className="text-yellow-600 text-sm tracking-widest">
            {progress < 100 ? 'LOADING...' : 'ENTERING THE TEMPLE...'}
          </p>
        </>
      )}
    </div>
  );
}
