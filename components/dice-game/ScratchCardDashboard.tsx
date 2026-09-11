'use client'

import { useState } from 'react'
import { useScratchCardStore } from '@/store/useScratchCardStore'
import { RTP_PRESETS } from '@/lib/scratch-card/config'
import { getPrizePoolSummary } from '@/lib/scratch-card/prizePool'

const SIM_COUNTS = [100, 500, 1000, 5000, 10000] as const

function StatCard({
  label,
  value,
  sub,
  color,
}: {
  label: string
  value: string
  sub?: string
  color?: 'emerald' | 'rose' | 'amber' | 'white'
}) {
  const textColor =
    color === 'emerald'
      ? 'text-emerald-400'
      : color === 'rose'
        ? 'text-rose-400'
        : color === 'amber'
          ? 'text-amber-400'
          : 'text-white'
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="text-[10px] text-white/40">{label}</div>
      <div className={`text-sm font-bold ${textColor}`}>{value}</div>
      {sub && <div className="text-[10px] text-white/30">{sub}</div>}
    </div>
  )
}

function Bar({ pct, color = 'bg-amber-500' }: { pct: number; color?: string }) {
  return (
    <div className="flex-1 bg-white/10 rounded-full h-1.5 overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-500 ${color}`}
        style={{ width: `${Math.min(100, pct * 100).toFixed(1)}%` }}
      />
    </div>
  )
}

