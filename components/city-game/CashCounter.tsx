'use client';
import { HUDData } from './types';

interface Props {
  cash: number;
  ticker: HUDData['cashTicker'];
  isMobile?: boolean;
}

/**
 * Cash total with GTA-style floating +$ / -$ figures.
 *
 * The HUD DTO is replaced ~10 times a second, so each figure is keyed by a
 * stable transaction id; otherwise React would restart the CSS animation on
 * every update and nothing would ever fade out.
 */
export default function CashCounter({ cash, ticker, isMobile = false }: Props) {
  return (
    <div className="relative flex flex-col items-end pointer-events-none select-none">
      <div
        className="font-mono font-bold"
        style={{
          fontSize: isMobile ? 20 : 26,
          color: '#ffffff',
          textShadow: '0 2px 4px rgba(0,0,0,0.85)',
          letterSpacing: '0.02em',
          lineHeight: 1,
        }}
      >
        ${cash.toLocaleString('en-US')}
      </div>

      {/* Figures stack upward from just under the total. */}
      <div className="absolute right-0" style={{ top: isMobile ? 22 : 28 }}>
        {ticker.map(t => (
          <div
            key={t.id}
            className="font-mono font-bold text-right"
            style={{
              fontSize: isMobile ? 13 : 15,
              color: t.amount >= 0 ? '#4ade80' : '#f87171',
              textShadow: '0 2px 4px rgba(0,0,0,0.85)',
              animation: 'cashTick 1.8s ease-out forwards',
              whiteSpace: 'nowrap',
            }}
          >
            {t.amount >= 0 ? '+' : '−'}${Math.abs(t.amount).toLocaleString('en-US')}
          </div>
        ))}
      </div>
    </div>
  );
}
