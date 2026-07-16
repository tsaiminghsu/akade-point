'use client';
import type { RaceCourse, RaceSession } from './types';
import { formatRaceTime, formatDelta, getRaceStars } from './race';

interface Props {
  session: RaceSession | null;
  course: RaceCourse | null;
  onRetry: () => void;
  onExit: () => void;
}

const panel: React.CSSProperties = {
  position: 'absolute',
  background: 'rgba(0,0,0,0.65)',
  backdropFilter: 'blur(6px)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8,
  fontFamily: "'Courier New', monospace",
  color: '#e0f0ff',
  fontSize: 13,
  lineHeight: 1.6,
  userSelect: 'none',
  pointerEvents: 'none',
};

export default function RaceHUD({ session, course, onRetry, onExit }: Props) {
  if (!session || !course || session.phase === 'idle') return null;

  // ── Countdown ────────────────────────────────────────────────────────────────
  if (session.phase === 'countdown') {
    const label = session.countdownValue > 0 ? String(session.countdownValue) : 'GO!';
    const color = session.countdownValue > 0 ? '#ff4444' : '#00ff88';
    return (
      <div style={{
        position: 'absolute', inset: 0, display: 'flex',
        alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
      }}>
        <div style={{
          fontSize: 96, fontWeight: 900, color,
          fontFamily: 'monospace',
          textShadow: `0 0 40px ${color}`,
          animation: 'none',
        }}>
          {label}
        </div>
        <div style={{
          position: 'absolute', bottom: '30%',
          fontSize: 18, color: '#aaa',
          fontFamily: 'monospace',
        }}>
          {course.name}
        </div>
      </div>
    );
  }

  // ── Finished ─────────────────────────────────────────────────────────────────
  if (session.phase === 'finished') {
    const totalTime = session.lapTimes.reduce((a, b) => a + b, 0);
    const stars = getRaceStars(session, course);
    return (
      <div style={{
        position: 'absolute', inset: 0, display: 'flex',
        alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
      }}>
        <div style={{
          ...panel,
          pointerEvents: 'auto',
          padding: '28px 40px',
          textAlign: 'center',
          minWidth: 280,
        }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#fff', letterSpacing: 2, marginBottom: 16 }}>
            🏁 RACE COMPLETE
          </div>
          <Row label="賽道" value={course.name} color="#aaa" />
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.15)', margin: '10px 0' }} />
          <Row label="TOTAL TIME" value={formatRaceTime(totalTime)} color="#00e5ff" />
          {session.bestLap > 0 && (
            <Row label="BEST LAP" value={formatRaceTime(session.bestLap)} color="#00ff88" />
          )}
          <Row label="CRASHES" value={String(session.crashCount)} color={session.crashCount > 0 ? '#ff6644' : '#00ff88'} />
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.15)', margin: '10px 0' }} />
          {session.lapTimes.map((t, i) => (
            <Row key={i} label={`Lap ${i + 1}`} value={formatRaceTime(t)} color="#ccc" />
          ))}
          <div style={{ fontSize: 28, margin: '14px 0 18px' }}>
            {Array.from({ length: 3 }, (_, i) => (
              <span key={i} style={{ opacity: i < stars ? 1 : 0.2 }}>⭐</span>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', pointerEvents: 'auto' }}>
            <button onClick={onRetry} style={btnStyle('#00e5ff')}>RETRY</button>
            <button onClick={onExit}  style={btnStyle('#ff5555')}>EXIT</button>
          </div>
        </div>
      </div>
    );
  }

  // ── Crashed ──────────────────────────────────────────────────────────────────
  const showCrash = session.phase === 'crashed';

  // ── Racing panel ─────────────────────────────────────────────────────────────
  const nextGate = session.currentGateIndex;
  const totalGates = course.gates.length;
  const lapTime = session.elapsedTime - (session.lapTimes.reduce((a, b) => a + b, 0));
  const color = course.color;

  return (
    <>
      {/* Top-left race info */}
      <div style={{ ...panel, top: 16, left: 16, padding: '10px 14px', minWidth: 200 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24, marginBottom: 4 }}>
          <span style={{ color: '#aaa', fontSize: 11 }}>LAP</span>
          <span style={{ color: '#fff', fontWeight: 700 }}>
            {session.currentLap} / {session.totalLaps}
          </span>
          <span style={{ color: '#aaa', fontSize: 11, marginLeft: 8 }}>⏱</span>
          <span style={{ color: color, fontWeight: 700 }}>{formatRaceTime(session.elapsedTime)}</span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ color: '#aaa', fontSize: 11 }}>GATE</span>
          <span style={{ color: color, fontWeight: 700 }}>
            {nextGate >= totalGates ? '✓' : `${nextGate + 1} / ${totalGates}`}
          </span>
        </div>

        <div style={{ borderTop: '1px solid rgba(255,255,255,0.12)', paddingTop: 6, marginTop: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#888', fontSize: 11 }}>LAP TIME</span>
            <span style={{ color: '#fff' }}>{formatRaceTime(Math.max(0, lapTime))}</span>
          </div>
          {session.bestLap > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#888', fontSize: 11 }}>BEST LAP</span>
              <span style={{ color: '#00ff88' }}>{formatRaceTime(session.bestLap)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#888', fontSize: 11 }}>CRASHES</span>
            <span style={{ color: session.crashCount > 0 ? '#ff6644' : '#00ff88' }}>
              {session.crashCount}
            </span>
          </div>
        </div>
      </div>

      {/* Boost indicator (top center) */}
      {session.boostActive && (
        <div style={{
          position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(255,165,0,0.85)', color: '#000',
          padding: '4px 16px', borderRadius: 4, fontWeight: 900, fontSize: 14,
          fontFamily: 'monospace', letterSpacing: 2,
          pointerEvents: 'none',
        }}>
          ⚡ BOOST
        </div>
      )}

      {/* FPV indicator */}
      {session.fpvMode && (
        <div style={{
          position: 'absolute', top: 16, right: 16,
          ...panel,
          padding: '4px 10px',
          fontSize: 11,
          color: color,
          pointerEvents: 'none',
        }}>
          FPV
        </div>
      )}

      {/* Crash overlay */}
      {showCrash && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex',
          flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: 'rgba(180,0,0,0.25)',
          pointerEvents: 'none',
        }}>
          <div style={{ fontSize: 48, color: '#ff4444', fontFamily: 'monospace', fontWeight: 900, textShadow: '0 0 30px #ff0000' }}>
            CRASHED
          </div>
          <div style={{ color: '#ccc', fontSize: 14, marginTop: 8 }}>
            {session.autoRespawnTimer > 0
              ? `重生中... ${session.autoRespawnTimer.toFixed(1)}s`
              : '按 R 立即重生'}
          </div>
        </div>
      )}

      {/* Boost cooldown bar (bottom center) */}
      {!session.boostActive && session.boostCooldown > 0 && (
        <div style={{
          position: 'absolute', bottom: 80, left: '50%', transform: 'translateX(-50%)',
          pointerEvents: 'none', textAlign: 'center',
        }}>
          <div style={{ color: '#888', fontSize: 10, marginBottom: 3, fontFamily: 'monospace' }}>BOOST</div>
          <div style={{ width: 80, height: 4, background: 'rgba(255,255,255,0.15)', borderRadius: 2 }}>
            <div style={{
              height: '100%', background: '#ff9100',
              width: `${(1 - session.boostCooldown / 3) * 100}%`,
              borderRadius: 2, transition: 'width 0.1s linear',
            }} />
          </div>
        </div>
      )}
    </>
  );
}

function Row({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', gap: 20 }}>
      <span style={{ color: '#888', fontSize: 12 }}>{label}</span>
      <span style={{ color, fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function btnStyle(color: string): React.CSSProperties {
  return {
    background: 'transparent',
    border: `1px solid ${color}`,
    color,
    padding: '7px 20px',
    borderRadius: 4,
    cursor: 'pointer',
    fontFamily: 'monospace',
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: 1,
  };
}
