'use client';
import { useRef, useState, useCallback } from 'react';
import { InputManager } from './controls';
import { HUDData } from './types';

interface Props {
  input: InputManager;
  hud: HUDData;
  onPhone: () => void;
  onMapToggle: () => void;
  onTownHallToggle: () => void;
  onWeatherCycle: () => void;
}

const MAX_RADIUS = 50;

const BTN = {
  minWidth: 52,
  minHeight: 52,
  background: 'rgba(0,0,0,0.55)',
  backdropFilter: 'blur(6px)',
  WebkitBackdropFilter: 'blur(6px)',
  border: '1px solid rgba(255,255,255,0.18)',
  borderRadius: 12,
  color: '#fff',
  fontSize: 11,
  fontFamily: 'monospace',
  display: 'flex',
  flexDirection: 'column' as const,
  alignItems: 'center',
  justifyContent: 'center',
  gap: 2,
  userSelect: 'none' as const,
  touchAction: 'none' as const,
  WebkitTapHighlightColor: 'transparent',
  cursor: 'pointer',
  padding: '4px 8px',
};

const ICON_BTN = {
  ...BTN,
  minWidth: 48,
  minHeight: 48,
  borderRadius: '50%',
  fontSize: 20,
  padding: 0,
};

export default function MobileControls({
  input, hud, onPhone, onMapToggle, onTownHallToggle, onWeatherCycle,
}: Props) {
  const { playerState } = hud;

  // ── Virtual joystick state ──────────────────────────────────────────────
  const [thumbPos, setThumbPos] = useState({ x: 0, y: 0 });
  const activePointerRef = useRef<number | null>(null);
  const originRef = useRef({ x: 0, y: 0 });

  const handleJoystickMove = useCallback((cx: number, cy: number) => {
    const ox = originRef.current.x;
    const oy = originRef.current.y;
    const dx = cx - ox;
    const dy = cy - oy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const clamped = Math.min(dist, MAX_RADIUS);
    const angle = Math.atan2(dy, dx);
    const vx = clamped * Math.cos(angle);
    const vy = clamped * Math.sin(angle);
    setThumbPos({ x: vx, y: vy });
    input.setVirtualMove(vx / MAX_RADIUS, vy / MAX_RADIUS);
  }, [input]);

  const onJoystickDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    activePointerRef.current = e.pointerId;
    const rect = e.currentTarget.getBoundingClientRect();
    originRef.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    handleJoystickMove(e.clientX, e.clientY);
  }, [handleJoystickMove]);

  const onJoystickMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== activePointerRef.current) return;
    e.stopPropagation();
    handleJoystickMove(e.clientX, e.clientY);
  }, [handleJoystickMove]);

  const onJoystickUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== activePointerRef.current) return;
    e.stopPropagation();
    activePointerRef.current = null;
    setThumbPos({ x: 0, y: 0 });
    input.setVirtualMove(0, 0);
  }, [input]);

  // ── Hold button factory ────────────────────────────────────────────────
  function holdBtn(
    name: Parameters<InputManager['setTouchButton']>[0],
    label: string,
    emoji: string,
    style?: React.CSSProperties,
  ) {
    return (
      <button
        aria-label={label}
        style={{ ...BTN, ...style }}
        onPointerDown={(e) => {
          e.stopPropagation();
          e.currentTarget.setPointerCapture(e.pointerId);
          input.setTouchButton(name, true);
        }}
        onPointerUp={(e) => { e.stopPropagation(); input.setTouchButton(name, false); }}
        onPointerCancel={(e) => { e.stopPropagation(); input.setTouchButton(name, false); }}
      >
        <span style={{ fontSize: 16 }}>{emoji}</span>
        <span>{label}</span>
      </button>
    );
  }

  // ── One-shot button (tap) ──────────────────────────────────────────────
  function tapBtn(
    action: Parameters<InputManager['triggerTouchAction']>[0],
    label: string,
    emoji: string,
    style?: React.CSSProperties,
  ) {
    return (
      <button
        aria-label={label}
        style={{ ...BTN, ...style }}
        onPointerDown={(e) => {
          e.stopPropagation();
          input.triggerTouchAction(action);
        }}
      >
        <span style={{ fontSize: 16 }}>{emoji}</span>
        <span>{label}</span>
      </button>
    );
  }

  // ── Action cluster (context-aware) ────────────────────────────────────
  function renderActionCluster() {
    const inDrone = playerState === 'inDrone';
    const inHeli  = playerState === 'inHelicopter';
    const inCar   = playerState === 'inCar';
    const inRace  = inDrone && !!hud.raceSession && hud.raceSession.phase === 'racing';

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
        {/* Race-mode extras */}
        {inRace && (
          <div style={{ display: 'flex', gap: 6 }}>
            {holdBtn('boost', 'Boost', '⚡', { background: 'rgba(255,140,0,0.6)', borderColor: 'rgba(255,140,0,0.8)' })}
            {tapBtn('respawn', '重生', '↩', { minWidth: 52 })}
            {tapBtn('fpvToggle', 'FPV', '📷', { minWidth: 52 })}
          </div>
        )}

        {/* Yaw row (drone only) */}
        {inDrone && (
          <div style={{ display: 'flex', gap: 6 }}>
            {holdBtn('droneYawLeft',  '偏左', '↺')}
            {holdBtn('droneYawRight', '偏右', '↻')}
          </div>
        )}

        {/* Throttle row (drone / helicopter) */}
        {(inDrone || inHeli) && (
          <div style={{ display: 'flex', gap: 6 }}>
            {holdBtn('droneThrottleDown', '降', '⬇', { minWidth: 52 })}
            {holdBtn('droneThrottleUp',   '升', '⬆', { minWidth: 52 })}
          </div>
        )}

        {/* Brake (car) */}
        {inCar && holdBtn('brake', '煞車', '🛑', { minWidth: 80 })}

        {/* Enter / Exit */}
        {tapBtn('enter', inDrone || inHeli ? '降落' : '上/下車', inDrone || inHeli ? '🛬' : '🚗', { minWidth: 80 })}
      </div>
    );
  }

  // ── Quick button strip ────────────────────────────────────────────────
  function quickBtn(emoji: string, label: string, onPress: () => void) {
    return (
      <button
        aria-label={label}
        style={ICON_BTN}
        onPointerDown={(e) => { e.stopPropagation(); onPress(); }}
      >
        {emoji}
      </button>
    );
  }

  // Shared safe-area offset helpers
  const safeBottom = 'calc(24px + env(safe-area-inset-bottom, 0px))';
  const safeRight  = 'calc(12px + env(safe-area-inset-right, 0px))';
  const safeTop50  = '50%';

  return (
    // Full-screen passthrough overlay — pointer-events none so canvas still receives camera drags
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 40,
        pointerEvents: 'none',
      }}
    >
      {/* ── Left bottom: virtual joystick ── */}
      <div
        role="img"
        aria-label="虛擬搖桿"
        style={{
          position: 'fixed',
          bottom: safeBottom,
          left: 24,
          width: 120,
          height: 120,
          borderRadius: '50%',
          background: 'rgba(0,0,0,0.40)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
          border: '2px solid rgba(255,255,255,0.18)',
          pointerEvents: 'auto',
          touchAction: 'none',
          userSelect: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'grab',
        }}
        onPointerDown={onJoystickDown}
        onPointerMove={onJoystickMove}
        onPointerUp={onJoystickUp}
        onPointerCancel={onJoystickUp}
      >
        {/* Thumb */}
        <div
          style={{
            position: 'absolute',
            width: 48,
            height: 48,
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.25)',
            border: '2px solid rgba(255,255,255,0.55)',
            transform: `translate(${thumbPos.x}px, ${thumbPos.y}px)`,
            transition: thumbPos.x === 0 && thumbPos.y === 0 ? 'transform 0.12s ease-out' : 'none',
            pointerEvents: 'none',
          }}
        />
      </div>

      {/* ── Right bottom: action button cluster ── */}
      <div
        style={{
          position: 'fixed',
          bottom: safeBottom,
          right: safeRight,
          pointerEvents: 'auto',
          touchAction: 'none',
          userSelect: 'none',
        }}
      >
        {renderActionCluster()}
      </div>

      {/* ── Right side: quick button strip ── */}
      <div
        style={{
          position: 'fixed',
          right: safeRight,
          top: safeTop50,
          transform: 'translateY(-50%)',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          pointerEvents: 'auto',
          touchAction: 'none',
          userSelect: 'none',
        }}
      >
        {quickBtn('📱', '手機服務', onPhone)}
        {quickBtn('🗺', '小地圖', onMapToggle)}
        {quickBtn('🌤', '切換天氣', onWeatherCycle)}
        {hud.nearTownHall && quickBtn('🏛', '城鎮辦事處', onTownHallToggle)}
      </div>
    </div>
  );
}