export default function ScratchCardDashboard() {
  const engineConfig = useScratchCardStore(s => s.engineConfig)
  const snapshot = useScratchCardStore(s => s.snapshot)
  const streakState = useScratchCardStore(s => s.streakState)
  const prizePoolState = useScratchCardStore(s => s.prizePoolState)
  const lastSimulation = useScratchCardStore(s => s.lastSimulation)
  const setTargetRTP = useScratchCardStore(s => s.setTargetRTP)
  const resetSession = useScratchCardStore(s => s.resetSession)
  const runSim = useScratchCardStore(s => s.runSimulation)
  const weightVector = useScratchCardStore(s => s.weightVector)
  const noWinWeight = useScratchCardStore(s => s.noWinWeight)

  const [simCount, setSimCount] = useState<number>(1000)
  const [simRunning, setSimRunning] = useState(false)

  const prizes = engineConfig.prizes.filter(p => p.enabled)
  const poolSummary = getPrizePoolSummary(prizePoolState, prizes)

  const totalWeight = weightVector.weights.reduce((a, b) => a + b, 0) + noWinWeight
  const currentRTP = snapshot?.currentRTP ?? 0
  const targetRTP = engineConfig.targetRTP

  async function handleSimulate() {
    setSimRunning(true)
    await new Promise(r => setTimeout(r, 0))
    runSim(simCount)
    setSimRunning(false)
  }

  return (
    <div className="flex flex-col gap-3 mt-2">

      {/* ── Section A: RTP Target Selector ────────────────────────────────── */}
      <div className="bg-white/5 rounded-xl border border-white/10 p-3 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-white">目標 RTP</span>
          <button
            onClick={resetSession}
            className="text-[10px] text-white/40 hover:text-white/70 transition-colors px-2 py-0.5 rounded border border-white/10 hover:border-white/30"
          >
            重置統計
          </button>
        </div>
        <div className="flex gap-1 flex-wrap">
          {RTP_PRESETS.map(rtp => (
            <button
              key={rtp}
              onClick={() => setTargetRTP(rtp)}
              className={[
                'px-3 h-7 rounded-lg text-xs font-bold border transition-all',
                engineConfig.targetRTP === rtp
                  ? 'bg-amber-500 border-amber-400 text-black'
                  : 'bg-white/10 border-white/20 text-white/60 hover:bg-white/20',
              ].join(' ')}
            >
              {(rtp * 100).toFixed(0)}%
            </button>
          ))}
        </div>
        <div className="text-[10px] text-white/30">
          票價 {engineConfig.ticketPrice} 幣 × {(targetRTP * 100).toFixed(0)}% = 期望獎額{' '}
          <span className="text-amber-400 font-bold">
            {(engineConfig.ticketPrice * targetRTP).toFixed(1)} 幣
          </span>
        </div>
      </div>

      {/* ── Section B: Live Statistics ─────────────────────────────────────── */}
      {snapshot && snapshot.totalDraws > 0 && (
        <div className="bg-white/5 rounded-xl border border-white/10 p-3 flex flex-col gap-3">
          <span className="text-xs font-bold text-white">即時統計</span>
          <div className="grid grid-cols-3 gap-2">
            <StatCard label="總收入" value={`${snapshot.totalSpent.toLocaleString()}`} sub="幣" />
            <StatCard
              label="總支出"
              value={`${snapshot.totalWon.toLocaleString()}`}
              sub="幣"
              color="emerald"
            />
            <StatCard
              label="毛利"
              value={`${snapshot.netPnL >= 0 ? '+' : ''}${snapshot.netPnL.toLocaleString()}`}
              sub="幣"
              color={snapshot.netPnL >= 0 ? 'emerald' : 'rose'}
            />
            <StatCard
              label="即時RTP"
              value={`${(currentRTP * 100).toFixed(2)}%`}
              color={currentRTP >= targetRTP - 0.02 ? 'emerald' : 'amber'}
            />
            <StatCard
              label="目標RTP"
              value={`${(targetRTP * 100).toFixed(0)}%`}
              color="amber"
            />
            <StatCard
              label="中獎率"
              value={`${(snapshot.winRate * 100).toFixed(1)}%`}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <StatCard
              label="ROI"
              value={`${(snapshot.roi * 100).toFixed(1)}%`}
              color={snapshot.roi >= 0 ? 'emerald' : 'rose'}
            />
            <StatCard label="平均獎額/抽" value={`${snapshot.avgPayout.toFixed(1)} 幣`} />
            <StatCard label="標準差" value={snapshot.stdDeviation.toFixed(1)} />
            <StatCard label="總抽數" value={snapshot.totalDraws.toLocaleString()} />
          </div>
        </div>
      )}

      {/* ── Section C: Rolling RTP Bars ───────────────────────────────────── */}
      {snapshot && snapshot.totalDraws > 0 && (
        <div className="bg-white/5 rounded-xl border border-white/10 p-3 flex flex-col gap-2">
          <span className="text-xs font-bold text-white">Rolling RTP</span>
          {engineConfig.statsWindows.map(w => {
            const rtp = snapshot.rollingRTPs[w] ?? 0
            const filled = (snapshot.totalDraws >= w ? 1 : snapshot.totalDraws / w)
            return (
              <div key={w} className="flex items-center gap-2">
                <div className="text-[10px] text-white/40 w-14 shrink-0">最近 {w} 抽</div>
                <Bar
                  pct={rtp}
                  color={rtp >= targetRTP - 0.05 ? 'bg-emerald-500' : 'bg-amber-500'}
                />
                <div className="text-[10px] text-white/60 w-12 text-right">
                  {filled < 1 ? (
                    <span className="text-white/30">資料不足</span>
                  ) : (
                    `${(rtp * 100).toFixed(1)}%`
                  )}
                </div>
              </div>
            )
          })}
          <div className="flex items-center gap-2 mt-1 pt-2 border-t border-white/10">
            <div className="text-[10px] text-white/40 w-14 shrink-0">目標 RTP</div>
            <Bar pct={targetRTP} color="bg-white/30" />
            <div className="text-[10px] text-white/60 w-12 text-right">
              {(targetRTP * 100).toFixed(0)}%
            </div>
          </div>
        </div>
      )}

      {/* ── Section D: Prize Distribution ─────────────────────────────────── */}
      {snapshot && snapshot.totalDraws > 0 && (
        <div className="bg-white/5 rounded-xl border border-white/10 p-3 flex flex-col gap-2">
          <span className="text-xs font-bold text-white">獎項分布</span>
          {prizes.map((prize, i) => {
            const count = snapshot.prizeDistribution[prize.amount] ?? 0
            const pct = snapshot.totalDraws > 0 ? count / snapshot.totalDraws : 0
            const w = weightVector.weights[i] ?? 0
            const probPct = totalWeight > 0 ? (w / totalWeight) * 100 : 0
            return (
              <div key={prize.amount} className="flex items-center gap-2">
                <div className="text-[10px] font-bold text-amber-400 w-8 text-right">
                  {prize.amount}
                </div>
                <Bar pct={pct} color="bg-amber-500/70" />
                <div className="text-[10px] text-white/50 w-20 text-right">
                  {count} 張 ({(pct * 100).toFixed(1)}%)
                </div>
                <div className="text-[10px] text-white/20 w-14 text-right">
                  w:{probPct.toFixed(1)}%
                </div>
              </div>
            )
          })}
          {/* no-win row */}
          {(() => {
            const winCount = Object.values(snapshot.prizeDistribution).reduce((a, b) => a + b, 0)
            const noWinCount = snapshot.totalDraws - winCount
            const noWinPct = snapshot.totalDraws > 0 ? noWinCount / snapshot.totalDraws : 0
            const noWinProb = totalWeight > 0 ? (noWinWeight / totalWeight) * 100 : 0
            return (
              <div className="flex items-center gap-2 pt-1 border-t border-white/5">
                <div className="text-[10px] font-bold text-white/30 w-8 text-right">未中</div>
                <Bar pct={noWinPct} color="bg-white/20" />
                <div className="text-[10px] text-white/30 w-20 text-right">
                  {noWinCount} 張 ({(noWinPct * 100).toFixed(1)}%)
                </div>
                <div className="text-[10px] text-white/20 w-14 text-right">
                  w:{noWinProb.toFixed(1)}%
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {/* ── Section E: Anti-Streak Status ─────────────────────────────────── */}
      {snapshot && snapshot.totalDraws > 0 && (
        <div className="bg-white/5 rounded-xl border border-white/10 p-3 flex flex-col gap-2">
          <span className="text-xs font-bold text-white">Anti-Streak 狀態</span>
          <div className="grid grid-cols-1 gap-1">
            {prizes.map((prize, i) => {
              const streak = streakState.streakCounts[i] ?? 0
              const penalty = streakState.penaltyFactors[i] ?? 1
              const isWarning = streak >= engineConfig.antiStreak.maxSameStreak - 1
              const isPenalized = penalty < 0.99
              return (
                <div key={prize.amount} className="flex items-center gap-2 text-[10px]">
                  <span className="text-amber-400 font-bold w-8 text-right">{prize.amount}</span>
                  <span className="text-white/40 w-12">連串: {streak}</span>
                  <div className="flex-1 bg-white/5 rounded-full h-1 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${isWarning ? 'bg-rose-400' : 'bg-white/20'}`}
                      style={{
                        width: `${Math.min(100, (streak / engineConfig.antiStreak.maxSameStreak) * 100)}%`,
                      }}
                    />
                  </div>
                  <span className={isPenalized ? 'text-rose-400' : 'text-white/20'}>
                    pf:{penalty.toFixed(2)}
                  </span>
                </div>
              )
            })}
            {/* no-win streak */}
            {(() => {
              const i = prizes.length
              const streak = streakState.streakCounts[i] ?? 0
              const penalty = streakState.penaltyFactors[i] ?? 1
              return (
                <div className="flex items-center gap-2 text-[10px] pt-1 border-t border-white/5">
                  <span className="text-white/30 font-bold w-8 text-right">未中</span>
                  <span className="text-white/30 w-12">連串: {streak}</span>
                  <div className="flex-1 bg-white/5 rounded-full h-1 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-white/10 transition-all"
                      style={{
                        width: `${Math.min(100, (streak / engineConfig.antiStreak.maxSameStreak) * 100)}%`,
                      }}
                    />
                  </div>
                  <span className="text-white/20">pf:{penalty.toFixed(2)}</span>
                </div>
              )
            })()}
          </div>
        </div>
      )}

      {/* ── Section F: Simulation ─────────────────────────────────────────── */}
      <div className="bg-white/5 rounded-xl border border-white/10 p-3 flex flex-col gap-3">
        <span className="text-xs font-bold text-white">模擬驗證</span>
        <div>
          <div className="text-[10px] text-white/40 mb-1">模擬抽數</div>
          <div className="flex gap-1 flex-wrap">
            {SIM_COUNTS.map(n => (
              <button
                key={n}
                onClick={() => setSimCount(n)}
                disabled={simRunning}
                className={[
                  'px-3 h-7 rounded-lg text-xs font-bold border transition-all',
                  simCount === n
                    ? 'bg-purple-600 border-purple-400 text-white'
                    : 'bg-white/10 border-white/20 text-white/60 hover:bg-white/20',
                  simRunning ? 'opacity-40 cursor-not-allowed' : '',
                ].join(' ')}
              >
                {n.toLocaleString()}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={handleSimulate}
          disabled={simRunning}
          className={[
            'w-full py-2 rounded-xl font-bold text-sm transition-all',
            simRunning
              ? 'bg-white/10 text-white/30 cursor-not-allowed'
              : 'bg-gradient-to-r from-purple-600 to-violet-600 text-white shadow-lg shadow-purple-500/20',
          ].join(' ')}
        >
          {simRunning ? '模擬中…' : `執行 ${simCount.toLocaleString()} 抽模擬`}
        </button>

        {lastSimulation && (
          <div className="flex flex-col gap-2 pt-2 border-t border-white/10">
            <div className="text-[10px] text-white/40">
              模擬結果（{lastSimulation.draws.toLocaleString()} 抽 ×{' '}
              {(lastSimulation.config.targetRTP * 100).toFixed(0)}% 目標 RTP）
            </div>
            <div className="grid grid-cols-3 gap-2">
              <StatCard
                label="實際RTP"
                value={`${(lastSimulation.actualRTP * 100).toFixed(2)}%`}
                color={
                  Math.abs(lastSimulation.actualRTP - lastSimulation.config.targetRTP) <= 0.03
                    ? 'emerald'
                    : 'amber'
                }
              />
              <StatCard
                label="中獎率"
                value={`${(lastSimulation.winRate * 100).toFixed(1)}%`}
              />
              <StatCard
                label="偏差"
                value={`${((lastSimulation.actualRTP - lastSimulation.config.targetRTP) * 100).toFixed(2)}%`}
                color={
                  Math.abs(lastSimulation.actualRTP - lastSimulation.config.targetRTP) <= 0.02
                    ? 'emerald'
                    : 'rose'
                }
              />
              <StatCard label="變異數" value={lastSimulation.variance.toFixed(0)} />
              <StatCard label="標準差" value={lastSimulation.stdDeviation.toFixed(1)} />
            </div>
            {/* Percentiles */}
            <div className="bg-white/5 rounded-lg p-2 flex justify-around text-[10px]">
              {(['p5', 'p25', 'p50', 'p75', 'p95'] as const).map(k => (
                <div key={k} className="flex flex-col items-center">
                  <span className="text-white/30">{k}</span>
                  <span className="text-white/70 font-bold">{lastSimulation.percentiles[k]}</span>
                </div>
              ))}
            </div>
            {/* Prize distribution */}
            <div className="flex flex-col gap-1">
              {Object.entries(lastSimulation.prizeDistribution)
                .sort(([a], [b]) => Number(a) - Number(b))
                .map(([amount, count]) => {
                  const pct = lastSimulation.draws > 0 ? count / lastSimulation.draws : 0
                  return (
                    <div key={amount} className="flex items-center gap-2 text-[10px]">
                      <span className="text-amber-400 font-bold w-8 text-right">{amount}</span>
                      <Bar pct={pct} color="bg-amber-500/50" />
                      <span className="text-white/40 w-20 text-right">
                        {count} ({(pct * 100).toFixed(1)}%)
                      </span>
                    </div>
                  )
                })}
            </div>
            {/* Rolling RTP sparkline */}
            {lastSimulation.rollingRTPCurve.length > 0 && (
              <div className="flex flex-col gap-1">
                <div className="text-[10px] text-white/30">
                  Rolling RTP 趨勢（前 {lastSimulation.config.statsWindows[0]} 抽窗口）
                </div>
                <div className="flex items-end gap-px h-8">
                  {lastSimulation.rollingRTPCurve.map((rtp, i) => {
                    const h = Math.max(2, Math.min(100, rtp * 100))
                    const isGood = Math.abs(rtp - targetRTP) <= 0.05
                    return (
                      <div
                        key={i}
                        className={`flex-1 rounded-sm ${isGood ? 'bg-emerald-500/60' : 'bg-amber-500/60'}`}
                        style={{ height: `${h}%` }}
                        title={`${(rtp * 100).toFixed(1)}%`}
                      />
                    )
                  })}
                </div>
                <div className="flex justify-between text-[9px] text-white/20">
                  <span>開始</span>
                  <span className="text-amber-400/60">目標 {(targetRTP * 100).toFixed(0)}%</span>
                  <span>結束</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Section G: Prize Pool (finite mode only) ──────────────────────── */}
      {engineConfig.prizePool.mode === 'finite' && (
        <div className="bg-white/5 rounded-xl border border-white/10 p-3 flex flex-col gap-2">
          <span className="text-xs font-bold text-white">獎池狀態（有限模式）</span>
          <div className="grid grid-cols-4 gap-1 text-[10px] text-white/30 pb-1 border-b border-white/10">
            <span>獎項</span>
            <span className="text-right">總數</span>
            <span className="text-right">剩餘</span>
            <span className="text-right">剩餘%</span>
          </div>
          {poolSummary.map(item => (
            <div key={item.amount} className="grid grid-cols-4 gap-1 text-[10px]">
              <span className="text-amber-400 font-bold">{item.amount}</span>
              <span className="text-white/60 text-right">
                {item.total === 'unlimited' ? '∞' : item.total}
              </span>
              <span className="text-white/60 text-right">
                {item.remaining === 'unlimited' ? '∞' : item.remaining}
              </span>
              <span
                className={
                  item.pct > 0.5
                    ? 'text-emerald-400 text-right'
                    : item.pct > 0.2
                      ? 'text-amber-400 text-right'
                      : 'text-rose-400 text-right'
                }
              >
                {item.pct === 1 && item.total === 'unlimited'
                  ? '∞'
                  : `${(item.pct * 100).toFixed(0)}%`}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
