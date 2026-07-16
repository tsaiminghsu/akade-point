'use client'
import { useState, useRef, useEffect, useCallback } from 'react'

// ─── Types ───────────────────────────────────────────────────────────────────

type FillMode =
  | { type: 'random' }
  | { type: 'fixed'; cells: number[] }           // length 9, values 1-9
  | { type: 'guaranteed'; prizePositions: number[] } // positions 1-9

type ConditionType =
  | { type: 'none' }
  | { type: 'anyPrize' }
  | { type: 'allPrize' }
  | { type: 'countPrize'; min: number }

interface RuleStep {
  positions: number[]      // 1-9
  condition: ConditionType // condition based on previous step's revealed cells
  stopIfFail: boolean
}

interface ScratchTemplate {
  id: string
  prizeNumbers: number[]   // which values 1-9 are prizes
  winCondition: number     // how many prize-number cells needed to win
  prizeMultiplier: number  // winAmount = denomination * multiplier
  fillMode: FillMode
  rule: RuleStep[]
}

type Denomination = 20 | 40 | 60 | 80 | 120 | 160

interface CardConfig {
  serialId: string
  templateId: string
}

// Generated card state
interface CardCell {
  position: number  // 1-9
  value: number     // 1-9
  isPrize: boolean
  revealed: boolean
  stopped: boolean  // rule stopped here
}

