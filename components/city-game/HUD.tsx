'use client';
import { HUDData, VehicleType, OrderStatus } from './types';

const vehicleLabel: Record<VehicleType, string> = {
  [VehicleType.CAR]: '🚗 轎車',
  [VehicleType.TAXI]: '🚕 計程車',
  [VehicleType.DELIVERY_SCOOTER]: '📦 外送機車',
  [VehicleType.HELICOPTER]: '🚁 直升機',
  [VehicleType.RC_DRONE]: '🚁 無人機',
  [VehicleType.NPC_CAR]: '🚗 車輛',
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
  mapExpanded?: boolean;
}

export default function HUD({ data, onPhone }: Props) {
  const { speedKMH, playerState, vehicleType, orders, drone, zone, playerX, playerY, notifications, vehicleAltitude } = data;

  const activeOrders = orders.filter(o => o.status !== 'completed');

  return (
    <>
      {/* Top-left: vehicle / state info */}
      <div className="absolute top-3 left-3 flex flex-col gap-1 pointer-events-none">
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

      {/* Bottom-left: controls hint */}
      <div className="absolute bottom-3 left-3 pointer-events-none">
        <div className="bg-black/60 backdrop-blur border border-white/10 rounded-lg px-3 py-2 text-[10px] text-white/40 font-mono flex gap-3">
          <span><kbd className="text-white/60">WASD</kbd> 移動</span>
          <span><kbd className="text-white/60">F</kbd> 上/下車</span>
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

      {/* Bottom-center: coordinates + zone */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 pointer-events-none">
        <div className="bg-black/60 backdrop-blur border border-white/10 rounded-lg px-3 py-1 text-[10px] text-white/40 font-mono text-center">
          <span className="text-white/60">{zone}</span>
          <span className="mx-2 text-white/20">|</span>
          X:{playerX} Y:{playerY}
        </div>
      </div>

      {/* Bottom-right: active orders */}
      {activeOrders.length > 0 && (
        <div className="absolute bottom-12 right-3 flex flex-col gap-1 pointer-events-none">
          {activeOrders.map(order => (
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
          ))}
        </div>
      )}

      {/* Notifications — top-right, slide in, auto-expire */}
      <div className="absolute top-16 right-3 flex flex-col items-end gap-1.5 pointer-events-none" style={{ maxWidth: 280 }}>
        {notifications.slice(-4).map(n => (
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

      {/* Phone button (floating) */}
      <button
        onClick={onPhone}
        className="absolute bottom-3 right-3 w-10 h-10 bg-black/70 backdrop-blur border border-white/20 rounded-full flex items-center justify-center text-lg hover:border-amber-400/50 hover:bg-amber-950/30 transition-colors"
        title="手機 (P)"
      >
        📱
      </button>
    </>
  );
}
