'use client';
import { HUDData, VehicleType, OrderStatus } from './types';
import { MAX_STARS } from './wanted';
import { actionRows, stackLimit, toastsThatFit, type TouchLayout } from './touchLayout';

const vehicleLabel: Record<VehicleType, string> = {
  [VehicleType.CAR]: '🚗 轎車',
  [VehicleType.TAXI]: '🚕 計程車',
  [VehicleType.DELIVERY_SCOOTER]: '📦 外送機車',
  [VehicleType.HELICOPTER]: '🚁 直升機',
  [VehicleType.RC_DRONE]: '🚁 無人機',
  [VehicleType.NPC_CAR]: '🚗 車輛',
  [VehicleType.POLICE]: '🚓 警車',
  [VehicleType.SWAT]: '🚐 特警裝甲車',
  [VehicleType.POLICE_HELI]: '🚁 警用直升機',
  [VehicleType.ARMY_TRUCK]: '🚛 軍用卡車',
  [VehicleType.TANK]: '🪖 戰車',
};

const statusColor: Record<OrderStatus, string> = {
  dispatched: '#aaa',
  arriving: '#ffcc00',
  arrived: '#00ff88',
  completed: '#555',
};

interface Props {
  data: HUDData;
  onPhone: () => void;
  onChallenge: () => void;
  isMobile?: boolean;
  /** Touch screens: positions for this screen shape (see touchLayout). */
  touch?: TouchLayout | null;
  mapExpanded?: boolean;
}