interface CardResult {
  serialId: string
  templateId: string
  cells: CardCell[]
  won: boolean
  winAmount: number
  prizeCount: number
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DENOMINATIONS: Denomination[] = [20, 40, 60, 80, 120, 160]
const DEFAULT_MULTIPLIERS: Record<number, number> = { 20: 3, 40: 3, 60: 2.5, 80: 2.5, 120: 2, 160: 2 }

function makeDefaultTemplate(id: string): ScratchTemplate {
  return {
    id,
    prizeNumbers: [7, 8, 9],
    winCondition: 3,
    prizeMultiplier: 3,
    fillMode: { type: 'random' },
    rule: [{ positions: [1, 2, 3, 4, 5, 6, 7, 8, 9], condition: { type: 'none' }, stopIfFail: false }],
  }
}

// ─── Cell Generation ─────────────────────────────────────────────────────────

function generateCells(template: ScratchTemplate): CardCell[] {
  const { prizeNumbers, fillMode } = template
  const nonPrize = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter(n => !prizeNumbers.includes(n))
  const randPrize = () => prizeNumbers[Math.floor(Math.random() * prizeNumbers.length)]
  const randNon   = () => nonPrize.length > 0 ? nonPrize[Math.floor(Math.random() * nonPrize.length)] : (Math.floor(Math.random() * 9) + 1)

  let values: number[]

  if (fillMode.type === 'fixed') {
    values = fillMode.cells.slice(0, 9).map(v => Math.max(1, Math.min(9, v || 1)))
    while (values.length < 9) values.push(1)
  } else if (fillMode.type === 'guaranteed') {
    const prizePosSet = new Set(fillMode.prizePositions)
    values = Array.from({ length: 9 }, (_, i) =>
      prizePosSet.has(i + 1) ? randPrize() : randNon()
    )
  } else {
    // random
    values = Array.from({ length: 9 }, () => Math.floor(Math.random() * 9) + 1)
  }

  return values.map((value, i) => ({
    position: i + 1,
    value,
    isPrize: prizeNumbers.includes(value),
    revealed: false,
    stopped: false,
  }))
}

function evaluateCards(cards: CardResult[], templates: ScratchTemplate[], denomination: Denomination): CardResult[] {
  return cards.map(card => {
    const tmpl = templates.find(t => t.id === card.templateId)
    if (!tmpl) return card
    const prizeCount = card.cells.filter(c => c.revealed && c.isPrize).length
    const won = prizeCount >= tmpl.winCondition
    const winAmount = won ? denomination * tmpl.prizeMultiplier : 0
    return { ...card, won, winAmount, prizeCount }
  })
}

// ─── Simulate rule steps on a card ───────────────────────────────────────────

function simulateCard(cells: CardCell[], rule: RuleStep[]): CardCell[] {
  const result = cells.map(c => ({ ...c, revealed: false, stopped: false }))
  let prevRevealedPositions: number[] = []

  for (let si = 0; si < rule.length; si++) {
    const step = rule[si]

    // Check condition against previous step's revealed cells
    if (si > 0 && step.condition.type !== 'none') {
      const prevCells = result.filter(c => prevRevealedPositions.includes(c.position))
      const prevPrizeCount = prevCells.filter(c => c.isPrize).length
      let condMet = false

      if (step.condition.type === 'anyPrize') condMet = prevPrizeCount >= 1
      else if (step.condition.type === 'allPrize') condMet = prevPrizeCount === prevCells.length
      else if (step.condition.type === 'countPrize') condMet = prevPrizeCount >= step.condition.min

      if (!condMet) {
        if (step.stopIfFail) {
          // Mark unscratched positions in this step as stopped
          step.positions.forEach(pos => {
            const cell = result.find(c => c.position === pos)
            if (cell && !cell.revealed) cell.stopped = true
          })
          break
        }
        continue
      }
    }

    // Reveal this step's positions
    step.positions.forEach(pos => {
      const cell = result.find(c => c.position === pos)
      if (cell) cell.revealed = true
    })
    prevRevealedPositions = step.positions
  }

  return result
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function CellGrid({
  cells,
  animatingPositions,
  compact = false,
}: {
  cells: CardCell[]
  animatingPositions?: Set<number>
  compact?: boolean
}) {
  const size = compact ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm'

  return (
    <div className="grid grid-cols-3 gap-0.5">
      {cells.map(cell => {
        const isAnimating = animatingPositions?.has(cell.position)
        return (
          <div
            key={cell.position}
            className={[
              size,
              'rounded flex items-center justify-center font-bold transition-all duration-200 relative overflow-hidden',
              cell.revealed
                ? cell.isPrize
                  ? 'bg-emerald-500/80 text-white shadow shadow-emerald-400/40'
                  : 'bg-white/20 text-white/70'
                : cell.stopped
                  ? 'bg-white/5 text-white/20'
                  : 'bg-white/10 text-white/0',
              isAnimating ? 'ring-2 ring-amber-400 scale-110' : '',
            ].join(' ')}
            style={{ transition: 'all 0.2s ease' }}
          >
            {cell.revealed && cell.value}
            {cell.stopped && <span className="text-white/20 text-lg">×</span>}
            {/* Silver coating overlay */}
            {!cell.revealed && !cell.stopped && (
              <div
                className="absolute inset-0 rounded"
                style={{
                  background: 'linear-gradient(135deg, #c0c0c0 0%, #a8a8a8 40%, #d0d0d0 60%, #b0b0b0 100%)',
                }}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Template Editor ─────────────────────────────────────────────────────────

function TemplateEditor({
  template,
  onChange,
  onDelete,
  canDelete,
}: {
  template: ScratchTemplate
  onChange: (t: ScratchTemplate) => void
  onDelete: () => void
  canDelete: boolean
}) {
  const [expanded, setExpanded] = useState(true)

  const togglePrize = (n: number) => {
    const next = template.prizeNumbers.includes(n)
      ? template.prizeNumbers.filter(x => x !== n)
      : [...template.prizeNumbers, n].sort((a, b) => a - b)
    onChange({ ...template, prizeNumbers: next })
  }

  const updateRule = (idx: number, step: RuleStep) => {
    const next = [...template.rule]
    next[idx] = step
    onChange({ ...template, rule: next })
  }

  const addStep = () => {
    onChange({
      ...template,
      rule: [...template.rule, { positions: [], condition: { type: 'none' }, stopIfFail: false }],
    })
  }

  const removeStep = (idx: number) => {
    onChange({ ...template, rule: template.rule.filter((_, i) => i !== idx) })
  }

  const togglePos = (step: RuleStep, pos: number): RuleStep => {
    const next = step.positions.includes(pos)
      ? step.positions.filter(p => p !== pos)
      : [...step.positions, pos].sort((a, b) => a - b)
    return { ...step, positions: next }
  }

  const updateFillFixed = (idx: number, val: number) => {
    if (template.fillMode.type !== 'fixed') return
    const cells = [...template.fillMode.cells]
    cells[idx] = Math.max(1, Math.min(9, val))
    onChange({ ...template, fillMode: { type: 'fixed', cells } })
  }

  const toggleGuaranteedPos = (pos: number) => {
    if (template.fillMode.type !== 'guaranteed') return
    const next = template.fillMode.prizePositions.includes(pos)
      ? template.fillMode.prizePositions.filter(p => p !== pos)
      : [...template.fillMode.prizePositions, pos].sort((a, b) => a - b)
    onChange({ ...template, fillMode: { type: 'guaranteed', prizePositions: next } })
  }

  return (
    <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2">
        <button onClick={() => setExpanded(e => !e)} className="flex-1 flex items-center gap-2 text-left">
          <span className="text-white font-bold text-sm">版型 {template.id}</span>
          <span className="text-white/40 text-xs">{expanded ? '▲' : '▼'}</span>
        </button>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-white/30">名稱:</span>
          <input
            value={template.id}
            onChange={e => onChange({ ...template, id: e.target.value })}
            className="w-12 bg-white/10 text-white text-xs rounded px-1.5 py-0.5 border border-white/20 focus:outline-none"
            maxLength={4}
          />
        </div>
        {canDelete && (
          <button onClick={onDelete} className="text-red-400/70 hover:text-red-400 text-sm px-1">✕</button>
        )}
      </div>

      {expanded && (
        <div className="px-3 pb-3 flex flex-col gap-3 border-t border-white/10 pt-3">
          {/* Prize numbers */}
          <div>
            <div className="text-[10px] text-white/40 mb-1">獎項數字（刮出這些數字算中獎格）</div>
            <div className="flex gap-1 flex-wrap">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                <button
                  key={n}
                  onClick={() => togglePrize(n)}
                  className={[
                    'w-7 h-7 rounded font-bold text-xs border transition-all',
                    template.prizeNumbers.includes(n)
                      ? 'bg-emerald-600 border-emerald-400 text-white'
                      : 'bg-white/10 border-white/20 text-white/50 hover:bg-white/20',
                  ].join(' ')}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Win condition */}
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="text-[10px] text-white/40 mb-1">中獎條件（刮出幾格獎項數字）</div>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5, 6].map(n => (
                  <button
                    key={n}
                    onClick={() => onChange({ ...template, winCondition: n })}
                    className={[
                      'w-7 h-7 rounded text-xs font-bold border transition-all',
                      template.winCondition === n
                        ? 'bg-purple-600 border-purple-400 text-white'
                        : 'bg-white/10 border-white/20 text-white/50 hover:bg-white/20',
                    ].join(' ')}
                  >
                    {n}
                  </button>
                ))}
                <span className="text-[10px] text-white/30 self-center ml-1">格</span>
              </div>
            </div>
            <div>
              <div className="text-[10px] text-white/40 mb-1">中獎倍率</div>
              <div className="flex gap-1">
                {[2, 2.5, 3, 5, 10].map(n => (
                  <button
                    key={n}
                    onClick={() => onChange({ ...template, prizeMultiplier: n })}
                    className={[
                      'px-2 h-7 rounded text-xs font-bold border transition-all',
                      template.prizeMultiplier === n
                        ? 'bg-amber-600 border-amber-400 text-white'
                        : 'bg-white/10 border-white/20 text-white/50 hover:bg-white/20',
                    ].join(' ')}
                  >
                    {n}×
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Fill mode */}
          <div>
            <div className="text-[10px] text-white/40 mb-1">格子填寫方式</div>
            <div className="flex gap-1 mb-2">
              {(['random', 'guaranteed', 'fixed'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => {
                    if (mode === 'random') onChange({ ...template, fillMode: { type: 'random' } })
                    else if (mode === 'guaranteed') onChange({ ...template, fillMode: { type: 'guaranteed', prizePositions: [] } })
                    else onChange({ ...template, fillMode: { type: 'fixed', cells: Array(9).fill(1) } })
                  }}
                  className={[
                    'px-2 h-7 rounded text-xs font-bold border transition-all',
                    template.fillMode.type === mode
                      ? 'bg-blue-600 border-blue-400 text-white'
                      : 'bg-white/10 border-white/20 text-white/50 hover:bg-white/20',
                  ].join(' ')}
                >
                  {mode === 'random' ? '隨機' : mode === 'guaranteed' ? '指定獎項格' : '固定填入'}
                </button>
              ))}
            </div>
            {template.fillMode.type === 'fixed' && (
              <div>
                <div className="text-[10px] text-white/30 mb-1">填入每格數字（1-9）：</div>
                <div className="grid grid-cols-3 gap-1">
                  {template.fillMode.cells.map((v, i) => (
                    <input
                      key={i}
                      type="number"
                      min={1}
                      max={9}
                      value={v}
                      onChange={e => updateFillFixed(i, parseInt(e.target.value) || 1)}
                      className="w-full bg-white/10 text-white text-xs text-center rounded px-1 py-1 border border-white/20 focus:outline-none focus:border-white/40"
                    />
                  ))}
                </div>
              </div>
            )}
            {template.fillMode.type === 'guaranteed' && (
              <div>
                <div className="text-[10px] text-white/30 mb-1">選擇必定出現獎項數字的格位：</div>
                <div className="grid grid-cols-9 gap-0.5">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(pos => (
                    <button
                      key={pos}
                      onClick={() => toggleGuaranteedPos(pos)}
                      className={[
                        'h-7 rounded text-xs font-bold border transition-all',
                        template.fillMode.type === 'guaranteed' && template.fillMode.prizePositions.includes(pos)
                          ? 'bg-emerald-600 border-emerald-400 text-white'
                          : 'bg-white/10 border-white/20 text-white/50 hover:bg-white/20',
                      ].join(' ')}
                    >
                      {pos}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Rule steps */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-white/40">刮開規則步驟</span>
              <button
                onClick={addStep}
                className="text-[10px] text-amber-400 hover:text-amber-300 bg-white/5 rounded px-2 py-0.5"
              >
                + 新增步驟
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {template.rule.map((step, si) => (
                <div key={si} className="bg-white/5 rounded-lg p-2 border border-white/10">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] text-amber-400/70 font-bold">步驟 {si + 1}</span>
                    {template.rule.length > 1 && (
                      <button onClick={() => removeStep(si)} className="text-red-400/60 hover:text-red-400 text-xs">✕</button>
                    )}
                  </div>

                  {/* Positions */}
                  <div className="text-[10px] text-white/30 mb-1">刮開格位：</div>
                  <div className="grid grid-cols-9 gap-0.5 mb-2">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(pos => (
                      <button
                        key={pos}
                        onClick={() => updateRule(si, togglePos(step, pos))}
                        className={[
                          'h-6 rounded text-[10px] font-bold border transition-all',
                          step.positions.includes(pos)
                            ? 'bg-amber-600 border-amber-400 text-white'
                            : 'bg-white/10 border-white/20 text-white/40 hover:bg-white/20',
                        ].join(' ')}
                      >
                        {pos}
                      </button>
                    ))}
                  </div>

                  {/* Condition (only for step > 0) */}
                  {si > 0 && (
                    <div>
                      <div className="text-[10px] text-white/30 mb-1">執行條件（依上一步刮出結果）：</div>
                      <div className="flex gap-1 flex-wrap mb-1">
                        {[
                          { type: 'none', label: '無條件' },
                          { type: 'anyPrize', label: '任一獎項' },
                          { type: 'allPrize', label: '全部獎項' },
                          { type: 'countPrize', label: '≥N格獎項' },
                        ].map(opt => (
                          <button
                            key={opt.type}
                            onClick={() => {
                              let cond: ConditionType = { type: 'none' }
                              if (opt.type === 'anyPrize') cond = { type: 'anyPrize' }
                              else if (opt.type === 'allPrize') cond = { type: 'allPrize' }
                              else if (opt.type === 'countPrize') cond = { type: 'countPrize', min: 2 }
                              updateRule(si, { ...step, condition: cond })
                            }}
                            className={[
                              'px-1.5 h-6 rounded text-[10px] font-bold border transition-all',
                              step.condition.type === opt.type
                                ? 'bg-purple-600 border-purple-400 text-white'
                                : 'bg-white/10 border-white/20 text-white/40 hover:bg-white/20',
                            ].join(' ')}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                      {step.condition.type === 'countPrize' && (
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] text-white/30">最少幾格：</span>
                          <div className="flex gap-1">
                            {[1, 2, 3, 4].map(n => (
                              <button
                                key={n}
                                onClick={() => updateRule(si, { ...step, condition: { type: 'countPrize', min: n } })}
                                className={[
                                  'w-6 h-6 rounded text-[10px] font-bold border transition-all',
                                  step.condition.type === 'countPrize' && step.condition.min === n
                                    ? 'bg-purple-600 border-purple-400 text-white'
                                    : 'bg-white/10 border-white/20 text-white/40',
                                ].join(' ')}
                              >
                                {n}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={step.stopIfFail}
                          onChange={e => updateRule(si, { ...step, stopIfFail: e.target.checked })}
                          className="w-3 h-3 accent-rose-500"
                        />
                        <span className="text-[10px] text-white/40">條件不符時停止後續步驟</span>
                      </label>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Card Result Display ──────────────────────────────────────────────────────

function CardResultView({
  card,
  denomination,
  animatingPositions,
}: {
  card: CardResult
  denomination: Denomination
  animatingPositions?: Set<number>
}) {
  return (
    <div className={[
      'rounded-xl border p-2.5 flex flex-col gap-1.5 min-w-[120px]',
      card.won ? 'bg-emerald-900/40 border-emerald-500/50' : 'bg-white/5 border-white/10',
    ].join(' ')}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-white/50 font-mono">#{card.serialId}</span>
        <span className="text-[10px] text-white/30">{card.templateId}</span>
      </div>
      <CellGrid cells={card.cells} animatingPositions={animatingPositions} compact />
      <div className="text-center">
        {card.won ? (
          <span className="text-emerald-400 text-xs font-bold">+{card.winAmount} 幣</span>
        ) : (
          <span className="text-white/25 text-[10px]">未中獎</span>
        )}
      </div>
    </div>
  )
}

// ─── Main ScratchCard Component ───────────────────────────────────────────────

export default function ScratchCard({
  credits,
  onCreditsChange,
}: {
  credits: number
  onCreditsChange: (c: number) => void
}) {
  const [templates, setTemplates] = useState<ScratchTemplate[]>([makeDefaultTemplate('A')])
  const [denomination, setDenomination] = useState<Denomination>(40)
  const [cardCount, setCardCount] = useState(5)
  const [cardConfigs, setCardConfigs] = useState<CardConfig[]>(
    Array.from({ length: 5 }, (_, i) => ({ serialId: String(i + 1), templateId: 'A' }))
  )
  const [results, setResults] = useState<CardResult[]>([])
  const [simRunning, setSimRunning] = useState(false)
  const [animStep, setAnimStep] = useState<{ cardIdx: number; positions: Set<number> } | null>(null)
  const simRef = useRef<boolean>(false)

  // Sync cardConfigs length when cardCount changes
  useEffect(() => {
    setCardConfigs(prev => {
      if (prev.length === cardCount) return prev
      if (prev.length < cardCount) {
        const extra = Array.from({ length: cardCount - prev.length }, (_, i) => ({
          serialId: String(prev.length + i + 1),
          templateId: templates[0]?.id ?? 'A',
        }))
        return [...prev, ...extra]
      }
      return prev.slice(0, cardCount)
    })
  }, [cardCount, templates])

  const addTemplate = () => {
    const ids = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    const existing = new Set(templates.map(t => t.id))
    const next = ids.split('').find(c => !existing.has(c)) ?? `T${templates.length}`
    setTemplates(prev => [...prev, makeDefaultTemplate(next)])
  }

  const totalCost = denomination * cardCount

  const runSimulation = useCallback(async () => {
    if (credits < totalCost) return

    let runningCredits = credits - totalCost
    onCreditsChange(runningCredits)
    simRef.current = true
    setSimRunning(true)
    setAnimStep(null)

    // Generate initial cards with final cell values pre-computed
    const initialCards: CardResult[] = cardConfigs.map(cfg => {
      const tmpl = templates.find(t => t.id === cfg.templateId) ?? templates[0]
      const cells = generateCells(tmpl)
      return { serialId: cfg.serialId, templateId: cfg.templateId, cells, won: false, winAmount: 0, prizeCount: 0 }
    })
    setResults(initialCards)

    // Animate each card sequentially
    for (let ci = 0; ci < initialCards.length; ci++) {
      if (!simRef.current) break
      const card = initialCards[ci]
      const tmpl = templates.find(t => t.id === card.templateId) ?? templates[0]

      let prevPositions: number[] = []
      let stopped = false

      for (let si = 0; si < tmpl.rule.length; si++) {
        if (!simRef.current || stopped) break
        const step = tmpl.rule[si]

        // Check condition against previous step's revealed cells
        if (si > 0 && step.condition.type !== 'none') {
          const prevCells = card.cells.filter(c => prevPositions.includes(c.position))
          const prevPrizeCount = prevCells.filter(c => c.isPrize).length
          let condMet = false
          if (step.condition.type === 'anyPrize') condMet = prevPrizeCount >= 1
          else if (step.condition.type === 'allPrize') condMet = prevPrizeCount === prevCells.length
          else if (step.condition.type === 'countPrize') condMet = prevPrizeCount >= step.condition.min

          if (!condMet) {
            if (step.stopIfFail) {
              stopped = true
              setResults(prev => prev.map((r, i) => {
                if (i !== ci) return r
                return { ...r, cells: r.cells.map(c => step.positions.includes(c.position) && !c.revealed ? { ...c, stopped: true } : c) }
              }))
            }
            continue
          }
        }

        // Animate highlight then reveal
        setAnimStep({ cardIdx: ci, positions: new Set(step.positions) })
        await new Promise(r => setTimeout(r, 400))

        // Reveal positions on the mutable card copy too (for condition checking)
        step.positions.forEach(pos => {
          const cell = card.cells.find(c => c.position === pos)
          if (cell) cell.revealed = true
        })
        setResults(prev => prev.map((r, i) => {
          if (i !== ci) return r
          return { ...r, cells: r.cells.map(c => step.positions.includes(c.position) ? { ...c, revealed: true } : c) }
        }))
        prevPositions = step.positions
        await new Promise(r => setTimeout(r, 200))
      }

      setAnimStep(null)

      // Compute final win for this card
      const prizeCount = card.cells.filter(c => c.revealed && c.isPrize).length
      const won = prizeCount >= tmpl.winCondition
      const winAmount = won ? denomination * tmpl.prizeMultiplier : 0
      if (winAmount > 0) {
        runningCredits += winAmount
        onCreditsChange(runningCredits)
      }
      setResults(prev => prev.map((r, i) => i !== ci ? r : { ...r, won, winAmount, prizeCount }))

      await new Promise(r => setTimeout(r, 300))
    }

    simRef.current = false
    setSimRunning(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [credits, totalCost, cardConfigs, templates, denomination])

  // Running total of winnings for display after sim
  const totalWon = results.reduce((s, r) => s + (r.winAmount ?? 0), 0)
  const totalWonCards = results.filter(r => r.won).length
  const hasResults = results.length > 0

  return (
    <div className="absolute inset-0 overflow-y-auto pt-14 pb-4 px-3" style={{ scrollbarWidth: 'thin' }}>
      <div className="max-w-lg mx-auto flex flex-col gap-4">

        {/* ── Templates ── */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-bold text-white">版型設定</span>
            <button
              onClick={addTemplate}
              disabled={templates.length >= 8}
              className="text-xs text-amber-400 bg-white/5 rounded-lg px-3 py-1 border border-white/10 hover:bg-white/10 disabled:opacity-40"
            >
              + 新增版型
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {templates.map(t => (
              <TemplateEditor
                key={t.id}
                template={t}
                onChange={updated => setTemplates(prev => prev.map(x => x.id === t.id ? updated : x))}
                onDelete={() => setTemplates(prev => prev.filter(x => x.id !== t.id))}
                canDelete={templates.length > 1}
              />
            ))}
          </div>
        </section>

        {/* ── Batch Config ── */}
        <section className="bg-white/5 rounded-xl border border-white/10 p-3 flex flex-col gap-3">
          <span className="text-sm font-bold text-white">批次設定</span>

          {/* Denomination */}
          <div>
            <div className="text-[10px] text-white/40 mb-1">面額（每張費用）</div>
            <div className="flex gap-1 flex-wrap">
              {DENOMINATIONS.map(d => (
                <button
                  key={d}
                  onClick={() => setDenomination(d)}
                  disabled={simRunning}
                  className={[
                    'px-3 h-8 rounded-lg text-sm font-bold border transition-all',
                    denomination === d
                      ? 'bg-amber-500 border-amber-400 text-black'
                      : 'bg-white/10 border-white/20 text-white/60 hover:bg-white/20',
                    simRunning ? 'opacity-40 cursor-not-allowed' : '',
                  ].join(' ')}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          {/* Card count */}
          <div>
            <div className="text-[10px] text-white/40 mb-1">張數（1–20）</div>
            <div className="flex gap-1 flex-wrap">
              {[1, 2, 3, 5, 8, 10, 15, 20].map(n => (
                <button
                  key={n}
                  onClick={() => setCardCount(n)}
                  disabled={simRunning}
                  className={[
                    'px-3 h-8 rounded-lg text-sm font-bold border transition-all',
                    cardCount === n
                      ? 'bg-purple-600 border-purple-400 text-white'
                      : 'bg-white/10 border-white/20 text-white/60 hover:bg-white/20',
                    simRunning ? 'opacity-40 cursor-not-allowed' : '',
                  ].join(' ')}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Per-card config */}
          <div>
            <div className="text-[10px] text-white/40 mb-1">每張卡設定（編號 & 版型）</div>
            <div className="flex flex-col gap-1 max-h-48 overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin' }}>
              {cardConfigs.map((cfg, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-[10px] text-white/30 w-5 text-right">{i + 1}.</span>
                  <input
                    value={cfg.serialId}
                    onChange={e => {
                      const next = [...cardConfigs]
                      next[i] = { ...next[i], serialId: e.target.value }
                      setCardConfigs(next)
                    }}
                    disabled={simRunning}
                    placeholder="編號"
                    className="w-16 bg-white/10 text-white text-xs rounded px-1.5 py-1 border border-white/20 focus:outline-none focus:border-white/40 disabled:opacity-40"
                  />
                  <select
                    value={cfg.templateId}
                    onChange={e => {
                      const next = [...cardConfigs]
                      next[i] = { ...next[i], templateId: e.target.value }
                      setCardConfigs(next)
                    }}
                    disabled={simRunning}
                    className="flex-1 bg-white/10 text-white text-xs rounded px-1.5 py-1 border border-white/20 focus:outline-none focus:border-white/40 disabled:opacity-40"
                    style={{ background: '#1a1a2e' }}
                  >
                    {templates.map(t => (
                      <option key={t.id} value={t.id}>版型 {t.id}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          {/* Start button */}
          <button
            onClick={runSimulation}
            disabled={simRunning || credits < totalCost}
            className={[
              'w-full py-3 rounded-xl font-bold text-base transition-all',
              simRunning || credits < totalCost
                ? 'bg-white/10 text-white/30 cursor-not-allowed'
                : 'bg-gradient-to-r from-amber-500 to-orange-500 text-black shadow-lg shadow-amber-500/20',
            ].join(' ')}
          >
            {simRunning
              ? '模擬中…'
              : credits < totalCost
                ? `金幣不足（需 ${totalCost} 幣）`
                : `開始模擬 ${cardCount} 張 × ${denomination} 幣 = ${totalCost} 幣`}
          </button>
        </section>

        {/* ── Results ── */}
        {hasResults && (
          <section>
            {/* Stats bar */}
            <div className="bg-white/5 rounded-xl border border-white/10 px-4 py-2.5 flex gap-4 justify-around text-center mb-3">
              <div>
                <div className="text-[10px] text-white/40">共花</div>
                <div className="text-sm font-bold text-white">{(results.length * denomination).toLocaleString()} 幣</div>
              </div>
              <div>
                <div className="text-[10px] text-white/40">共贏</div>
                <div className="text-sm font-bold text-emerald-400">{totalWon.toLocaleString()} 幣</div>
              </div>
              <div>
                <div className="text-[10px] text-white/40">淨損益</div>
                <div className={['text-sm font-bold', totalWon - results.length * denomination >= 0 ? 'text-emerald-400' : 'text-rose-400'].join(' ')}>
                  {totalWon - results.length * denomination >= 0 ? '+' : ''}{(totalWon - results.length * denomination).toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-white/40">中獎率</div>
                <div className="text-sm font-bold text-amber-400">
                  {results.length > 0 ? Math.round((totalWonCards / results.length) * 100) : 0}%
                </div>
              </div>
            </div>

            {/* Card grid */}
            <div className="flex flex-wrap gap-2">
              {results.map((card, ci) => (
                <CardResultView
                  key={ci}
                  card={card}
                  denomination={denomination}
                  animatingPositions={animStep?.cardIdx === ci ? animStep.positions : undefined}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
