'use client';
import { RaceSession } from './types';
import { ALL_COURSES } from './raceCourses';
import { getRaceBest } from './save';
import { formatRaceTime } from './race';

interface Props {
  open: boolean;
  onClose: () => void;
  onStartRace: (courseId: string) => void;
  raceSession?: RaceSession | null;
  isMobile?: boolean;
}

const DIFF_STARS: Record<string, string> = {
  easy:   '★☆☆',
  medium: '★★☆',
  hard:   '★★★',
};

const DIFF_COLOR: Record<string, string> = {
  easy:   '#4ade80',
  medium: '#facc15',
  hard:   '#f87171',
};

export default function ChallengesPanel({ open, onClose, onStartRace, raceSession, isMobile = false }: Props) {
  if (!open) return null;
  if (raceSession && raceSession.phase !== 'idle') return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.45)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        padding: isMobile ? '12px' : '24px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'rgba(7,11,19,0.96)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 20,
          padding: isMobile ? '16px' : '24px',
          width: isMobile ? '100%' : 380,
          maxWidth: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          fontFamily: 'monospace',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', letterSpacing: '0.03em' }}>
              🏁 挑戰關卡
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              FPV 穿越機競速
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 8,
              color: 'rgba(255,255,255,0.5)',
              fontSize: 16,
              width: 32,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            ×
          </button>
        </div>

        {/* Course cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {ALL_COURSES.map((course) => {
            // Best laps live in the unified save; legacy keys are migrated on load.
            const bestMs  = getRaceBest(course.id);
            const parMs   = course.parTime;
            const beaten  = bestMs !== null && bestMs < parMs;

            return (
              <div
                key={course.id}
                style={{
                  background: course.color + '12',
                  border: `1px solid ${course.color}40`,
                  borderRadius: 14,
                  padding: '14px 16px',
                }}
              >
                {/* Course title row */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: course.color, marginBottom: 2 }}>
                      {course.name}
                    </div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {course.description}
                    </div>
                  </div>
                  <div style={{ marginLeft: 12, textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 13, color: DIFF_COLOR[course.difficulty] ?? '#fff' }}>
                      {DIFF_STARS[course.difficulty] ?? '☆☆☆'}
                    </div>
                    <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', marginTop: 1 }}>
                      {course.difficulty}
                    </div>
                  </div>
                </div>

                {/* Meta row */}
                <div style={{ display: 'flex', gap: 12, marginBottom: 10, fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>
                  <span>{course.gates.length} 閘門</span>
                  <span>{course.totalLaps} 圈</span>
                  <span>標準 {formatRaceTime(parMs)}</span>
                </div>

                {/* Best time row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: 10 }}>
                    <span style={{ color: 'rgba(255,255,255,0.3)' }}>最佳紀錄　</span>
                    {bestMs !== null ? (
                      <span style={{ color: beaten ? '#4ade80' : '#facc15', fontWeight: 700 }}>
                        {formatRaceTime(bestMs)}{beaten ? ' ✓' : ''}
                      </span>
                    ) : (
                      <span style={{ color: 'rgba(255,255,255,0.2)' }}>--:--.---</span>
                    )}
                  </div>

                  <button
                    onClick={() => { onStartRace(course.id); onClose(); }}
                    style={{
                      background: course.color + '22',
                      border: `1px solid ${course.color}60`,
                      borderRadius: 8,
                      color: course.color,
                      fontSize: 11,
                      fontFamily: 'monospace',
                      fontWeight: 700,
                      padding: isMobile ? '10px 16px' : '6px 14px',
                      cursor: 'pointer',
                      letterSpacing: '0.03em',
                      minHeight: isMobile ? 44 : undefined,
                    }}
                  >
                    開始挑戰 →
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer hint */}
        <div style={{ marginTop: 16, fontSize: 9, color: 'rgba(255,255,255,0.2)', textAlign: 'center' }}>
          無人機會自動升空並定位到起點
        </div>
      </div>
    </div>
  );
}
