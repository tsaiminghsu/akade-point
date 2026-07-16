# Temple of the Desert God — Slot Machine

Ancient Egypt-themed high-volatility HTML5 slot machine built with Next.js 14 + TypeScript + PixiJS v7.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    Next.js App Router                           │
│   /temple-of-desert-god/page.tsx  (SSR=false dynamic import)   │
└──────────────────────────┬──────────────────────────────────────┘
                           │
         ┌─────────────────▼──────────────────────┐
         │     SlotMachineGame.tsx (React)         │
         │  ┌─────────────────────────────────┐   │
         │  │     PixiJS Application            │   │
         │  │  ┌──────────────────────────┐   │   │
         │  │  │   PixiJS Scene (Canvas)  │   │   │
         │  │  │  Background / Frame      │   │   │
         │  │  │  ReelWindow (5×4 grid)   │   │   │
         │  │  │  PaylineOverlay          │   │   │
         │  │  │  ParticleLayer           │   │   │
         │  │  │  EffectsContainer        │   │   │
         │  │  └──────────────────────────┘   │   │
         │  └─────────────────────────────────┘   │
         │                                         │
         │  ┌── React Overlay (absolute pos) ───┐  │
         │  │  GameHUD (balance, bet, spin btn) │  │
         │  │  BonusPanel (free spin intro)     │  │
         │  │  WinCelebration (Big Win overlay) │  │
         │  │  PaytableModal (Radix Dialog)     │  │
         │  │  DebugPanel (dev only)            │  │
         │  └───────────────────────────────────┘  │
         └─────────────────────────────────────────┘
                           │
         ┌─────────────────▼──────────────────────┐
         │           Zustand Store                  │
         │         useSlotStore.ts                  │
         │  • phase: GamePhase (state machine)      │
         │  • balance / totalBet / betPerLine       │
         │  • currentGrid: Grid (5×4)               │
         │  • bonusState: BonusState                │
         │  • debug: DebugFlags                     │
         └───────────┬──────────────────────────────┘
                     │
    ┌────────────────┼──────────────────────────┐
    │                │                           │
    ▼                ▼                           ▼
