'use client';
import { useRef, useState, useCallback } from 'react';
import { InputManager } from './controls';
import { HUDData } from './types';
import { JOYSTICK, type TouchLayout } from './touchLayout';

interface Props {
  input: InputManager;
  hud: HUDData;
  onPhone: () => void;
  onChallenge: () => void;
  onMapToggle: () => void;
  onTownHallToggle: () => void;
  onWeatherCycle: () => void;
  /** Opens the pause / settings menu (touch has no Esc key). */
  onPause: () => void;
  /** Positions for the current screen shape (see touchLayout). */
  layout: TouchLayout;
}

const MAX_RADIUS = 50;
/** Touch-drag look sensitivity, in mouse-pixel equivalents per CSS pixel. */
const TOUCH_LOOK_SENS = 2.2;
/** The look zone starts below the minimap so it never swallows map taps. */
const LOOK_ZONE_TOP = 130;

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
  input, hud, onPhone, onChallenge, onMapToggle, onTownHallToggle, onWeatherCycle, onPause, layout,
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

  // ── Right-half look zone (camera drag) ─────────────────────────────────
  // Pointer events are tracked per pointer id, so dragging here works at the
  // same time as the left-hand joystick.
  const lookPointerRef = useRef<number | null>(null);
  const lookLastRef = useRef({ x: 0, y: 0 });

  const onLookDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (lookPointerRef.current !== null) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    lookPointerRef.current = e.pointerId;
    lookLastRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const onLookMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== lookPointerRef.current) return;
    const last = lookLastRef.current;
    input.addLook((e.clientX - last.x) * TOUCH_LOOK_SENS, (e.clientY - last.y) * TOUCH_LOOK_SENS);
    lookLastRef.current = { x: e.clientX, y: e.clientY };
  }, [input]);

  const onLookUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== lookPointerRef.current) return;
    lookPointerRef.current = null;
  }, []);

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
  // The HUD sizes its landscape toast stack from actionRows (touchLayout.ts):
  // a row added or removed here needs the same change there.
  function renderActionCluster() {
    const inDrone = playerState === 'inDrone';
    const inHeli  = playerState === 'inHelicopter';
    const inCar   = playerState === 'inCar';
    const onFoot  = playerState === 'onFoot';
    const inRace  = inDrone && !!hud.raceSession && hud.raceSession.phase === 'racing';

    // What F would do right now, so the button never lies about the action.
    const enterLabel = inDrone || inHeli ? '降落'
      : inCar ? '下車'
      : hud.nearVehicle === 'occupied' || hud.nearVehicle === 'police' ? '搶車'
      : '上車';
    const enterEmoji = inDrone || inHeli ? '🛬'
      : hud.nearVehicle === 'occupied' || hud.nearVehicle === 'police' ? '🔓'
      : '🚗';

    // What E would do right now: reopen a brief underfoot or start taxi work.
    // Keyboards press E; this is the same action as a button.
    const interact = hud.mission ? null
      : hud.nearMarker ? { label: '查看任務', emoji: '📋' }
      : hud.canStartTaxi ? { label: '開始接客', emoji: '🚕' }
      : null;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
        {interact && tapBtn('interact', interact.label, interact.emoji, {
          minWidth: 80,
          background: 'rgba(255,210,63,0.25)',
          borderColor: 'rgba(255,210,63,0.7)',
        })}

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

        {/* Run / jump (on foot) */}
        {onFoot && (
          <div style={{ display: 'flex', gap: 6 }}>
            {holdBtn('sprint', '跑', '🏃', { minWidth: 52 })}
            {tapBtn('jump', '跳', '🦘', { minWidth: 52 })}
          </div>
        )}

        {/* Brake + autopilot (car) */}
        {inCar && (
          <div style={{ display: 'flex', gap: 6 }}>
            {holdBtn('brake', '煞車', '🛑', { minWidth: 52 })}
            {hud.cannonReady !== null && holdBtn('fire', '開砲', '💥', {
              minWidth: 52,
              background: 'rgba(220,38,38,0.35)',
              borderColor: 'rgba(248,113,113,0.7)',
            })}
            {tapBtn(
              'autopilot',
              hud.autopilot?.active ? '解除' : '自駕',
              hud.autopilot?.active ? '⏹' : '🤖',
              hud.autopilot?.active
                ? { minWidth: 52, background: 'rgba(74,222,128,0.35)', borderColor: 'rgba(74,222,128,0.7)' }
                : { minWidth: 52 },
            )}
          </div>
        )}

        {/* Enter / Exit */}
        {tapBtn('enter', enterLabel, enterEmoji, { minWidth: 80 })}
      </div>
    );
  }

  // ── Quick button strip ────────────────────────────────────────────────
  const { quick, cluster, landscape } = layout;
  const quickStyle = quick.size === ICON_BTN.minWidth
    ? ICON_BTN
    : { ...ICON_BTN, minWidth: quick.size, minHeight: quick.size, fontSize: Math.round(quick.size * 0.42) };

  function quickBtn(emoji: string, label: string, onPress: () => void) {
    return (
      <button
        aria-label={label}
        style={quickStyle}
        onPointerDown={(e) => { e.stopPropagation(); onPress(); }}
      >
        {emoji}
      </button>
    );
  }

  // Shared safe-area offset helpers
  const safeBottom = `calc(${cluster.bottom}px + env(safe-area-inset-bottom, 0px))`;
  const safeRight  = (px: number) => `calc(${px}px + env(safe-area-inset-right, 0px))`;
  const townHallBtn = hud.nearTownHall && quickBtn('🏛', '城鎮辦事處', onTownHallToggle);

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
      {/* ── Right half: camera look zone ──
          Rendered first so every button below paints on top of it. */}
      <div
        aria-hidden
        style={{
          position: 'fixed',
          left: '50%',
          right: 0,
          top: `calc(${LOOK_ZONE_TOP}px + env(safe-area-inset-top, 0px))`,
          bottom: 0,
          zIndex: 0,
          pointerEvents: 'auto',
          touchAction: 'none',
          userSelect: 'none',
        }}
        onPointerDown={onLookDown}
        onPointerMove={onLookMove}
        onPointerUp={onLookUp}
        onPointerCancel={onLookUp}
      />

      {/* ── Left bottom: virtual joystick ── */}
      <div
        role="img"
        aria-label="虛擬搖桿"
        style={{
          position: 'fixed',
          bottom: `calc(${JOYSTICK.bottom}px + env(safe-area-inset-bottom, 0px))`,
          left: `calc(${JOYSTICK.left}px + env(safe-area-inset-left, 0px))`,
          width: JOYSTICK.size,
          height: JOYSTICK.size,
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
          zIndex: 1,
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
          right: safeRight(cluster.right),
          pointerEvents: 'auto',
          touchAction: 'none',
          userSelect: 'none',
          zIndex: 1,
        }}
      >
        {renderActionCluster()}
      </div>

      {/* ── Right side: quick button strip ──
          Portrait: halfway down the right edge. Landscape: stacked up from the
          bottom-right corner beside the action buttons, with the town-hall
          button added on top so the others never move under the thumb. */}
      <div
        style={{
          position: 'fixed',
          right: safeRight(quick.right),
          ...(landscape
            ? { bottom: `calc(${quick.bottom}px + env(safe-area-inset-bottom, 0px))` }
            : { top: '50%', transform: 'translateY(-50%)' }),
          display: 'flex',
          flexDirection: 'column',
          gap: quick.gap,
          pointerEvents: 'auto',
          touchAction: 'none',
          userSelect: 'none',
          zIndex: 1,
        }}
      >
        {landscape && townHallBtn}
        {quickBtn('⏸', '暫停選單', onPause)}
        {quickBtn('📱', '手機服務', onPhone)}
        {quickBtn('🏁', '挑戰關卡', onChallenge)}
        {quickBtn('🗺', '小地圖', onMapToggle)}
        {quickBtn('🌤', '切換天氣', onWeatherCycle)}
        {!landscape && townHallBtn}
      </div>
    </div>
  );
}
