'use client';
import { useState } from 'react';
import { DroneState, Order, CallRecord, RaceSession } from './types';
import { ALL_COURSES } from './raceCourses';
import { formatRaceTime } from './race';

const FOOD_MENU = [
  { name: '牛肉漢堡套餐', price: 150, emoji: '🍔' },
  { name: '披薩大份', price: 280, emoji: '🍕' },
  { name: '壽司拼盤', price: 350, emoji: '🍱' },
];

interface Props {
  onClose: () => void;
  onCallTaxi: () => void;
  onOrderFood: (index: number) => void;
  onCallHelicopter: () => void;
  onLaunchDrone: () => void;
  onLandDrone: () => void;
  onRTLDrone: () => void;
  onCancelOrder: (id: string) => void;
  onStartRace: (courseId: string) => void;
  onExitRace: () => void;
  orders: Order[];
  drone: DroneState;
  callLog: CallRecord[];
  raceSession?: RaceSession | null;
  isMobile?: boolean;
}

type Screen = 'home' | 'food' | 'drone' | 'calls';

export default function PhoneUI({
  onClose,
  onCallTaxi,
  onOrderFood,
  onCallHelicopter,
  onLaunchDrone,
  onLandDrone,
  onRTLDrone,
  onCancelOrder,
  onStartRace,
  onExitRace,
  orders,
  drone,
  callLog,
  raceSession = null,
  isMobile = false,
}: Props) {
  const [screen, setScreen] = useState<Screen>('home');
  const [orderedFood, setOrderedFood] = useState<number | null>(null);

  const activeOrders = orders.filter(o => o.status !== 'completed');

  function handleOrderFood(index: number) {
    onOrderFood(index);
    setOrderedFood(index);
    setTimeout(() => setOrderedFood(null), 2000);
  }

  // ── Shared screen content ─────────────────────────────────────────────────
  function renderScreenContent() {
    return (
      <>
        {screen === 'home' && (
          <>
            {!isMobile && (
              <div className="text-center text-xs font-mono text-white/50 mb-3">城市服務</div>
            )}

            {/* Active order banners */}
            {activeOrders.length > 0 && (
              <div className="mb-3 space-y-1">
                {activeOrders.map(o => (
                  <div key={o.id} className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-[10px] font-mono text-white/70 flex justify-between items-center gap-1">
                    <span className="flex-1 truncate">{o.label}</span>
                    <span className={o.status === 'arrived' ? 'text-green-400' : 'text-yellow-400'}>
                      {o.status === 'arrived' ? '到了！' : `${Math.ceil(o.eta)}s`}
                    </span>
                    <button
                      onClick={() => onCancelOrder(o.id)}
                      className="ml-1 text-red-400/70 hover:text-red-400 text-[10px] leading-none px-1 py-0.5 rounded hover:bg-red-900/30 transition-colors"
                      title="取消服務"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* App icons 2x2 */}
            <div className="grid grid-cols-2 gap-2">
              <AppButton
                emoji="🚕" label="叫計程車"
                sublabel="召喚計程車到你面前"
                color="from-yellow-900/60 to-yellow-800/40"
                borderColor="border-yellow-600/30"
                onClick={onCallTaxi}
                isMobile={isMobile}
              />
              <AppButton
                emoji="🍕" label="點外送"
                sublabel="訂餐到你位置"
                color="from-orange-900/60 to-orange-800/40"
                borderColor="border-orange-600/30"
                onClick={() => setScreen('food')}
                isMobile={isMobile}
              />
              <AppButton
                emoji="🚁" label="叫直升機"
                sublabel="派遣直升機"
                color="from-blue-900/60 to-blue-800/40"
                borderColor="border-blue-600/30"
                onClick={onCallHelicopter}
                isMobile={isMobile}
              />
              <AppButton
                emoji="🚁" label="無人機"
                sublabel={drone.active ? `飛行中 ${Math.round(drone.altitude)}m` : '遙控四軸'}
                color="from-cyan-900/60 to-cyan-800/40"
                borderColor="border-cyan-600/30"
                onClick={() => setScreen('drone')}
                isMobile={isMobile}
              />
            </div>

            {/* Call log shortcut — full width below grid */}
            <div className="mt-2">
              <button
                onClick={() => setScreen('calls')}
                className="w-full bg-gradient-to-br from-slate-900/60 to-slate-800/40 border border-slate-600/30 rounded-2xl px-3 py-2 flex items-center gap-2 hover:brightness-125 transition-all active:scale-95"
                style={{ minHeight: isMobile ? 52 : undefined }}
              >
                <span className="text-lg">📞</span>
                <div className="text-left flex-1 min-w-0">
                  <div className="text-white font-mono text-xs leading-tight">通訊紀錄</div>
                  <div className="text-white/40 text-[9px] leading-tight truncate">
                    {callLog.length > 0 ? `${callLog.length} 筆紀錄` : '尚無紀錄'}
                  </div>
                </div>
                <span className="text-white/30 text-xs">›</span>
              </button>
            </div>
          </>
        )}

        {screen === 'food' && (
          <>
            <BackBar label="外送點餐" onBack={() => setScreen('home')} isMobile={isMobile} />
            <div className="space-y-2 mt-2">
              {FOOD_MENU.map((item, i) => (
                <button
                  key={i}
                  onClick={() => handleOrderFood(i)}
                  className="w-full bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl px-3 py-2 flex items-center justify-between transition-colors"
                  style={{ minHeight: isMobile ? 56 : undefined }}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{item.emoji}</span>
                    <div className="text-left">
                      <div className="text-xs text-white font-mono">{item.name}</div>
                      <div className="text-[10px] text-white/40">${item.price}</div>
                    </div>
                  </div>
                  {orderedFood === i ? (
                    <span className="text-green-400 text-[10px]">✓ 已點</span>
                  ) : (
                    <span className="text-amber-400 text-[10px]">點餐</span>
                  )}
                </button>
              ))}
            </div>
          </>
        )}

        {screen === 'drone' && (
          <>
            <BackBar label="無人機控制" onBack={() => setScreen('home')} isMobile={isMobile} />
            <div className="mt-3 space-y-3">
              {/* Status */}
              <div className="bg-black/40 border border-cyan-900/40 rounded-xl p-3 font-mono text-xs space-y-1.5">
                <div className="text-cyan-400 text-[10px] uppercase tracking-wider mb-1">Ardupilot 狀態</div>
                <StatusRow label="狀態" value={drone.active ? '飛行中' : '待機'} color={drone.active ? '#00ff88' : '#aaa'} />
                <StatusRow label="高度" value={`${Math.round(drone.altitude)} m`} color="#00e5ff" />
                <StatusRow label="電量" value={`${Math.round(drone.battery)}%`} color={drone.battery > 20 ? '#ffd700' : '#ff4444'} />
                <StatusRow label="訊號" value={`${Math.round(drone.signal)}%`} color={drone.signal > 50 ? '#00ff88' : '#ff4444'} />
              </div>

              {/* Controls */}
              <div className="grid grid-cols-3 gap-1.5">
                {!drone.active ? (
                  <button
                    onClick={onLaunchDrone}
                    className="col-span-3 bg-cyan-900/40 hover:bg-cyan-800/50 border border-cyan-600/40 rounded-xl py-2 text-cyan-300 font-mono text-sm transition-colors"
                    style={{ minHeight: isMobile ? 52 : undefined }}
                  >
                    🚀 起飛
                  </button>
                ) : (
                  <>
                    <button
                      onClick={onLandDrone}
                      className="col-span-1 bg-red-900/40 hover:bg-red-800/50 border border-red-600/40 rounded-xl py-2 text-red-300 font-mono text-xs transition-colors"
                      style={{ minHeight: isMobile ? 52 : undefined }}
                    >
                      ↓ 降落
                    </button>
                    <button
                      onClick={onRTLDrone}
                      className="col-span-2 bg-orange-900/40 hover:bg-orange-800/50 border border-orange-600/40 rounded-xl py-2 text-orange-300 font-mono text-xs transition-colors"
                      style={{ minHeight: isMobile ? 52 : undefined }}
                    >
                      🏠 RTL 返航
                    </button>
                  </>
                )}
              </div>

              {/* Keyboard hint — desktop only */}
              {drone.active && !isMobile && (
                <div className="bg-black/30 border border-white/5 rounded-xl p-2 text-[9px] text-white/30 font-mono space-y-0.5">
                  <div className="text-white/50 text-[10px] mb-1">飛行控制 (鍵盤)</div>
                  <div>Space/E → 油門上升　Q → 油門下降</div>
                  <div>WASD → 方向　Z/X → 偏航轉向</div>
                  <div className="border-t border-white/5 mt-1 pt-1">
                    Shift → 加速　R → 重生　Tab → FPV切換
                  </div>
                </div>
              )}

              {/* Race Mode section */}
              <div className="border-t border-white/10 pt-3">
                <div className="text-[10px] font-mono text-white/50 uppercase tracking-wider mb-2">🏁 穿越機賽道</div>

                {raceSession && raceSession.phase !== 'idle' ? (
                  // Active race — show exit button
                  <div className="space-y-2">
                    <div className="bg-black/30 border border-purple-900/40 rounded-xl p-2 text-[10px] font-mono space-y-1">
                      <div className="text-purple-300">賽道進行中...</div>
                      <div className="text-white/50">Phase: {raceSession.phase}</div>
                      <div className="text-white/50">圈數: {raceSession.currentLap}/{raceSession.totalLaps}</div>
                    </div>
                    <button
                      onClick={() => { onExitRace(); onClose(); }}
                      className="w-full bg-red-900/40 hover:bg-red-800/50 border border-red-600/40 rounded-xl py-2 text-red-300 font-mono text-xs transition-colors"
                      style={{ minHeight: isMobile ? 48 : undefined }}
                    >
                      ⏹ 退出賽道
                    </button>
                  </div>
                ) : (
                  // Course selection
                  <div className="space-y-1.5">
                    {ALL_COURSES.map(course => {
                      const bestKey = `race_best_${course.id}`;
                      const best = typeof window !== 'undefined' ? localStorage.getItem(bestKey) : null;
                      return (
                        <button
                          key={course.id}
                          onClick={() => { onStartRace(course.id); onClose(); }}
                          className="w-full text-left bg-black/20 hover:bg-black/40 border border-white/10 rounded-xl px-3 py-2 transition-colors"
                          style={{
                            minHeight: isMobile ? 56 : undefined,
                            borderColor: course.color + '40',
                          }}
                        >
                          <div className="flex justify-between items-start">
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-mono" style={{ color: course.color }}>
                                {course.name}
                              </div>
                              <div className="text-[9px] text-white/40 truncate mt-0.5">
                                {course.description}
                              </div>
                              <div className="text-[9px] text-white/30 mt-0.5">
                                {course.gates.length} gates · {course.totalLaps} lap{course.totalLaps > 1 ? 's' : ''} · {course.difficulty}
                              </div>
                            </div>
                            <div className="ml-2 text-right shrink-0">
                              {best ? (
                                <div className="text-[9px] font-mono text-green-400">{formatRaceTime(parseFloat(best))}</div>
                              ) : (
                                <div className="text-[9px] text-white/20 font-mono">--:--.---</div>
                              )}
                              <div className="text-[9px] text-white/30 mt-0.5">›</div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {screen === 'calls' && (
          <>
            <BackBar label="通訊紀錄" onBack={() => setScreen('home')} isMobile={isMobile} />
            {callLog.length === 0 ? (
              <div className="text-center text-white/30 text-xs font-mono mt-8">尚無通話紀錄</div>
            ) : (
              <div
                className="mt-2 space-y-1.5 overflow-y-auto pr-0.5"
                style={{ maxHeight: isMobile ? '50vh' : 260 }}
              >
                {[...callLog].reverse().map(r => (
                  <CallRow key={r.id} record={r} />
                ))}
              </div>
            )}
          </>
        )}
      </>
    );
  }

  // ── Mobile: bottom-sheet ───────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          maxHeight: '90dvh',
          zIndex: 50,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Sheet panel */}
        <div
          style={{
            background: '#0d0d1a',
            borderTop: '1px solid rgba(255,255,255,0.12)',
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            maxHeight: '90dvh',
          }}
        >
          {/* Drag handle */}
          <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px', flexShrink: 0 }}>
            <div style={{ width: 40, height: 4, background: 'rgba(255,255,255,0.2)', borderRadius: 2 }} />
          </div>

          {/* Header row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 16px 8px', flexShrink: 0 }}>
            <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, fontFamily: 'monospace' }}>城市服務</span>
            <button
              onClick={onClose}
              aria-label="關閉"
              style={{
                minWidth: 44,
                minHeight: 44,
                background: 'rgba(255,255,255,0.1)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 10,
                color: '#fff',
                fontSize: 16,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              ✕
            </button>
          </div>

          {/* Scrollable screen content */}
          <div
            style={{
              overflowY: 'auto',
              flex: 1,
              padding: '0 16px',
              paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
            }}
          >
            {renderScreenContent()}
          </div>
        </div>
      </div>
    );
  }

  // ── Desktop: centered modal with phone frame ───────────────────────────────
  return (
    <div
      className="absolute inset-0 flex items-center justify-center z-50"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Phone frame */}
      <div className="relative w-64 bg-[#0d0d1a] border border-white/15 rounded-3xl shadow-2xl overflow-hidden"
        style={{ boxShadow: '0 0 40px rgba(0,200,255,0.15)' }}
      >
        {/* Notch */}
        <div className="bg-black h-6 flex items-center justify-center">
          <div className="w-16 h-1.5 bg-white/10 rounded-full" />
        </div>

        {/* Status bar */}
        <div className="flex justify-between items-center px-4 py-1 text-[9px] font-mono text-white/40">
          <span>09:41</span>
          <span className="flex gap-1">
            <span>📶</span>
            <span>🔋{Math.round(drone.battery)}%</span>
          </span>
        </div>

        {/* Screen content */}
        <div className="px-3 pb-4" style={{ minHeight: 320 }}>
          {renderScreenContent()}
        </div>

        {/* Home indicator */}
        <div className="flex justify-center pb-2">
          <div className="w-20 h-1 bg-white/15 rounded-full" />
        </div>

        {/* Close X */}
        <button
          onClick={onClose}
          className="absolute top-8 right-3 w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-white/50 text-xs hover:bg-white/20 transition-colors"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

function AppButton({ emoji, label, sublabel, color, borderColor, onClick, isMobile }: {
  emoji: string; label: string; sublabel: string;
  color: string; borderColor: string; onClick: () => void; isMobile?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`bg-gradient-to-br ${color} border ${borderColor} rounded-2xl p-3 flex flex-col items-start gap-0.5 hover:brightness-125 transition-all active:scale-95`}
      style={{ minHeight: isMobile ? 64 : undefined }}
    >
      <span className="text-2xl">{emoji}</span>
      <span className="text-white font-mono text-xs leading-tight">{label}</span>
      <span className="text-white/40 text-[9px] leading-tight">{sublabel}</span>
    </button>
  );
}

function BackBar({ label, onBack, isMobile }: { label: string; onBack: () => void; isMobile?: boolean }) {
  return (
    <div className="flex items-center gap-2 mb-1">
      <button
        onClick={onBack}
        className="text-white/50 hover:text-white font-mono"
        style={{ minHeight: isMobile ? 44 : undefined, fontSize: 12 }}
      >
        ← 返回
      </button>
      <span className="text-white/60 font-mono text-xs">{label}</span>
    </div>
  );
}

function StatusRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-white/40">{label}</span>
      <span style={{ color }}>{value}</span>
    </div>
  );
}

const STATUS_COLOR: Record<string, string> = {
  called: '#ffd700',
  arrived: '#00ff88',
  completed: '#888888',
  cancelled: '#ff4444',
};

const STATUS_LABEL: Record<string, string> = {
  called: '已呼叫',
  arrived: '已抵達',
  completed: '完成',
  cancelled: '已取消',
};

function CallRow({ record }: { record: CallRecord }) {
  const time = new Date(record.calledAt).toLocaleTimeString('zh-TW', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="bg-white/5 border border-white/10 rounded-lg px-2.5 py-2 flex items-center justify-between gap-2">
      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
        <span className="text-white text-[10px] font-mono truncate">{record.label}</span>
        <span className="text-white/30 text-[9px] font-mono">{time}</span>
      </div>
      <span
        className="text-[9px] font-mono shrink-0"
        style={{ color: STATUS_COLOR[record.status] ?? '#888' }}
      >
        {STATUS_LABEL[record.status] ?? record.status}
      </span>
    </div>
  );
}