┌───────────┐  ┌────────────────┐  ┌───────────────────────┐
│AnimationEng│  │  Game Engines  │  │     PixiJS Renderers   │
│(orchestrat)│  │ (pure logic)   │  │                       │
│            │  │RandomEngine    │  │  ReelRenderer          │
│Subscribes  │  │ReelGenerator   │  │  ParticleSystem        │
│to Zustand  │  │PaylineChecker  │  │  PixiSceneBuilder      │
│phase       │  │CascadeEngine   │  │                       │
│changes and │  │BonusEngine     │  └───────────────────────┘
│drives all  │  │MultiplierEngine│
│PixiJS anim │  └────────────────┘
└───────────┘
```

---

## State Machine

```
                    ┌──────────────────────────────────────────┐
                    │               IDLE                       │◄──────────────────────┐
                    │  Balance display, bet controls enabled   │                       │
                    └────────────────────┬─────────────────────┘                       │
                                         │ [SPIN pressed, balance ≥ bet]               │
                                         ▼                                             │
                    ┌─────────────────────────────────────────┐                        │
                    │            SPIN_START                   │                        │
                    │  Deduct bet, generate grid, start anim  │                        │
                    └────────────────────┬────────────────────┘                        │
                                         │                                             │
                                         ▼                                             │
                    ┌─────────────────────────────────────────┐                        │
                    │          REELS_SPINNING                 │                        │
                    │  All 5 reels scroll simultaneously      │                        │
                    └────────────────────┬────────────────────┘                        │
                                         │ [staggered stop L→R]                       │
                                         ▼                                             │
                    ┌─────────────────────────────────────────┐                        │
                    │           REEL_STOPPING                 │                        │
                    │  Elastic bounce animation × 5 reels     │                        │
                    └────────────────────┬────────────────────┘                        │
                                         │                                             │
                                         ▼                                             │
                    ┌─────────────────────────────────────────┐                        │
                    │             EVALUATING                  │                        │
                    │  PaylineChecker × 40 paylines           │                        │
                    │  + scatter count anywhere on grid        │                        │
                    └──────┬────────────────────┬────────────┘                        │
                           │                    │                                      │
                     [no win]               [win found]                               │
                           │                    │                                      │
                           │                    ▼                                      │
                           │   ┌────────────────────────────────┐                     │
                           │   │      WIN_PRESENTATION          │                     │
                           │   │  Highlight paylines, particles │                     │
                           │   │  Animate win counter           │                     │
                           │   └───────────────┬────────────────┘                     │
                           │                   │                                       │
                           │                   ▼                                       │
                           │   ┌────────────────────────────────┐                     │
                           │   │           CASCADE              │                     │
                           │   │  Winners fade out              │                     │
                           │   └───────────────┬────────────────┘                     │
                           │                   │                                       │
                           │                   ▼                                       │
                           │   ┌────────────────────────────────┐                     │
                           │   │         CASCADE_FILL           │                     │
                           │   │  Symbols fall + new fill       │                     │
                           │   └───────────────┬────────────────┘                     │
                           │                   │                                       │
                           │                   ▼                                       │
                           │   ┌────────────────────────────────┐                     │
                           │   │         CASCADE_EVAL           │  [no more wins]     │
                           │   │  Re-evaluate → WIN_PRESENTATION│─────────────────────┤
                           │   │  (loop ≤ 20 cascades)         │                     │
                           │   └────────────────────────────────┘                     │
                           │                                                           │
                           └───────────────────────────────────────────────────────────┤
                                                                                       │
                                      [scatter ≥ 4]                                  │
                                           │                                           │
                                           ▼                                           │
              ┌────────────────────────────────────────────┐                          │
              │          FREE_SPIN_TRIGGER                 │                          │
              │  Scatter fly-out animation, count display  │                          │
              └────────────────────┬───────────────────────┘                          │
                                   │                                                   │
                                   ▼                                                   │
              ┌────────────────────────────────────────────┐                          │
              │          GOD_POWER_REVEAL                  │                          │
              │  Random God Power selected & revealed      │                          │
              └────────────────────┬───────────────────────┘                          │
                                   │                                                   │
                                   ▼                                                   │
              ┌────────────────────────────────────────────┐                          │
              │           FREE_SPIN_IDLE                   │◄──────┐                  │
              │  Counter shown, bet frozen at trigger val  │       │                  │
              └────────────────────┬───────────────────────┘       │                  │
                                   │ [auto-spin]                    │                  │
                                   └──► SPIN_START ────────────────┘                  │
                                        (no bet deduction)    [spins remain]          │
                                                                                       │
                                      [all spins used]                                │
                                           │                                           │
                                           ▼                                           │
              ┌────────────────────────────────────────────┐                          │
              │         FREE_SPIN_COMPLETE                 │                          │
              │  Summary: total bonus win displayed        │                          │
              └────────────────────┬───────────────────────┘                          │
                                   │                                                   │
                                   ▼                                                   │
              ┌────────────────────────────────────────────┐                          │
              │               BIG_WIN                      │                          │
              │  Tier: BIG/MEGA/EPIC/LEGENDARY             │                          │
              │  Coin shower, counter animation            │                          │
              └────────────────────┬───────────────────────┘                          │
                                   │ [tap to dismiss / 5s timeout]                    │
                                   └──────────────────────────────────────────────────┘
```

---

## Flow Chart — Single Spin

```
User presses SPIN
      │
      ▼
Balance ≥ TotalBet?
   │ NO → Show insufficient funds
   │ YES
      ▼
Deduct TotalBet from Balance
      │
      ▼
RandomEngine picks stop positions for each reel strip
      │
      ▼
ReelGenerator builds Grid[5][4] from strip stops
      │
      ▼
AnimationEngine.spinAll() → all reels begin scrolling
      │
      ▼  (after SPIN_DURATION_MIN + i×200ms stagger)
Reels stop L→R with elasticEaseOut bounce
      │
      ▼
PaylineChecker.evaluateGrid():
  - Iterate 40 PAYLINES
  - For each: find longest L→R match (Wild substitutes)
  - Count Scatter anywhere on grid
  - Return WinEvaluation
      │
      ▼
isFreeGame? → MultiplierEngine.applyMultipliers()
  - Wilds on same payline → multiply badges
  - GodPower RANDOM_MULTIPLIER → extra 2~10×
      │
      ├─ scatterCount ≥ 4 → FREE_SPIN_TRIGGER
      │
      ├─ totalWin > 0 → WIN_PRESENTATION
      │    └─ CascadeEngine: mark winners → gravity → refill
      │         └─ Re-evaluate (loop ≤ 20 times)
      │
      └─ no win → IDLE
