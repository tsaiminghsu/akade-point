'use client';
import { Banner, MissionHUDLike } from './types';
import type { TouchLayout } from './touchLayout';

interface MissionPanelProps {
  mission: MissionHUDLike;
  isMobile?: boolean;
  /** Touch screens: shares the top-left column with the HUD (see touchLayout). */
  touch?: TouchLayout | null;
  onCancel?: () => void;
}

/** Top-left objective panel shown while a job is running. */
export function MissionPanel({ mission, isMobile = false, touch = null, onCancel }: MissionPanelProps) {
  if (mission.phase === 'briefing') return null;

  const urgent = mission.timeLeft !== null && mission.timeLeft <= 10;
  const done = mission.phase === 'success' || mission.phase === 'failed';

  return (
    <div
      className="absolute pointer-events-none"
      style={{
        top: touch ? 'calc(10px + env(safe-area-inset-top, 0px))' : '12px',
        left: touch ? `calc(${touch.hudLeft}px + env(safe-area-inset-left, 0px))` : '12px',
        maxWidth: touch ? touch.missionMaxWidth : 320,
      }}
    >
      <div
        className="rounded-lg font-mono"
        style={{
          background: 'rgba(0,0,0,0.62)',
          border: `1px solid ${mission.color}55`,
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          padding: isMobile ? '6px 10px' : '8px 12px',
        }}
      >
        <div className="flex items-center gap-2" style={{ color: mission.color, fontSize: isMobile ? 12 : 13 }}>
          <span>{mission.icon}</span>
          <span className="font-bold">{mission.title}</span>
        </div>

        {done ? (
          <div
            style={{
              color: mission.phase === 'success' ? '#4ade80' : '#f87171',
              fontSize: isMobile ? 12 : 13,
              marginTop: 4,
            }}
          >
            {mission.resultText}
          </div>
        ) : (
          <>
            <div
              style={{ color: '#ffd23f', fontSize: isMobile ? 12 : 13, marginTop: 4 }}
            >
              {mission.objectiveText}
            </div>

            <div
              className="flex items-center gap-3"
              style={{ marginTop: 4, fontSize: isMobile ? 10 : 11, color: 'rgba(255,255,255,0.6)' }}
            >
              <span>{mission.progressText}</span>
              {mission.timeText && (
                <span style={{ color: urgent ? '#f87171' : 'rgba(255,255,255,0.75)', fontWeight: 700 }}>
                  ⏱ {mission.timeText}
                </span>
              )}
              {mission.earned > 0 && <span style={{ color: '#4ade80' }}>已賺 ${mission.earned}</span>}
            </div>

            {mission.cancelArmed ? (
              // Still a button: on a touch screen there is no second X press,
              // so the confirmation has to be tappable.
              onCancel ? (
                <button
                  onClick={onCancel}
                  className="pointer-events-auto"
                  style={{
                    marginTop: 6,
                    fontSize: 11,
                    color: '#fbbf24',
                    border: '1px solid rgba(251,191,36,0.6)',
                    borderRadius: 6,
                    padding: isMobile ? '6px 12px' : '2px 8px',
                    background: 'rgba(120,53,15,0.45)',
                    cursor: 'pointer',
                  }}
                >
                  {isMobile ? '確認放棄？再點一次' : '確認放棄？再按一次 X 或點此'}
                </button>
              ) : (
                <div style={{ marginTop: 4, fontSize: 10, color: '#fbbf24' }}>
                  再按一次 X 放棄任務
                </div>
              )
            ) : (
              onCancel && (
                <button
                  onClick={onCancel}
                  className="pointer-events-auto"
                  style={{
                    marginTop: 6,
                    fontSize: 11,
                    color: 'rgba(255,255,255,0.55)',
                    border: '1px solid rgba(255,255,255,0.18)',
                    borderRadius: 6,
                    padding: isMobile ? '6px 12px' : '2px 8px',
                    background: 'rgba(0,0,0,0.3)',
                    cursor: 'pointer',
                  }}
                >
                  ✕ 放棄{!isMobile && ' (X)'}
                </button>
              )
            )}
          </>
        )}
      </div>
    </div>
  );
}

interface BriefProps {
  mission: MissionHUDLike;
  isMobile?: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

/** Modal shown when the player drives into a mission marker. */
export function MissionBriefModal({ mission, isMobile = false, onAccept, onDecline }: BriefProps) {
  if (mission.phase !== 'briefing') return null;

  const panel = (
    <div
      className="font-mono"
      style={{
        background: 'rgba(10,12,20,0.94)',
        border: `1px solid ${mission.color}66`,
        boxShadow: `0 0 32px ${mission.color}33`,
        borderRadius: isMobile ? '16px 16px 0 0' : 16,
        padding: isMobile ? '18px 20px 26px' : '22px 26px',
        width: isMobile ? '100%' : 420,
        maxWidth: '100%',
      }}
    >
      <div className="flex items-center gap-3" style={{ color: mission.color }}>
        <span style={{ fontSize: 30 }}>{mission.icon}</span>
        <div>
          <div className="font-bold" style={{ fontSize: 18 }}>{mission.title}</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
            獎金 ${mission.reward}
            {mission.timeText && ` · 限時 ${mission.timeText}`}
          </div>
        </div>
      </div>

      <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, margin: '14px 0 18px', lineHeight: 1.6 }}>
        {mission.description}
      </p>

      <div className="flex gap-10" style={{ gap: 10 }}>
        <button
          onClick={onAccept}
          className="flex-1"
          style={{
            background: mission.color,
            color: '#0a0c14',
            fontWeight: 700,
            borderRadius: 10,
            padding: isMobile ? '14px 0' : '10px 0',
            fontSize: 14,
            cursor: 'pointer',
          }}
        >
          接受{!isMobile && ' (E)'}
        </button>
        <button
          onClick={onDecline}
          className="flex-1"
          style={{
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.18)',
            color: 'rgba(255,255,255,0.75)',
            borderRadius: 10,
            padding: isMobile ? '14px 0' : '10px 0',
            fontSize: 14,
            cursor: 'pointer',
          }}
        >
          拒絕{!isMobile && ' (X)'}
        </button>
      </div>
    </div>
  );

  return (
    <div
      className="absolute inset-0 flex pointer-events-auto"
      style={{
        zIndex: 55,
        background: 'rgba(0,0,0,0.45)',
        alignItems: isMobile ? 'flex-end' : 'center',
        justifyContent: 'center',
      }}
    >
      {panel}
    </div>
  );
}

interface BannerProps {
  banner: Banner;
  isMobile?: boolean;
}

/** Centre-screen announcement for mission start / success / failure. */
export function CenterBanner({ banner, isMobile = false }: BannerProps) {
  return (
    <div
      className="absolute left-1/2 pointer-events-none select-none text-center"
      style={{
        top: isMobile ? '30%' : '32%',
        transform: 'translateX(-50%)',
        animation: 'bannerPop 0.35s ease-out',
        zIndex: 50,
      }}
    >
      <div
        className="font-mono font-bold"
        style={{
          color: banner.color,
          fontSize: isMobile ? 26 : 38,
          letterSpacing: '0.06em',
          textShadow: '0 3px 12px rgba(0,0,0,0.9)',
        }}
      >
        {banner.text}
      </div>
      {banner.sub && (
        <div
          className="font-mono"
          style={{
            color: 'rgba(255,255,255,0.8)',
            fontSize: isMobile ? 13 : 16,
            marginTop: 6,
            textShadow: '0 2px 8px rgba(0,0,0,0.9)',
          }}
        >
          {banner.sub}
        </div>
      )}
    </div>
  );
}