export default function HUD({ data, onPhone, onChallenge, isMobile = false, touch = null }: Props) {
  const {
    speedKMH, playerState, vehicleType, orders, drone, zone, playerX, playerY,
    notifications, vehicleAltitude, nearVehicle,
    health, vehicleHp, wantedStars, wantedEvading, arrestProgress, screenFade, screenLabel,
    autopilot, restrictedZone, hurtFlash, cannonReady, tiresPopped,
  } = data;

  const activeOrders = orders.filter(o => o.status !== 'completed');
  // A phone held sideways has no room over the action buttons, so the order
  // cards head the toast stack instead (see touchLayout).
  const ordersInStack = !!touch && !touch.orders;

  // Toasts hang under the health / wanted / cash block, pushed down by however
  // many status chips show there. On touch screens only as many as fit above
  // the buttons are shown (the newest).
  const toastTop = (touch ? touch.notifications.top : 84)
    + (restrictedZone ? 22 : 0) + (tiresPopped ? 22 : 0);
  const rows = actionRows({
    playerState,
    interact: !data.mission && (!!data.nearMarker || data.canStartTaxi),
    racing: playerState === 'inDrone' && data.raceSession?.phase === 'racing',
  });
  const toastCount = touch
    ? toastsThatFit(toastTop, stackLimit(touch, rows), ordersInStack ? activeOrders.length : 0)
    : 4;

  const orderCards = activeOrders.map(order => (
    <div
      key={order.id}
      className="bg-black/70 backdrop-blur border border-white/10 rounded-lg px-3 py-1.5 text-xs font-mono"
    >
      <div className="flex items-center gap-2">
        <span className="text-white">{order.label}</span>
        <span style={{ color: statusColor[order.status] }}>
          {order.status === 'dispatched' && '派出中'}
          {order.status === 'arriving' && '到達中'}
          {order.status === 'arrived' && '已到達！'}
        </span>
      </div>
      {order.eta > 0 && order.status !== 'arrived' && (
        <div className="text-white/30 text-[9px]">約 {Math.ceil(order.eta)}s</div>
      )}
    </div>
  ));

  // Keep the F hint honest about whether this would be boarding or stealing.
  const enterHint = playerState === 'inDrone' || playerState === 'inHelicopter' ? '降落'
    : playerState === 'inCar' ? '下車'
    : nearVehicle === 'occupied' || nearVehicle === 'police' ? '搶車'
    : '上車';

  return (
    <>
      {/* Top-left: vehicle / state info (touch: beside the landscape minimap) */}
      <div
        data-testid="hud"
        className="absolute flex flex-col gap-1 pointer-events-none"
        style={touch ? {
          top: 'calc(10px + env(safe-area-inset-top, 0px))',
          left: `calc(${touch.hudLeft}px + env(safe-area-inset-left, 0px))`,
        } : { top: 12, left: 12 }}
      >
        <div className="bg-black/60 backdrop-blur border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white font-mono">
          <div className="text-[10px] text-white/40 uppercase tracking-wider">速度</div>
          <div className="text-lg font-bold text-yellow-300 leading-none">
            {speedKMH} <span className="text-[10px] text-white/50">km/h</span>
          </div>
        </div>
        {vehicleType && playerState !== 'onFoot' && (
          <div className="bg-black/60 backdrop-blur border border-white/10 rounded-lg px-3 py-1.5 text-xs font-mono">
            <div className="text-[10px] text-white/40">載具</div>
            <div className="text-white">{vehicleLabel[vehicleType]}</div>
            {vehicleType === VehicleType.HELICOPTER && vehicleAltitude !== undefined && (
              <div className="text-[10px] text-cyan-400 mt-1 uppercase tracking-wider">
                高度: {Math.round(vehicleAltitude)}m
              </div>
            )}
          </div>
        )}
        {autopilot?.active && (
          <div
            className="bg-black/60 backdrop-blur border rounded-lg px-3 py-1.5 text-xs font-mono"
            style={{ borderColor: 'rgba(74,222,128,0.6)', animation: 'wantedBlink 1.6s ease-in-out infinite' }}
          >
            <div className="text-[10px] text-green-400/80 uppercase tracking-wider">🤖 自動駕駛</div>
            <div className="text-green-300">
              {autopilot.target === 'mission' ? '前往任務目標' : '前往路標'}
              <span className="text-white/50 ml-2">{Math.round(autopilot.distance * 0.25)} m</span>
            </div>
          </div>
        )}
        {playerState === 'inDrone' && (
          <div className="bg-black/60 backdrop-blur border border-cyan-500/30 rounded-lg px-3 py-1.5 text-xs font-mono">
            <div className="text-[10px] text-cyan-400/70 uppercase">無人機狀態</div>
            <div className="text-cyan-300">高度 {Math.round(drone.altitude)}m</div>
            <div className="flex gap-2 mt-0.5">
              <span className="text-white/50">訊號</span>
              <span className={drone.signal > 50 ? 'text-green-400' : 'text-red-400'}>
                {Math.round(drone.signal)}%
              </span>
              <span className="text-white/50">電量</span>
              <span className={drone.battery > 20 ? 'text-yellow-400' : 'text-red-400'}>
                {Math.round(drone.battery)}%
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Bottom-left: controls hint — desktop only */}
      {!isMobile && (
        <div className="absolute bottom-3 left-3 pointer-events-none">
          <div className="bg-black/60 backdrop-blur border border-white/10 rounded-lg px-3 py-2 text-[10px] text-white/40 font-mono flex gap-3">
            <span><kbd className="text-white/60">WASD</kbd> 移動</span>
            <span><kbd className="text-white/60">滑鼠</kbd> 環視</span>
            <span><kbd className="text-white/60">滾輪</kbd> 縮放</span>
            {playerState === 'onFoot' && (
              <span><kbd className="text-white/60">Shift</kbd>跑 <kbd className="text-white/60">Space</kbd>跳</span>
            )}
            <span><kbd className="text-white/60">F</kbd> {enterHint}</span>
            {playerState === 'inCar' && (
              <span className={autopilot?.active ? 'text-green-400' : undefined}>
                <kbd className="text-white/60">C</kbd> {autopilot?.active ? '解除自駕' : '自動駕駛'}
              </span>
            )}
            <button
              className="pointer-events-auto text-amber-400 hover:text-amber-300 cursor-pointer"
              onClick={onPhone}
            >
              <kbd className="text-white/60">P</kbd> 手機
            </button>
            <span><kbd className="text-white/60">M</kbd> 地圖</span>
            {(playerState === 'inDrone' || playerState === 'inHelicopter') && (
              <span><kbd className="text-white/60">Space</kbd>升 <kbd className="text-white/60">Q</kbd>降</span>
            )}
          </div>
        </div>
      )}

      {/* Bottom-center: coordinates + zone — desktop only */}
      {!isMobile && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 pointer-events-none">
          <div className="bg-black/60 backdrop-blur border border-white/10 rounded-lg px-3 py-1 text-[10px] text-white/40 font-mono text-center">
            <span className="text-white/60">{zone}</span>
            <span className="mx-2 text-white/20">|</span>
            X:{playerX} Y:{playerY}
          </div>
        </div>
      )}

      {/* Bottom-right: active orders — above the action buttons on touch screens */}
      {activeOrders.length > 0 && !ordersInStack && (
        <div
          className="absolute flex flex-col gap-1 pointer-events-none"
          style={touch?.orders ? {
            bottom: `calc(${touch.orders.bottom}px + env(safe-area-inset-bottom, 0px))`,
            right: `calc(${touch.orders.right}px + env(safe-area-inset-right, 0px))`,
          } : { bottom: 48, right: 12 }}
        >
          {orderCards}
        </div>
      )}

      {/* Top-right: health + wanted level */}
      <div
        className="absolute right-3 flex flex-col items-end gap-1.5 pointer-events-none"
        style={{ top: isMobile ? 'calc(10px + env(safe-area-inset-top, 0px))' : '12px' }}
      >
        {/* Health */}
        <div
          className="rounded-full overflow-hidden border border-white/20"
          style={{ width: isMobile ? 96 : 120, height: 6, background: 'rgba(0,0,0,0.55)' }}
        >
          <div
            style={{
              width: `${Math.max(0, Math.min(100, health))}%`,
              height: '100%',
              background: health > 50 ? '#4ade80' : health > 25 ? '#facc15' : '#ef4444',
              transition: 'width 0.15s linear',
            }}
          />
        </div>

        {/* Vehicle durability, only while driving something damaged */}
        {vehicleHp !== undefined && vehicleHp < 100 && (
          <div
            className="rounded-full overflow-hidden border border-white/15"
            style={{ width: isMobile ? 96 : 120, height: 4, background: 'rgba(0,0,0,0.55)' }}
          >
            <div
              style={{
                width: `${Math.max(0, Math.min(100, vehicleHp))}%`,
                height: '100%',
                background: vehicleHp > 50 ? '#60a5fa' : vehicleHp > 20 ? '#fb923c' : '#ef4444',
                transition: 'width 0.15s linear',
              }}
            />
          </div>
        )}

        {/* Wanted stars — all six slots, lit ones greyed while the meter drains */}
        {wantedStars > 0 && (
          <div
            data-testid="wanted-stars"
            data-stars={wantedStars}
            className="flex gap-0.5 font-mono"
            style={{
              fontSize: isMobile ? 15 : 17,
              lineHeight: 1,
              animation: wantedEvading ? 'wantedBlink 1s ease-in-out infinite' : undefined,
              textShadow: '0 0 6px rgba(0,0,0,0.9)',
            }}
          >
            {Array.from({ length: MAX_STARS }, (_, i) => {
              const lit = i < wantedStars;
              return (
                <span
                  key={i}
                  style={{
                    color: !lit ? 'rgba(255,255,255,0.18)' : wantedEvading ? '#9ca3af' : '#ffd23f',
                  }}
                >
                  ★
                </span>
              );
            })}
          </div>
        )}

        {/* Inside the base */}
        {restrictedZone && (
          <div
            className="rounded px-2 py-0.5 font-mono font-bold text-[10px] tracking-wider"
            style={{
              background: 'rgba(185,28,28,0.85)',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.35)',
              animation: 'wantedBlink 0.8s ease-in-out infinite',
            }}
          >
            ⚠ 軍事禁區
          </div>
        )}

        {/* Shredded tyres */}
        {tiresPopped && (
          <div className="rounded px-2 py-0.5 font-mono text-[10px] bg-black/70 text-orange-300 border border-orange-400/40">
            輪胎破損 · 去噴漆廠修理
          </div>
        )}

        {/* Arrest progress */}
        {arrestProgress > 0 && (
          <div
            className="rounded-full overflow-hidden border border-red-400/40"
            style={{ width: isMobile ? 96 : 120, height: 4, background: 'rgba(0,0,0,0.6)' }}
          >
            <div
              style={{
                width: `${Math.round(arrestProgress * 100)}%`,
                height: '100%',
                background: '#ef4444',
              }}
            />
          </div>
        )}
      </div>

      {/* Damage flash: a red vignette that fades out. */}
      {hurtFlash > 0 && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse at center, transparent 45%, rgba(220,20,20,0.85) 100%)',
            opacity: Math.min(1, hurtFlash) * 0.6,
            transition: 'opacity 0.12s linear',
            zIndex: 55,
          }}
        />
      )}

      {/* Tank main gun: reticle plus a reload ring. */}
      {cannonReady !== null && screenFade === 0 && (
        <div
          data-testid="tank-reticle"
          className="absolute left-1/2 top-1/2 pointer-events-none"
          style={{ transform: 'translate(-50%, -50%)', zIndex: 40 }}
        >
          <svg width="64" height="64" viewBox="0 0 64 64">
            <circle cx="32" cy="32" r="22" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="3" />
            <circle
              cx="32" cy="32" r="22" fill="none"
              stroke={cannonReady >= 1 ? '#84cc16' : '#fbbf24'}
              strokeWidth="3"
              strokeDasharray={`${cannonReady * 138.2} 138.2`}
              transform="rotate(-90 32 32)"
            />
            <line x1="32" y1="18" x2="32" y2="26" stroke="#fff" strokeWidth="2" />
            <line x1="32" y1="38" x2="32" y2="46" stroke="#fff" strokeWidth="2" />
            <line x1="18" y1="32" x2="26" y2="32" stroke="#fff" strokeWidth="2" />
            <line x1="38" y1="32" x2="46" y2="32" stroke="#fff" strokeWidth="2" />
          </svg>
          <div className="text-center font-mono text-[10px] text-white/70" style={{ textShadow: '0 0 4px #000' }}>
            {cannonReady >= 1 ? (isMobile ? '開砲 🎯' : '左鍵 / Ctrl 開砲') : '裝填中…'}
          </div>
        </div>
      )}

      {/* Busted / Wasted fade. Updated at 10Hz, so the CSS transition smooths it. */}
      {screenFade > 0 && (
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          style={{
            background: screenLabel === 'WASTED' ? '#1a0000' : '#000',
            opacity: Math.max(0, Math.min(1, screenFade)),
            transition: 'opacity 0.12s linear',
            zIndex: 60,
          }}
        >
          {screenLabel && (
            <span
              className="font-mono font-bold"
              style={{ color: '#ff4444', fontSize: isMobile ? 34 : 54, letterSpacing: '0.15em' }}
            >
              {screenLabel}
            </span>
          )}
        </div>
      )}

      {/* Notifications — top-right, slide in, auto-expire */}
      <div
        className="absolute flex flex-col items-end gap-1.5 pointer-events-none"
        // Sits under the health bar + wanted stars.
        data-slot="notifications"
        style={{
          top: toastTop,
          right: touch ? `calc(${touch.notifications.right}px + env(safe-area-inset-right, 0px))` : 12,
          maxWidth: 'min(280px, calc(100vw - 24px))',
        }}
      >
        {ordersInStack && orderCards}
        {notifications.slice(-toastCount).map(n => (
          <div
            key={n.id}
            className="bg-black/80 backdrop-blur border rounded-xl px-4 py-2 text-sm font-mono text-right"
            style={{
              borderColor: (n.color ?? '#fff') + '55',
              color: n.color ?? '#fff',
              animation: 'notifSlideIn 0.25s ease-out',
            }}
          >
            {n.text}
          </div>
        ))}
      </div>

      {/* Phone + Challenge buttons (floating) — desktop only; mobile has MobileControls quick strip */}
      {!isMobile && (
        <>
          <button
            onClick={onChallenge}
            className="absolute bottom-3 right-16 w-10 h-10 bg-black/70 backdrop-blur border border-white/20 rounded-full flex items-center justify-center text-lg hover:border-cyan-400/50 hover:bg-cyan-950/30 transition-colors"
            title="挑戰關卡"
          >
            🏁
          </button>
          <button
            onClick={onPhone}
            className="absolute bottom-3 right-3 w-10 h-10 bg-black/70 backdrop-blur border border-white/20 rounded-full flex items-center justify-center text-lg hover:border-amber-400/50 hover:bg-amber-950/30 transition-colors"
            title="手機 (P)"
          >
            📱
          </button>
        </>
      )}
    </>
  );
}