```

---

## File Structure

```
lib/temple-of-desert-god/
├── types.ts              ← All TypeScript interfaces & enums
├── constants.ts          ← PAYLINES[40], SYMBOL_DEFS, timing
├── gameConfig.ts         ← Runtime JSON loader + Zod validator
├── RandomEngine.ts       ← Mulberry32 seeded RNG
├── ReelGenerator.ts      ← Grid generation from reel strips
├── PaylineChecker.ts     ← 40-payline win evaluation
├── MultiplierEngine.ts   ← Wild × multiplier product
├── CascadeEngine.ts      ← Mark winners + gravity fall
├── BonusEngine.ts        ← Free spin trigger + God Power
├── AnimationEngine.ts    ← Phase → PixiJS animation driver
├── SoundEngine.ts        ← Web Audio API wrapper
├── PixiSceneBuilder.ts   ← Builds PixiJS container hierarchy
├── ReelRenderer.ts       ← Spin + elastic bounce animation
└── ParticleSystem.ts     ← GPU particle pool (coins/stars)

components/temple-of-desert-god/
├── SlotMachineGame.tsx   ← Root: PixiJS lifecycle + canvas
├── GameHUD.tsx           ← React overlay: balance/bet/spin
├── BonusPanel.tsx        ← Free spin intro + God Power reveal
├── WinCelebration.tsx    ← Big Win overlay + confetti
├── DebugPanel.tsx        ← Dev-only force flags
├── PaytableModal.tsx     ← Symbol payouts + rules
└── LoadingScreen.tsx     ← Asset load progress

store/
└── useSlotStore.ts       ← Zustand: all game state + actions

public/temple-of-desert-god/
├── gameConfig.json       ← Paytable, weights, RTP=96%, strips
├── symbols/              ← 11 symbol PNGs (160×160px)
├── ui/                   ← Frame, button sprites
└── audio/               ← 15 MP3 sound effects
```

---

## Symbol Paytable

| Symbol | 3× | 4× | 5× | Tier |
|---|---|---|---|---|
| 神像 (Idol) | 10 | 50 | 200 | High |
| 戰神 (War God) | 7.5 | 25 | 75 | High |
| 女神 (Goddess) | 5 | 15 | 40 | High |
| 法老 (Pharaoh) | 2.5 | 10 | 25 | High |
| 黃金項鍊 | 1.0 | 2.5 | 7.5 | Low |
| 黃金戒指 | 0.8 | 2.0 | 5.0 | Low |
| 紅寶石 | 0.7 | 1.5 | 3.5 | Low |
| 綠寶石 | 0.6 | 1.2 | 3.0 | Low |
| 藍寶石 | 0.5 | 1.0 | 2.5 | Low |
| 黃金太陽 (Wild) | — | — | — | Substitutes all |
| 神殿入口 (Scatter) | — | — | — | Pays anywhere |

Scatter pays: 4=5× · 5=20× · 6=100× total bet

---

## God Powers (Free Games)

| Power | Description | Weight |
|---|---|---|
| Sticky Wild | Wilds locked until free games end | 35% |
| Expanding Wild | Wild fills entire reel | 30% |
| Random Multiplier | Each win ×2~10 randomly | 25% |
| Extra Spin | Each win adds +1 free spin | 10% |

---

## Wild Multiplier Weights

| Multiplier | Weight |
|---|---|
| 2× | 50% |
| 3× | 30% |
| 5× | 15% |
| 10× | 5% |

Multiple wilds on same payline → multiplied together (e.g. 2× × 5× = 10×).

---

## Configuration

All gameplay values live in `/public/temple-of-desert-god/gameConfig.json`. No rebuild needed to tune:
- Paytable payouts
- RTP (target 96%)
- Reel strip symbol distribution
- Wild/Scatter weights
- Bonus probabilities
- Multiplier distribution
- Win tier thresholds

---

## Debug Mode

Available in `NODE_ENV=development`. Toggle via the DEBUG panel (bottom-left):

| Flag | Effect |
|---|---|
| Force Scatter | Injects 4 scatters into the grid |
| Force Wild | Injects 2 wilds |
| Force Big Win | Sets row 0 to all IDOL (5-of-a-kind) |
| Speed Mode | Reduces animation durations by ~80% |

---

## RTP Verification

Run `scripts/simulate-rtp.ts` (to be created) for 100k spin Monte Carlo simulation:
```bash
npx ts-node scripts/simulate-rtp.ts
# Expected: RTP = 95.x% ± 1%
```

---

## Route

```
/temple-of-desert-god
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 App Router |
| Language | TypeScript (strict) |
| Renderer | PixiJS v7 (WebGL) |
| State | Zustand |
| UI | Tailwind CSS + Framer Motion |
| Audio | Web Audio API |
| Config | Zod-validated JSON |
| RNG | Mulberry32 (seeded) |
