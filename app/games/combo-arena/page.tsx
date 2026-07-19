"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { OrbGrid } from "@/components/game/orb-grid";
import { calculateMultiplier } from "@/lib/game/multiplier";
import type { OrbColor } from "@/lib/game/orb-generator";
import { cn } from "@/lib/utils";

type Phase = "ready" | "playing" | "cascading" | "attacking" | "enemy_turn" | "victory" | "gameover" | "result";

const ORB_COLORS: OrbColor[] = ["FIRE", "WATER", "WOOD", "LIGHT", "DARK", "RECOVERY"];

interface Character {
  id: OrbColor;
  name: string;
  emoji: string;
  baseAtk: number;
  colorClass: string;
  bgGlow: string;
}

const PLAYER_TEAM: Character[] = [
  { id: "FIRE", name: "烈焰巨龍", emoji: "🐉", baseAtk: 1500, colorClass: "text-red-400", bgGlow: "shadow-[0_0_15px_rgba(239,68,68,0.5)] border-red-500/50 bg-red-950/20" },
  { id: "WATER", name: "深海精靈", emoji: "🧜‍♀️", baseAtk: 1400, colorClass: "text-blue-400", bgGlow: "shadow-[0_0_15px_rgba(59,130,246,0.5)] border-blue-500/50 bg-blue-950/20" },
  { id: "WOOD", name: "大地守護者", emoji: "🌳", baseAtk: 1300, colorClass: "text-emerald-400", bgGlow: "shadow-[0_0_15px_rgba(16,185,129,0.5)] border-emerald-500/50 bg-emerald-950/20" },
  { id: "LIGHT", name: "光輝天使", emoji: "👼", baseAtk: 1800, colorClass: "text-yellow-400", bgGlow: "shadow-[0_0_15px_rgba(250,204,21,0.5)] border-yellow-500/50 bg-yellow-950/20" },
  { id: "DARK", name: "黯影死神", emoji: "💀", baseAtk: 2000, colorClass: "text-purple-400", bgGlow: "shadow-[0_0_15px_rgba(147,51,234,0.5)] border-purple-500/50 bg-purple-950/20" },
];

const TEAM_RCV = 2500;

interface BossData {
  name: string;
  emoji: string;
  element: OrbColor;
  baseHp: number;
  baseAtk: number;
  maxCd: number;
  colorClass: string;
  bgGlow: string;
}

const BOSS_POOL: BossData[] = [
  { name: "滅世魔龍 (Titan)", emoji: "🐲", element: "FIRE", baseHp: 80000, baseAtk: 4500, maxCd: 3, colorClass: "text-red-500", bgGlow: "shadow-[0_0_25px_rgba(239,68,68,0.5)] border-red-500/30 bg-red-950/10" },
  { name: "深淵克拉肯 (Kraken)", emoji: "🐙", element: "WATER", baseHp: 90000, baseAtk: 4000, maxCd: 2, colorClass: "text-blue-500", bgGlow: "shadow-[0_0_25px_rgba(59,130,246,0.5)] border-blue-500/30 bg-blue-950/10" },
  { name: "古老巨木兵 (Treant)", emoji: "👹", element: "WOOD", baseHp: 110000, baseAtk: 3500, maxCd: 3, colorClass: "text-emerald-500", bgGlow: "shadow-[0_0_25px_rgba(16,185,129,0.5)] border-emerald-500/30 bg-emerald-950/10" },
  { name: "熾天使長 (Gabriel)", emoji: "👼", element: "LIGHT", baseHp: 75000, baseAtk: 5500, maxCd: 2, colorClass: "text-yellow-400", bgGlow: "shadow-[0_0_25px_rgba(250,204,21,0.5)] border-yellow-500/30 bg-yellow-950/10" },
  { name: "深淵領主 (Shadow)", emoji: "😈", element: "DARK", baseHp: 100000, baseAtk: 5000, maxCd: 2, colorClass: "text-purple-500", bgGlow: "shadow-[0_0_25px_rgba(147,51,234,0.5)] border-purple-500/30 bg-purple-950/10" }
];

function generateBoss(wave: number) {
  const baseBoss = BOSS_POOL[(wave - 1) % BOSS_POOL.length];
  const scale = Math.pow(1.3, wave - 1);
  const atkScale = Math.pow(1.15, wave - 1);
  const maxHp = Math.round(baseBoss.baseHp * scale);
  const atk = Math.round(baseBoss.baseAtk * atkScale);
  
  return {
    name: `${baseBoss.name} (W.${wave})`,
    emoji: baseBoss.emoji,
    element: baseBoss.element,
    hp: maxHp,
    maxHp: maxHp,
    atk: atk,
    cd: baseBoss.maxCd,
    maxCd: baseBoss.maxCd,
    colorClass: baseBoss.colorClass,
    bgGlow: baseBoss.bgGlow
  };
}

function hasAnyMatches(grid: OrbColor[]): boolean {
  const cols = 6;
  const rows = 5;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols - 2; c++) {
      const idx = r * cols + c;
      if (grid[idx] === grid[idx + 1] && grid[idx] === grid[idx + 2]) return true;
    }
  }
  for (let r = 0; r < rows - 2; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      if (grid[idx] === grid[idx + cols] && grid[idx] === grid[idx + cols * 2]) return true;
    }
  }
  return false;
}

function generateRandomGrid(): OrbColor[] {
  let attempt = 0;
  while (attempt < 100) {
    const grid = Array.from({ length: 30 }, () => ORB_COLORS[Math.floor(Math.random() * ORB_COLORS.length)]);
    if (!hasAnyMatches(grid)) {
      return grid;
    }
    attempt++;
  }
  return Array.from({ length: 30 }, (_, i) => ORB_COLORS[i % 6]);
}

function fnv1a(str: string): number {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

const COLS = 6;
const ROWS = 5;

function getNeighbors(idx: number): number[] {
  const row = Math.floor(idx / COLS);
  const col = idx % COLS;
  const result: number[] = [];
  if (row > 0) result.push(idx - COLS);
  if (row < ROWS - 1) result.push(idx + COLS);
  if (col > 0) result.push(idx - 1);
  if (col < COLS - 1) result.push(idx + 1);
  return result;
}

function floodFill(
  grid: (OrbColor | null)[],
  start: number,
  color: OrbColor,
  restriction?: Set<number>
): Set<number> {
  const visited = new Set<number>();
  const queue = [start];
  while (queue.length > 0) {
    const idx = queue.shift()!;
    if (visited.has(idx)) continue;
    if (grid[idx] !== color) continue;
    if (restriction && !restriction.has(idx)) continue;
    visited.add(idx);
    for (const n of getNeighbors(idx)) {
      if (!visited.has(n)) queue.push(n);
    }
  }
  return visited;
}

export default function TestGamePage() {
  const [phase, setPhase] = useState<Phase>("ready");
  const [initialGrid, setInitialGrid] = useState<OrbColor[]>([]);
  const [currentGrid, setCurrentGrid] = useState<OrbColor[]>([]);
  const [combos, setCombos] = useState(0);
  const [multiplier, setMultiplier] = useState(1);
  const [baseReward] = useState(100);
  const [matchedIndices, setMatchedIndices] = useState<Set<number>>(new Set());
  const [cascadeStep, setCascadeStep] = useState(0);
  
  // Game Timer
  const [dragStarted, setDragStarted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(5.0);

  // Boss Battle States
  const [wave, setWave] = useState(1);
  const [playerHp, setPlayerHp] = useState(25000);
  const [playerMaxHp, setPlayerMaxHp] = useState(25000);
  const [boss, setBoss] = useState<ReturnType<typeof generateBoss> | null>(null);
  const [activeAttacker, setActiveAttacker] = useState<OrbColor | "RECOVERY" | null>(null);
  const [battleLogs, setBattleLogs] = useState<string[]>([]);

  // Card Multiplier System
  const [ownedCards, setOwnedCards] = useState<Record<string, boolean>>({
    // Series 1
    "001": false, "002": false, "003": false, "004": false, "005": false, "SSR": false,
    // Series 2
    "006": false, "007": false, "008": false, "009": false, "010": false, "SSR_2": false,
    // Series 3
    "011": false, "012": false, "013": false, "014": false, "015": false, "SSR_3": false,
    // Series 4
    "016": false, "017": false, "018": false, "019": false, "020": false, "SSR_4": false,
  });
  const [isFetchingCollection, setIsFetchingCollection] = useState(false);
  
  // Floating text effects
  const [damageEffects, setDamageEffects] = useState<{
    id: number;
    text: string;
    color: string;
    type: "damage" | "heal" | "status";
    yOffset: number;
  }[]>([]);
  
  // Hit triggers
  const [bossShake, setBossShake] = useState(false);
  const [bossFlash, setBossFlash] = useState(false);
  const [playerFlash, setPlayerFlash] = useState(false);

  // Cumulative results stats
  const [totalDamageDealt, setTotalDamageDealt] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [totalHealingDone, setTotalHealingDone] = useState(0);

  const submitted = useRef(false);
  const currentGridRef = useRef<OrbColor[]>([]);
  currentGridRef.current = currentGrid;

  // Fetch actual cards from user's account collection on load
  useEffect(() => {
    setIsFetchingCollection(true);
    fetch("/api/collection")
      .then(res => {
        if (res.ok) return res.json();
        throw new Error("Unauthorized");
      })
      .then(data => {
        const nextOwned = {
          // Series 1
          "001": false, "002": false, "003": false, "004": false, "005": false, "SSR": false,
          // Series 2
          "006": false, "007": false, "008": false, "009": false, "010": false, "SSR_2": false,
          // Series 3
          "011": false, "012": false, "013": false, "014": false, "015": false, "SSR_3": false,
          // Series 4
          "016": false, "017": false, "018": false, "019": false, "020": false, "SSR_4": false,
        };
        if (data.cards) {
          data.cards.forEach((card: { cardNumber: string }) => {
            if (card.cardNumber in nextOwned) {
              nextOwned[card.cardNumber as keyof typeof nextOwned] = true;
            }
          });
        }
        if (data.claimedTiers && data.claimedTiers.includes("SSR_COMPLETE")) {
          nextOwned["SSR"] = true;
        }
        setOwnedCards(nextOwned);
        setBattleLogs(prev => [...prev, "📡 已自動載入您的個人卡牌收藏，已套用傷害加成！"]);
      })
      .catch(() => {
        // Fallback silently if not logged in. Player can still manually toggle mock cards.
      })
      .finally(() => {
        setIsFetchingCollection(false);
      });
  }, []);

  const startTestGame = () => {
    const grid = generateRandomGrid();
    setInitialGrid(grid);
    setCurrentGrid([...grid]);
    setCombos(0);
    setMultiplier(1);
    setMatchedIndices(new Set());
    setCascadeStep(0);
    setTimeLeft(ownedCards["014"] ? 6.0 : 5.0);
    setDragStarted(false);
    submitted.current = false;

    // Reset battle values
    setWave(1);
    setPlayerHp(25000);
    setPlayerMaxHp(25000);
    setBoss(generateBoss(1));
    setActiveAttacker(null);
    setDamageEffects([]);
    setTotalDamageDealt(0);
    setMaxCombo(0);
    setTotalHealingDone(0);
    setBattleLogs(["⚔️ 戰鬥開始！滑動寶珠來觸發連線攻擊！"]);

    setPhase("playing");
  };

  // 監聽觸碰後的 5 秒計時器倒數
  useEffect(() => {
    if (!dragStarted || phase !== "playing") return;
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        const next = Math.max(0, Math.round((prev - 0.1) * 10) / 10);
        if (next <= 0) {
          clearInterval(interval);
          runCascadeAnimation(currentGridRef.current);
        }
        return next;
      });
    }, 100);
    return () => clearInterval(interval);
  }, [dragStarted, phase]);

  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  // Element affinity multipliers
  const getElementMultiplier = (atk: OrbColor, def: OrbColor): number => {
    if (atk === "FIRE" && def === "WOOD") return 2.0;
    if (atk === "WOOD" && def === "WATER") return 2.0;
    if (atk === "WATER" && def === "FIRE") return 2.0;
    
    if (atk === "WOOD" && def === "FIRE") return 0.5;
    if (atk === "WATER" && def === "WOOD") return 0.5;
    if (atk === "FIRE" && def === "WATER") return 0.5;
    
    if ((atk === "LIGHT" && def === "DARK") || (atk === "DARK" && def === "LIGHT")) return 2.0;
    
    return 1.0;
  };

  const getCardBoostMultiplier = useCallback((color: OrbColor, owned: Record<string, boolean>): number => {
    let mult = 1.0;
    // Fire
    if (color === "FIRE") {
      if (owned["001"]) mult += 0.1;
      if (owned["010"]) mult += 0.2;
      if (owned["012"]) mult += 0.15;
      if (owned["020"]) mult += 0.25;
    }
    // Water
    if (color === "WATER") {
      if (owned["002"]) mult += 0.1;
      if (owned["007"]) mult += 0.1;
      if (owned["013"]) mult += 0.15;
      if (owned["018"]) mult += 0.2;
    }
    // Wood
    if (color === "WOOD") {
      if (owned["003"]) mult += 0.15;
      if (owned["006"]) mult += 0.1;
      if (owned["014"]) mult += 0.1;
      if (owned["017"]) mult += 0.15;
    }
    // Light
    if (color === "LIGHT") {
      if (owned["004"]) mult += 0.15;
      if (owned["009"]) mult += 0.15;
      if (owned["011"]) mult += 0.15;
      if (owned["019"]) mult += 0.2;
    }
    // Dark
    if (color === "DARK") {
      if (owned["005"]) mult += 0.2;
      if (owned["008"]) mult += 0.15;
      if (owned["015"]) mult += 0.2;
      if (owned["016"]) mult += 0.2;
    }
    // SSR (All Attributes)
    if (owned["SSR"]) mult += 0.3;
    if (owned["SSR_2"]) mult += 0.3;
    if (owned["SSR_3"]) mult += 0.3;
    if (owned["SSR_4"]) mult += 0.4;
    return mult;
  }, []);

  const getDamageColorClass = (color: OrbColor): string => {
    switch (color) {
      case "FIRE": return "text-red-500";
      case "WATER": return "text-blue-400";
      case "WOOD": return "text-emerald-400";
      case "LIGHT": return "text-yellow-300";
      case "DARK": return "text-purple-400";
      default: return "text-white";
    }
  };

  const getAttackerXOffset = (element: OrbColor): number => {
    switch (element) {
      case "FIRE": return -115;
      case "WATER": return -58;
      case "WOOD": return 0;
      case "LIGHT": return 58;
      case "DARK": return 115;
      default: return 0;
    }
  };

  // Resolution of Player Attack & Boss Attack sequence
  const runBattleResolution = async (finalCombos: number, matches: { color: OrbColor; size: number }[]) => {
    setPhase("attacking");
    
    // Group matches by color
    const matchesByColor: Record<OrbColor, number[]> = {
      FIRE: [], WATER: [], WOOD: [], LIGHT: [], DARK: [], RECOVERY: []
    };
    matches.forEach(m => {
      matchesByColor[m.color].push(m.size);
    });

    const comboMult = 1 + (finalCombos - 1) * (ownedCards["SSR_3"] ? 0.35 : 0.25);
    const activeElements = (Object.keys(matchesByColor) as OrbColor[]).filter(color => matchesByColor[color].length > 0);
    
    if (activeElements.length === 0) {
      setBattleLogs(prev => [...prev, "沒有消除任何寶珠！"]);
      await delay(800);
      await triggerEnemyAttack();
      return;
    }

    if (finalCombos > maxCombo) {
      setMaxCombo(finalCombos);
    }

    let currentBossHp = boss ? boss.hp : 0;
    
    // Process each matched element in turn
    for (const color of activeElements) {
      const sizes = matchesByColor[color];
      let totalMatchMult = 0;
      sizes.forEach(size => {
        totalMatchMult += 1 + (size - 3) * 0.25;
      });

      if (color === "RECOVERY") {
        let rcvMult = 1.0;
        if (ownedCards["007"]) rcvMult += 0.15;
        const heal = Math.round(TEAM_RCV * totalMatchMult * comboMult * rcvMult);
        setTotalHealingDone(prev => prev + heal);
        setActiveAttacker("RECOVERY");
        setBattleLogs(prev => [...prev, `💖 消除心靈寶珠！全隊回復 ${heal.toLocaleString()} HP！`]);
        
        // Spawn green healing floating text above team HP bar
        setDamageEffects(prev => [...prev, {
          id: Date.now() + Math.random(),
          text: `+${heal.toLocaleString()}`,
          color: "text-emerald-400 font-extrabold text-2xl drop-shadow-[0_0_8px_rgba(52,211,153,0.8)]",
          type: "heal",
          yOffset: 0
        }]);

        setPlayerHp(prev => Math.min(playerMaxHp, prev + heal));
        await delay(900);
      } else {
        const character = PLAYER_TEAM.find(c => c.id === color)!;
        const rawDamage = Math.round(character.baseAtk * totalMatchMult * comboMult);
        const elemMult = getElementMultiplier(color, boss?.element || "FIRE");
        
        // Apply card boost
        const cardMult = getCardBoostMultiplier(color, ownedCards);
        const finalDamage = Math.round(rawDamage * elemMult * cardMult);

        setActiveAttacker(color);

        let advantageText = "";
        if (elemMult > 1.0) advantageText = " (屬性相剋！2.0x)";
        if (elemMult < 1.0) advantageText = " (屬性被剋...0.5x)";

        let cardBoostText = "";
        if (cardMult > 1.0) {
          cardBoostText = ` [卡牌加成 +${Math.round((cardMult - 1) * 100)}%]`;
        }

        setBattleLogs(prev => [
          ...prev, 
          `${character.emoji} ${character.name} 發動攻擊！造成 ${finalDamage.toLocaleString()} 點傷害${advantageText}${cardBoostText}！`
        ]);

        // Simulating the projectile hit timing
        setTimeout(() => {
          setBossShake(true);
          setBossFlash(true);
          
          setDamageEffects(prev => [...prev, {
            id: Date.now() + Math.random(),
            text: `-${finalDamage.toLocaleString()}`,
            color: getDamageColorClass(color) + " font-black text-3xl drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]",
            type: "damage",
            yOffset: prev.filter(e => e.type === "damage").length * -25
          }]);
          
          setTimeout(() => setBossShake(false), 200);
          setTimeout(() => setBossFlash(false), 120);
        }, 300);

        currentBossHp = Math.max(0, currentBossHp - finalDamage);
        setBoss(prev => prev ? { ...prev, hp: currentBossHp } : null);
        setTotalDamageDealt(prev => prev + finalDamage);

        await delay(950);
      }
    }

    setActiveAttacker(null);
    setDamageEffects([]);

    // Check if boss defeated
    if (currentBossHp <= 0) {
      setBattleLogs(prev => [...prev, `🎉 成功擊敗了 ${boss?.name}！`]);
      await delay(600);
      setPhase("victory");
      return;
    }

    // Boss's Turn
    await triggerEnemyAttack();
  };

  const triggerEnemyAttack = async () => {
    if (!boss) return;
    
    setPhase("enemy_turn");
    await delay(600);

    const nextCd = boss.cd - 1;
    if (nextCd <= 0) {
      // Boss attacks player
      setBattleLogs(prev => [...prev, `⚡ ${boss.name} 發動了猛烈攻擊！`]);
      setPlayerFlash(true);
      
      setDamageEffects(prev => [...prev, {
        id: Date.now(),
        text: `-${boss.atk.toLocaleString()}`,
        color: "text-red-500 font-extrabold text-3xl drop-shadow-[0_2px_6px_rgba(0,0,0,0.8)]",
        type: "heal", // display above player team
        yOffset: 0
      }]);

      setTimeout(() => setPlayerFlash(false), 250);

      const newPlayerHp = Math.max(0, playerHp - boss.atk);
      setPlayerHp(newPlayerHp);
      setBoss(prev => prev ? { ...prev, cd: boss.maxCd } : null);

      await delay(1200);
      setDamageEffects([]);

      if (newPlayerHp <= 0) {
        setBattleLogs(prev => [...prev, "💀 全隊陣亡！戰鬥失敗。"]);
        await delay(1000);
        setPhase("gameover");
        return;
      }
    } else {
      // Boss counts down
      setBoss(prev => prev ? { ...prev, cd: nextCd } : null);
      setBattleLogs(prev => [...prev, `⏳ ${boss.name} 正在蓄力...還有 ${nextCd} 回合後攻擊！`]);
      await delay(900);
    }

    // Spawn new board and return to playing phase
    const nextGrid = generateRandomGrid();
    setInitialGrid(nextGrid);
    setCurrentGrid([...nextGrid]);
    setCombos(0);
    setMultiplier(1);
    setMatchedIndices(new Set());
    setCascadeStep(0);
    setTimeLeft(5.0);
    setDragStarted(false);
    submitted.current = false;
    setPhase("playing");
  };

  const proceedToNextWave = () => {
    const nextWave = wave + 1;
    setWave(nextWave);
    
    const nextBoss = generateBoss(nextWave);
    setBoss(nextBoss);
    
    // Wave clear bonus: heal player by 40% of max HP
    const healAmount = Math.round(playerMaxHp * 0.4);
    setPlayerHp(prev => Math.min(playerMaxHp, prev + healAmount));

    setBattleLogs(prev => [
      `========================`,
      `進入第 ${nextWave} 波戰鬥！`,
      `💖 通關獎勵：生命值恢復 ${healAmount.toLocaleString()} 點！`,
      `⚔️ 敵方 Boss：${nextBoss.name} 出現！`,
    ]);

    // Setup board
    const nextGrid = generateRandomGrid();
    setInitialGrid(nextGrid);
    setCurrentGrid([...nextGrid]);
    setCombos(0);
    setMultiplier(1);
    setMatchedIndices(new Set());
    setCascadeStep(0);
    setTimeLeft(5.0);
    setDragStarted(false);
    submitted.current = false;
    setPhase("playing");
  };

  const finishAndShowResults = () => {
    const finalMult = calculateMultiplier(maxCombo);
    setMultiplier(finalMult);
    setPhase("result");
  };

  // 消珠與落珠動畫執行器
  const runCascadeAnimation = async (finalGrid: OrbColor[]) => {
    if (submitted.current) return;
    submitted.current = true;
    
    setPhase("cascading");
    setCascadeStep(1);
    
    let gridCopy: (OrbColor | null)[] = [...finalGrid];
    let accumulatedCombos = 0;
    
    // Store matches in this turn
    const turnMatchesList: { color: OrbColor; size: number }[] = [];

    // 使用 FNV-1a Hash 初始化隨機數生成種子
    let seed = fnv1a(finalGrid.join(","));
    const nextColor = (): OrbColor => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return ORB_COLORS[seed % 6];
    };

    let step = 1;
    while (true) {
      // 1. 偵測目前版面是否有相連大於等於 3 的珠子
      const matched = new Set<number>();
      for (let idx = 0; idx < gridCopy.length; idx++) {
        const color = gridCopy[idx];
        if (color === null || matched.has(idx)) continue;
        
        const group = floodFill(gridCopy, idx, color);
        if (group.size >= 3) {
          group.forEach((i) => matched.add(i));
        }
      }

      // 如果沒有任何連線，消珠動作結束
      if (matched.size === 0) {
        break;
      }

      // 2. 計算此步的 Combo 數
      const visited = new Set<number>();
      let stepCombos = 0;
      Array.from(matched).forEach((start) => {
        if (visited.has(start)) return;
        const color = gridCopy[start];
        if (color === null) return;
        
        const component = floodFill(gridCopy, start, color, matched);
        if (component.size >= 3) {
          component.forEach((i) => visited.add(i));
          stepCombos++;
          // Record color and size of match
          turnMatchesList.push({ color, size: component.size });
        }
      });

      // 3. 更新 Highlight 與累計 Combo
      setMatchedIndices(matched);
      accumulatedCombos += stepCombos;
      setCombos(accumulatedCombos);
      
      // 等待 650ms 讓玩家看清楚被消的珠子與 Combo 數增加
      await delay(650);

      // 4. 將被消除的珠子設為 null
      matched.forEach((idx) => {
        gridCopy[idx] = null;
      });
      
      // 將 null 的位置暫時在畫面上隱藏/更新
      setCurrentGrid(gridCopy.map(c => c || "FIRE")); // 僅為渲染不崩潰
      setMatchedIndices(new Set());
      await delay(150);

      // 5. 進行下落與上方補珠
      for (let col = 0; col < COLS; col++) {
        const colOrbs: OrbColor[] = [];
        for (let row = ROWS - 1; row >= 0; row--) {
          const idx = row * COLS + col;
          if (gridCopy[idx] !== null) {
            colOrbs.push(gridCopy[idx] as OrbColor);
          }
        }

        // 下落
        let rowIdx = ROWS - 1;
        for (const color of colOrbs) {
          gridCopy[rowIdx * COLS + col] = color;
          rowIdx--;
        }
        
        // 頂端隨機補新珠
        while (rowIdx >= 0) {
          gridCopy[rowIdx * COLS + col] = nextColor();
          rowIdx--;
        }
      }

      // 更新版面 state，玩家將看到珠子掉落後的新畫面
      setCurrentGrid(gridCopy as OrbColor[]);
      step++;
      setCascadeStep(step);
      
      // 等待 450ms 落珠完畢
      await delay(450);
    }

    // 全部消珠與落珠結束，計算加成
    const finalMult = calculateMultiplier(accumulatedCombos);
    setMultiplier(finalMult);
    await delay(500);
    
    // Resolve battle phase using turn matches!
    await runBattleResolution(accumulatedCombos, turnMatchesList);
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-8 relative overflow-hidden bg-zinc-950 text-white">
      {/* 炫麗背景 */}
      <div className="absolute inset-0 -z-10 pointer-events-none">
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-15 animate-pulse"
          style={{
            background:
              "radial-gradient(circle, rgba(251,191,36,0.2) 0%, rgba(239,68,68,0.08) 55%, transparent 80%)",
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(251,191,36,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(251,191,36,0.3) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
      </div>

      <div className="w-full max-w-sm flex flex-col items-center">
        {/* 頂部 Logo */}
        <div className="flex flex-col items-center mb-4">
          <div className="relative w-16 h-16 mb-1 drop-shadow-[0_0_12px_rgba(251,191,36,0.5)]">
            <Image
              src="/logo.png"
              alt="機器人收藏宇宙 Logo"
              fill
              className="object-contain"
              priority
            />
          </div>
          <h1 className="text-lg font-black tracking-wider text-amber-400">連擊戰鬥測試模式</h1>
          <p className="text-zinc-500 text-[10px]">Combo & Damage Attack RPG Demo</p>
        </div>

        {/* Phase: Ready */}
        {phase === "ready" && (
          <div
            className="w-full rounded-2xl px-6 py-6 border border-white/10 text-center space-y-5"
            style={{
              background: "rgba(255,255,255,0.04)",
              backdropFilter: "blur(10px)",
            }}
          >
            <div className="space-y-1.5">
              <h2 className="text-base font-bold text-zinc-100">準備進入關卡</h2>
              <p className="text-zinc-400 text-[11px] leading-relaxed">
                消除寶珠可激發對應角色發動攻擊！
                <br />
                **點擊並拖曳寶珠時，才會啟動 5 秒計時！**
              </p>
            </div>

            {/* Team Preview */}
            <div className="space-y-1.5 text-left">
              <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">🛡️ 你的戰鬥小隊</p>
              <div className="grid grid-cols-5 gap-1">
                {PLAYER_TEAM.map((char) => {
                  const boost = getCardBoostMultiplier(char.id, ownedCards);
                  return (
                    <div key={char.id} className="flex flex-col items-center p-1.5 rounded-xl border border-white/5 bg-white/5 text-center relative">
                      <span className="text-xl mb-0.5 select-none">{char.emoji}</span>
                      <span className="text-[8px] font-bold text-zinc-300 truncate w-full">{char.name}</span>
                      <span className={cn("text-[7px] font-mono", char.colorClass)}>ATK {char.baseAtk}</span>
                      {boost > 1.0 && (
                        <span className="absolute -top-1 -right-1 bg-amber-500 text-[6px] font-bold text-black px-0.5 rounded scale-90">
                          +{Math.round((boost - 1) * 100)}%
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Card Boost settings toggle panel */}
            <div className="bg-black/40 rounded-xl p-3 text-left border border-white/5 space-y-2">
              <div className="flex justify-between items-center">
                <p className="text-[10px] font-bold text-zinc-300 flex items-center gap-1">
                  🏆 活動卡牌傷害加成測試
                </p>
                {isFetchingCollection && (
                  <span className="text-[8px] text-amber-400 animate-pulse">連線讀取中...</span>
                )}
              </div>
              
              <p className="text-[9px] text-zinc-500 leading-tight">
                系統已自動讀取您的帳戶收藏。您也可以在此勾選以測試不同卡牌加成：
              </p>

              {/* Stacked Series Checkboxes */}
              <div className="space-y-2 pt-1 text-[9px] max-h-[160px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-zinc-800">
                {/* Series 1 */}
                <div className="space-y-1">
                  <p className="font-bold text-zinc-400 border-b border-white/5 pb-0.5">第一彈：創世核心</p>
                  <div className="grid grid-cols-2 gap-1 text-zinc-400">
                    <label className="flex items-center gap-1 cursor-pointer select-none hover:text-white">
                      <input type="checkbox" checked={ownedCards["001"]} onChange={(e) => setOwnedCards(prev => ({ ...prev, "001": e.target.checked }))} className="rounded border-zinc-700 bg-zinc-900 text-amber-500 focus:ring-amber-500/20 w-2.5 h-2.5" />
                      <span>🤖 探索 (+10% 火)</span>
                    </label>
                    <label className="flex items-center gap-1 cursor-pointer select-none hover:text-white">
                      <input type="checkbox" checked={ownedCards["002"]} onChange={(e) => setOwnedCards(prev => ({ ...prev, "002": e.target.checked }))} className="rounded border-zinc-700 bg-zinc-900 text-amber-500 focus:ring-amber-500/20 w-2.5 h-2.5" />
                      <span>📊 分析 (+10% 水)</span>
                    </label>
                    <label className="flex items-center gap-1 cursor-pointer select-none hover:text-white">
                      <input type="checkbox" checked={ownedCards["003"]} onChange={(e) => setOwnedCards(prev => ({ ...prev, "003": e.target.checked }))} className="rounded border-zinc-700 bg-zinc-900 text-amber-500 focus:ring-amber-500/20 w-2.5 h-2.5" />
                      <span>🛡️ 守護 (+15% 木)</span>
                    </label>
                    <label className="flex items-center gap-1 cursor-pointer select-none hover:text-white">
                      <input type="checkbox" checked={ownedCards["004"]} onChange={(e) => setOwnedCards(prev => ({ ...prev, "004": e.target.checked }))} className="rounded border-zinc-700 bg-zinc-900 text-amber-500 focus:ring-amber-500/20 w-2.5 h-2.5" />
                      <span>⚡ 能源 (+15% 光)</span>
                    </label>
                    <label className="flex items-center gap-1 cursor-pointer select-none hover:text-white">
                      <input type="checkbox" checked={ownedCards["005"]} onChange={(e) => setOwnedCards(prev => ({ ...prev, "005": e.target.checked }))} className="rounded border-zinc-700 bg-zinc-900 text-amber-500 focus:ring-amber-500/20 w-2.5 h-2.5" />
                      <span>🌌 星際 (+20% 暗)</span>
                    </label>
                    <label className="flex items-center gap-1 cursor-pointer select-none text-amber-400 font-semibold hover:text-amber-300">
                      <input type="checkbox" checked={ownedCards["SSR"]} onChange={(e) => setOwnedCards(prev => ({ ...prev, "SSR": e.target.checked }))} className="rounded border-zinc-700 bg-zinc-900 text-amber-500 focus:ring-amber-500/20 w-2.5 h-2.5" />
                      <span>👑 機器王 (+30% 全)</span>
                    </label>
                  </div>
                </div>

                {/* Series 2 */}
                <div className="space-y-1 pt-1">
                  <p className="font-bold text-zinc-400 border-b border-white/5 pb-0.5">第二彈：星海啟航</p>
                  <div className="grid grid-cols-2 gap-1 text-zinc-400">
                    <label className="flex items-center gap-1 cursor-pointer select-none hover:text-white">
                      <input type="checkbox" checked={ownedCards["006"]} onChange={(e) => setOwnedCards(prev => ({ ...prev, "006": e.target.checked }))} className="rounded border-zinc-700 bg-zinc-900 text-amber-500 focus:ring-amber-500/20 w-2.5 h-2.5" />
                      <span>⛏️ 採礦 (+10% 木)</span>
                    </label>
                    <label className="flex items-center gap-1 cursor-pointer select-none hover:text-white">
                      <input type="checkbox" checked={ownedCards["007"]} onChange={(e) => setOwnedCards(prev => ({ ...prev, "007": e.target.checked }))} className="rounded border-zinc-700 bg-zinc-900 text-amber-500 focus:ring-amber-500/20 w-2.5 h-2.5" />
                      <span>💉 醫療 (+15% 療)</span>
                    </label>
                    <label className="flex items-center gap-1 cursor-pointer select-none hover:text-white">
                      <input type="checkbox" checked={ownedCards["008"]} onChange={(e) => setOwnedCards(prev => ({ ...prev, "008": e.target.checked }))} className="rounded border-zinc-700 bg-zinc-900 text-amber-500 focus:ring-amber-500/20 w-2.5 h-2.5" />
                      <span>💂 護衛 (+15% 暗)</span>
                    </label>
                    <label className="flex items-center gap-1 cursor-pointer select-none hover:text-white">
                      <input type="checkbox" checked={ownedCards["009"]} onChange={(e) => setOwnedCards(prev => ({ ...prev, "009": e.target.checked }))} className="rounded border-zinc-700 bg-zinc-900 text-amber-500 focus:ring-amber-500/20 w-2.5 h-2.5" />
                      <span>🚀 加速 (+15% 光)</span>
                    </label>
                    <label className="flex items-center gap-1 cursor-pointer select-none hover:text-white">
                      <input type="checkbox" checked={ownedCards["010"]} onChange={(e) => setOwnedCards(prev => ({ ...prev, "010": e.target.checked }))} className="rounded border-zinc-700 bg-zinc-900 text-amber-500 focus:ring-amber-500/20 w-2.5 h-2.5" />
                      <span>☄️ 裁決 (+20% 火)</span>
                    </label>
                    <label className="flex items-center gap-1 cursor-pointer select-none text-amber-400 font-semibold hover:text-amber-300">
                      <input type="checkbox" checked={ownedCards["SSR_2"]} onChange={(e) => setOwnedCards(prev => ({ ...prev, "SSR_2": e.target.checked }))} className="rounded border-zinc-700 bg-zinc-900 text-amber-500 focus:ring-amber-500/20 w-2.5 h-2.5" />
                      <span>🪐 星海君王 (+30% 全)</span>
                    </label>
                  </div>
                </div>

                {/* Series 3 */}
                <div className="space-y-1 pt-1">
                  <p className="font-bold text-zinc-400 border-b border-white/5 pb-0.5">第三彈：超弦異變</p>
                  <div className="grid grid-cols-2 gap-1 text-zinc-400">
                    <label className="flex items-center gap-1 cursor-pointer select-none hover:text-white">
                      <input type="checkbox" checked={ownedCards["011"]} onChange={(e) => setOwnedCards(prev => ({ ...prev, "011": e.target.checked }))} className="rounded border-zinc-700 bg-zinc-900 text-amber-500 focus:ring-amber-500/20 w-2.5 h-2.5" />
                      <span>🔮 偏折 (+15% 光)</span>
                    </label>
                    <label className="flex items-center gap-1 cursor-pointer select-none hover:text-white">
                      <input type="checkbox" checked={ownedCards["012"]} onChange={(e) => setOwnedCards(prev => ({ ...prev, "012": e.target.checked }))} className="rounded border-zinc-700 bg-zinc-900 text-amber-500 focus:ring-amber-500/20 w-2.5 h-2.5" />
                      <span>☄️ 離子 (火爆擊)</span>
                    </label>
                    <label className="flex items-center gap-1 cursor-pointer select-none hover:text-white">
                      <input type="checkbox" checked={ownedCards["013"]} onChange={(e) => setOwnedCards(prev => ({ ...prev, "013": e.target.checked }))} className="rounded border-zinc-700 bg-zinc-900 text-amber-500 focus:ring-amber-500/20 w-2.5 h-2.5" />
                      <span>📡 共振 (+15% 水)</span>
                    </label>
                    <label className="flex items-center gap-1 cursor-pointer select-none hover:text-white">
                      <input type="checkbox" checked={ownedCards["014"]} onChange={(e) => setOwnedCards(prev => ({ ...prev, "014": e.target.checked }))} className="rounded border-zinc-700 bg-zinc-900 text-amber-500 focus:ring-amber-500/20 w-2.5 h-2.5" />
                      <span>⏳ 擾動 (時間+1秒)</span>
                    </label>
                    <label className="flex items-center gap-1 cursor-pointer select-none hover:text-white">
                      <input type="checkbox" checked={ownedCards["015"]} onChange={(e) => setOwnedCards(prev => ({ ...prev, "015": e.target.checked }))} className="rounded border-zinc-700 bg-zinc-900 text-amber-500 focus:ring-amber-500/20 w-2.5 h-2.5" />
                      <span>👁️ 觀察 (+20% 暗)</span>
                    </label>
                    <label className="flex items-center gap-1 cursor-pointer select-none text-amber-400 font-semibold hover:text-amber-300">
                      <input type="checkbox" checked={ownedCards["SSR_3"]} onChange={(e) => setOwnedCards(prev => ({ ...prev, "SSR_3": e.target.checked }))} className="rounded border-zinc-700 bg-zinc-900 text-amber-500 focus:ring-amber-500/20 w-2.5 h-2.5" />
                      <span>🧬 量子主宰 (Combo+)</span>
                    </label>
                  </div>
                </div>

                {/* Series 4 */}
                <div className="space-y-1 pt-1">
                  <p className="font-bold text-zinc-400 border-b border-white/5 pb-0.5">第四彈：虛空終結</p>
                  <div className="grid grid-cols-2 gap-1 text-zinc-400">
                    <label className="flex items-center gap-1 cursor-pointer select-none hover:text-white">
                      <input type="checkbox" checked={ownedCards["016"]} onChange={(e) => setOwnedCards(prev => ({ ...prev, "016": e.target.checked }))} className="rounded border-zinc-700 bg-zinc-900 text-amber-500 focus:ring-amber-500/20 w-2.5 h-2.5" />
                      <span>☀️ 日冕 (+20% 暗)</span>
                    </label>
                    <label className="flex items-center gap-1 cursor-pointer select-none hover:text-white">
                      <input type="checkbox" checked={ownedCards["017"]} onChange={(e) => setOwnedCards(prev => ({ ...prev, "017": e.target.checked }))} className="rounded border-zinc-700 bg-zinc-900 text-amber-500 focus:ring-amber-500/20 w-2.5 h-2.5" />
                      <span>🥀 凋零 (+15% 木)</span>
                    </label>
                    <label className="flex items-center gap-1 cursor-pointer select-none hover:text-white">
                      <input type="checkbox" checked={ownedCards["018"]} onChange={(e) => setOwnedCards(prev => ({ ...prev, "018": e.target.checked }))} className="rounded border-zinc-700 bg-zinc-900 text-amber-500 focus:ring-amber-500/20 w-2.5 h-2.5" />
                      <span>❄️ 絕對零度 (+20% 水)</span>
                    </label>
                    <label className="flex items-center gap-1 cursor-pointer select-none hover:text-white">
                      <input type="checkbox" checked={ownedCards["019"]} onChange={(e) => setOwnedCards(prev => ({ ...prev, "019": e.target.checked }))} className="rounded border-zinc-700 bg-zinc-900 text-amber-500 focus:ring-amber-500/20 w-2.5 h-2.5" />
                      <span>💥 超新星 (+20% 光)</span>
                    </label>
                    <label className="flex items-center gap-1 cursor-pointer select-none hover:text-white">
                      <input type="checkbox" checked={ownedCards["020"]} onChange={(e) => setOwnedCards(prev => ({ ...prev, "020": e.target.checked }))} className="rounded border-zinc-700 bg-zinc-900 text-amber-500 focus:ring-amber-500/20 w-2.5 h-2.5" />
                      <span>☣️ 湮滅 (+25% 火)</span>
                    </label>
                    <label className="flex items-center gap-1 cursor-pointer select-none text-amber-400 font-semibold hover:text-amber-300">
                      <input type="checkbox" checked={ownedCards["SSR_4"]} onChange={(e) => setOwnedCards(prev => ({ ...prev, "SSR_4": e.target.checked }))} className="rounded border-zinc-700 bg-zinc-900 text-amber-500 focus:ring-amber-500/20 w-2.5 h-2.5" />
                      <span>🕳️ 虛空終結 (+40% 傷)</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white/5 rounded-xl p-3 text-left text-[10px] text-zinc-400 space-y-1 border border-white/5 leading-relaxed">
              <p className="font-semibold text-zinc-300">🎮 戰鬥核心機制與屬性相剋：</p>
              <p>• 屬性相剋：🔥 剋 🌿 剋 💧 剋 🔥，✨ 與 🌑 互剋 (光暗雙向加倍)</p>
              <p>• 屬性剋制造成 <strong className="text-emerald-400">2.0 倍傷害</strong>，被剋制則造成 <strong className="text-red-400">0.5 倍傷害</strong></p>
              <p>• 消除 💗 可回復血量。每多 1 Combo，全隊最終攻擊力額外加成 25%！</p>
            </div>

            <div className="pt-1 space-y-2.5">
              <button
                onClick={startTestGame}
                className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-black font-extrabold rounded-xl transition-all shadow-[0_4px_12px_rgba(251,191,36,0.3)] hover:scale-[1.02]"
              >
                開始挑戰
              </button>
              <Link
                href="/login"
                className="block w-full py-2 bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white rounded-xl text-xs transition-colors"
              >
                返回登入頁面
              </Link>
            </div>
          </div>
        )}

        {/* Play Field: Playing, Cascading, Attacking, Enemy Turn */}
        {(phase === "playing" || phase === "cascading" || phase === "attacking" || phase === "enemy_turn") && (
          <div
            className="w-full rounded-2xl px-4 py-5 border border-white/10 space-y-4 relative"
            style={{
              background: "rgba(255,255,255,0.04)",
              backdropFilter: "blur(10px)",
            }}
          >
            <div className="relative w-full flex flex-col items-center gap-4">
              {/* 1. Boss Area */}
              {boss && (
                <div 
                  className={cn(
                    "w-full rounded-2xl p-4 border border-white/10 flex flex-col items-center relative transition-all duration-300 overflow-visible",
                    boss.bgGlow
                  )}
                  style={{
                    background: "rgba(0,0,0,0.4)",
                    backdropFilter: "blur(8px)",
                    transform: bossShake ? "translate(3px, 3px) rotate(0.5deg)" : "none"
                  }}
                >
                  {/* Floating Damage Layer */}
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center overflow-visible z-50">
                    <AnimatePresence>
                      {damageEffects.filter(e => e.type === "damage").map((effect) => (
                        <motion.div
                          key={effect.id}
                          initial={{ opacity: 0, scale: 0.5, y: 10 }}
                          animate={{ opacity: 1, scale: 1.4, y: -40 - effect.yOffset }}
                          exit={{ opacity: 0, y: -80 - effect.yOffset }}
                          className={cn("absolute text-center", effect.color)}
                          style={{ textShadow: "0 0 8px rgba(0,0,0,0.9)" }}
                        >
                          {effect.text}
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>

                  {/* Boss Info */}
                  <div className="flex w-full justify-between items-center mb-1">
                    <div className="flex items-center gap-1.5">
                      <span className={cn("text-[9px] font-extrabold px-2 py-0.5 rounded-full border bg-zinc-950", 
                        boss.element === "FIRE" ? "text-red-400 border-red-500/30" :
                        boss.element === "WATER" ? "text-blue-400 border-blue-500/30" :
                        boss.element === "WOOD" ? "text-emerald-400 border-emerald-500/30" :
                        boss.element === "LIGHT" ? "text-yellow-400 border-yellow-500/30" :
                        "text-purple-400 border-purple-500/30"
                      )}>
                        {boss.element === "FIRE" ? "🔥 FIRE" :
                         boss.element === "WATER" ? "💧 WATER" :
                         boss.element === "WOOD" ? "🌿 WOOD" :
                         boss.element === "LIGHT" ? "✨ LIGHT" :
                         "🌑 DARK"}
                      </span>
                      <span className="font-bold text-xs text-zinc-100">{boss.name}</span>
                    </div>
                    <div>
                      {/* CD Indicator */}
                      <span className={cn(
                        "text-[10px] font-black px-2 py-0.5 rounded-md border transition-all duration-300",
                        boss.cd === 1 
                          ? "bg-red-500/20 text-red-400 border-red-500/50 animate-pulse font-extrabold" 
                          : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                      )}>
                        CD {boss.cd}
                      </span>
                    </div>
                  </div>

                  {/* Boss Portrait */}
                  <div className="relative w-20 h-20 my-1.5 flex items-center justify-center text-5xl">
                    <span className={cn(
                      "transition-all duration-150 select-none",
                      bossFlash ? "brightness-150 scale-110 saturate-200" : ""
                    )}>
                      {boss.emoji}
                    </span>
                    {/* Element Aura Effect */}
                    <div className={cn(
                      "absolute -z-10 w-16 h-16 rounded-full blur-xl opacity-30 animate-pulse",
                      boss.element === "FIRE" ? "bg-red-500" :
                      boss.element === "WATER" ? "bg-blue-500" :
                      boss.element === "WOOD" ? "bg-emerald-500" :
                      boss.element === "LIGHT" ? "bg-yellow-400" :
                      "bg-purple-600"
                    )} />
                  </div>

                  {/* Boss HP Bar */}
                  <div className="w-full space-y-0.5">
                    <div className="flex justify-between text-[9px] text-zinc-400 font-mono">
                      <span>HP</span>
                      <span>{boss.hp.toLocaleString()} / {boss.maxHp.toLocaleString()}</span>
                    </div>
                    <div className="w-full h-2.5 bg-zinc-950 border border-white/5 rounded-full overflow-hidden relative">
                      <div 
                        className="h-full bg-red-950 absolute top-0 left-0 transition-all duration-700"
                        style={{ width: `${(boss.hp / boss.maxHp) * 100}%` }}
                      />
                      <div 
                        className={cn("h-full transition-all duration-300 absolute top-0 left-0",
                          boss.element === "FIRE" ? "bg-red-500" :
                          boss.element === "WATER" ? "bg-blue-500" :
                          boss.element === "WOOD" ? "bg-emerald-500" :
                          boss.element === "LIGHT" ? "bg-yellow-400" :
                          "bg-purple-600"
                        )}
                        style={{ width: `${(boss.hp / boss.maxHp) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Floating Heal Layer */}
              <div className="absolute inset-x-0 bottom-40 pointer-events-none flex justify-center overflow-visible z-50">
                <AnimatePresence>
                  {damageEffects.filter(e => e.type === "heal").map((effect) => (
                    <motion.div
                      key={effect.id}
                      initial={{ opacity: 0, scale: 0.5, y: 20 }}
                      animate={{ opacity: 1, scale: 1.3, y: -30 }}
                      exit={{ opacity: 0, y: -65 }}
                      className={cn("absolute text-center", effect.color)}
                    >
                      {effect.text}
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>

              {/* Projectile animation */}
              {activeAttacker && activeAttacker !== "RECOVERY" && (
                <motion.div
                  initial={{ 
                    x: getAttackerXOffset(activeAttacker), 
                    y: 190, 
                    scale: 0.5, 
                    opacity: 0 
                  }}
                  animate={{ 
                    y: -80, 
                    scale: 1.6, 
                    opacity: [0, 1, 1, 0] 
                  }}
                  transition={{ 
                    duration: 0.45, 
                    ease: "easeInOut" 
                  }}
                  className={cn(
                    "absolute w-7 h-7 rounded-full blur-[1px] flex items-center justify-center text-xs z-50 border border-white/50",
                    activeAttacker === "FIRE" ? "bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.8)]" :
                    activeAttacker === "WATER" ? "bg-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.8)]" :
                    activeAttacker === "WOOD" ? "bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.8)]" :
                    activeAttacker === "LIGHT" ? "bg-yellow-400 shadow-[0_0_15px_rgba(250,204,21,0.8)]" :
                    "bg-purple-600 shadow-[0_0_15px_rgba(147,51,234,0.8)]"
                  )}
                >
                  {activeAttacker === "FIRE" ? "🔥" :
                   activeAttacker === "WATER" ? "💧" :
                   activeAttacker === "WOOD" ? "🌿" :
                   activeAttacker === "LIGHT" ? "✨" :
                   "🌑"}
                </motion.div>
              )}

              {/* 2. Combat Status Header */}
              <div className="flex items-center justify-between w-full px-1">
                <div>
                  {phase === "playing" && (
                    <>
                      <p className="text-[10px] text-zinc-500">戰鬥進行中</p>
                      <p className="text-xs font-semibold text-zinc-300">第 {wave} 波敵人</p>
                    </>
                  )}
                  {phase === "cascading" && (
                    <>
                      <p className="text-[10px] text-zinc-500">消珠階段</p>
                      <p className="text-xs font-bold text-amber-400">天降落珠中...</p>
                    </>
                  )}
                  {phase === "attacking" && (
                    <>
                      <p className="text-[10px] text-zinc-500">攻擊階段</p>
                      <p className="text-xs font-bold text-red-400 animate-pulse">我方發動屬性技能！</p>
                    </>
                  )}
                  {phase === "enemy_turn" && (
                    <>
                      <p className="text-[10px] text-zinc-500">敵方回合</p>
                      <p className="text-xs font-bold text-red-500 animate-pulse">敵方 Boss 準備攻擊...</p>
                    </>
                  )}
                </div>
                
                {phase === "playing" ? (
                  <div className="flex flex-col items-end gap-1">
                    <span className={`text-xl font-black tabular-nums tracking-wider ${timeLeft <= 1.5 ? "text-red-400 animate-pulse" : "text-amber-400"}`}>
                      {timeLeft.toFixed(1)}s
                    </span>
                    <div className="w-20 h-1 bg-white/10 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-100 ${timeLeft <= 1.5 ? "bg-red-500" : "bg-amber-400"}`}
                        style={{ width: `${(timeLeft / (ownedCards["014"] ? 6.0 : 5.0)) * 100}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="text-right">
                    <span className="text-xl font-black text-emerald-400">{combos}</span>
                    <span className="text-[10px] text-zinc-400 ml-1">Combo</span>
                  </div>
                )}
              </div>

              {phase === "playing" && (
                <p className="text-center text-[10px] text-zinc-400 font-semibold animate-pulse w-full">
                  {!dragStarted ? "👈 拖動任一寶珠即開始 5 秒計時！" : "計時中...盡快排出 Combo！"}
                </p>
              )}

              {/* 3. Orb Grid */}
              <div className="flex justify-center w-full py-1">
                <OrbGrid
                  initialGrid={currentGrid}
                  disabled={phase !== "playing"}
                  onGridChange={setCurrentGrid}
                  onRelease={runCascadeAnimation}
                  onStartDrag={() => setDragStarted(true)}
                  matchedIndices={matchedIndices}
                />
              </div>

              {/* 4. Player Team & HP Section */}
              <div className="w-full flex flex-col items-center">
                {/* Player HP */}
                <div className="w-full space-y-0.5">
                  <div className="flex justify-between text-[9px] text-zinc-400 font-mono">
                    <span className="flex items-center gap-0.5">💖 我方血量</span>
                    <span>{playerHp.toLocaleString()} / {playerMaxHp.toLocaleString()}</span>
                  </div>
                  <div className={cn(
                    "w-full h-2 bg-zinc-950 border border-white/5 rounded-full overflow-hidden relative transition-all duration-300",
                    playerFlash ? "ring-2 ring-red-500 scale-95" : ""
                  )}>
                    <div 
                      className={cn("h-full transition-all duration-300",
                        (playerHp / playerMaxHp) > 0.5 ? "bg-emerald-500" :
                        (playerHp / playerMaxHp) > 0.2 ? "bg-amber-500" :
                        "bg-red-500 animate-pulse"
                      )}
                      style={{ width: `${(playerHp / playerMaxHp) * 100}%` }}
                    />
                  </div>
                </div>

                {/* Character Cards */}
                <div className="grid grid-cols-5 gap-1 w-full mt-1.5">
                  {PLAYER_TEAM.map((char) => {
                    const isActive = activeAttacker === char.id;
                    const boost = getCardBoostMultiplier(char.id, ownedCards);
                    return (
                      <motion.div
                        key={char.id}
                        animate={{
                          y: isActive ? -10 : 0,
                          scale: isActive ? 1.05 : 1,
                        }}
                        transition={{ type: "spring", stiffness: 350, damping: 15 }}
                        className={cn(
                          "flex flex-col items-center p-1 rounded-xl border transition-all duration-300 text-center relative overflow-hidden",
                          isActive ? char.bgGlow : "border-white/5 bg-zinc-950/40"
                        )}
                      >
                        <span className="text-xl mb-0.5 select-none">{char.emoji}</span>
                        <span className="text-[8px] font-bold text-zinc-300 truncate w-full">{char.name}</span>
                        
                        <div className="flex flex-col items-center">
                          <span className={cn("text-[7px] font-mono leading-none", char.colorClass)}>
                            ATK {char.baseAtk}
                          </span>
                          {boost > 1.0 && (
                            <span className="text-[6.5px] font-mono font-bold text-amber-400 mt-0.5 leading-none">
                              +{Math.round((boost - 1) * 100)}%
                            </span>
                          )}
                        </div>

                        <div className={cn(
                          "absolute top-1 right-1 w-1 h-1 rounded-full",
                          char.id === "FIRE" ? "bg-red-500" :
                          char.id === "WATER" ? "bg-blue-500" :
                          char.id === "WOOD" ? "bg-emerald-500" :
                          char.id === "LIGHT" ? "bg-yellow-400" :
                          "bg-purple-600"
                        )} />
                      </motion.div>
                    );
                  })}
                </div>
              </div>

              {/* 5. Battle Logs Console */}
              <div className="w-full bg-black/60 rounded-xl p-2.5 border border-white/5 h-16 overflow-y-auto text-[9px] font-mono text-zinc-400 space-y-0.5 scrollbar-thin scrollbar-thumb-zinc-800">
                {battleLogs.slice(-4).map((log, idx) => (
                  <div key={idx} className={cn(
                    log.startsWith("🎉") || log.startsWith("💖") ? "text-emerald-400 font-semibold" :
                    log.startsWith("⚡") || log.startsWith("💀") ? "text-red-400 font-semibold" :
                    log.includes("攻擊！") ? "text-zinc-200" : "text-zinc-500"
                  )}>
                    {log}
                  </div>
                ))}
              </div>

              {phase === "playing" && (
                <button
                  onClick={() => runCascadeAnimation(currentGrid)}
                  className="w-full py-2.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/25 text-red-300 hover:text-white rounded-xl text-xs font-semibold transition-colors"
                >
                  提前結束並計算連擊
                </button>
              )}
            </div>
          </div>
        )}

        {/* Phase: Victory */}
        {phase === "victory" && (
          <div
            className="w-full rounded-2xl px-6 py-8 border border-emerald-500/20 text-center space-y-6 relative overflow-hidden"
            style={{
              background: "rgba(6,78,59,0.2)",
              backdropFilter: "blur(10px)",
            }}
          >
            <div className="absolute inset-0 bg-emerald-500/5 -z-10 animate-pulse" />
            
            <div className="space-y-1">
              <span className="inline-block px-3 py-1 bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 rounded-full text-xs font-extrabold animate-bounce">
                STAGE CLEAR
              </span>
              <h2 className="text-3xl font-black text-emerald-400 pt-2 tracking-wide">波次突破！</h2>
              <p className="text-zinc-300 text-sm">你成功擊敗了 {boss?.name}！</p>
            </div>

            {/* Stats Card */}
            <div className="bg-black/40 rounded-xl p-5 border border-white/5 space-y-3 text-left">
              <div className="flex justify-between text-xs text-zinc-400">
                <span>目前突破波次</span>
                <span className="font-bold text-white">Wave {wave}</span>
              </div>
              <div className="flex justify-between text-xs text-zinc-400">
                <span>累計造成傷害</span>
                <span className="font-bold text-red-400">{totalDamageDealt.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-xs text-zinc-400">
                <span>最高連擊數</span>
                <span className="font-bold text-amber-400">{maxCombo} Combo</span>
              </div>
              <div className="flex justify-between text-xs text-emerald-400 font-semibold pt-2 border-t border-white/5">
                <span>隊伍目前生命值</span>
                <span>{playerHp.toLocaleString()} / {playerMaxHp.toLocaleString()}</span>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <button
                onClick={proceedToNextWave}
                className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold rounded-xl transition-all shadow-[0_4px_12px_rgba(16,185,129,0.3)] hover:scale-[1.02] flex items-center justify-center gap-2"
              >
                <span>挑戰下一波 (Wave {wave + 1})</span>
                <span className="text-sm font-light">➡️</span>
              </button>
              <button
                onClick={finishAndShowResults}
                className="w-full py-2.5 bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white rounded-xl text-sm transition-colors border border-white/5"
              >
                結算並退出
              </button>
            </div>
          </div>
        )}

        {/* Phase: GameOver */}
        {phase === "gameover" && (
          <div
            className="w-full rounded-2xl px-6 py-8 border border-red-500/20 text-center space-y-6 relative overflow-hidden"
            style={{
              background: "rgba(127,29,29,0.2)",
              backdropFilter: "blur(10px)",
            }}
          >
            <div className="absolute inset-0 bg-red-500/5 -z-10 animate-pulse" />
            
            <div className="space-y-1">
              <span className="inline-block px-3 py-1 bg-red-500/25 text-red-300 border border-red-500/30 rounded-full text-xs font-extrabold">
                DEFEATED
              </span>
              <h2 className="text-3xl font-black text-red-500 pt-2 tracking-wide">挑戰結束</h2>
              <p className="text-zinc-400 text-xs">小隊生命值歸零，在第 {wave} 波倒下...</p>
            </div>

            {/* Summary Card */}
            <div className="bg-black/40 rounded-xl p-5 border border-white/5 space-y-3 text-left">
              <div className="flex justify-between text-xs text-zinc-400">
                <span>止步波次</span>
                <span className="font-bold text-white">Wave {wave}</span>
              </div>
              <div className="flex justify-between text-xs text-zinc-400">
                <span>擊敗 Boss 數</span>
                <span className="font-bold text-emerald-400">{wave - 1} 個</span>
              </div>
              <div className="flex justify-between text-xs text-zinc-400">
                <span>累積造成傷害</span>
                <span className="font-bold text-red-400">{totalDamageDealt.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-xs text-zinc-400">
                <span>最高連擊數</span>
                <span className="font-bold text-amber-400">{maxCombo} Combo</span>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <button
                onClick={finishAndShowResults}
                className="w-full py-3.5 bg-amber-500 hover:bg-amber-400 text-black font-extrabold rounded-xl transition-all shadow-[0_4px_12px_rgba(251,191,36,0.3)] hover:scale-[1.02]"
              >
                查看結算畫面
              </button>
              <button
                onClick={startTestGame}
                className="w-full py-2.5 bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white rounded-xl text-sm transition-colors border border-white/5"
              >
                重新開始戰鬥
              </button>
            </div>
          </div>
        )}

        {/* Phase: Result */}
        {phase === "result" && (
          <div
            className="w-full rounded-2xl px-6 py-8 border border-white/10 text-center space-y-6"
            style={{
              background: "rgba(255,255,255,0.04)",
              backdropFilter: "blur(10px)",
            }}
          >
            <div className="space-y-1">
              <span className="inline-block px-3 py-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-full text-xs font-bold">
                最終結果
              </span>
              <h2 className="text-3xl font-black pt-2 text-zinc-100">戰鬥結算報告</h2>
            </div>

            {/* Stats list */}
            <div className="bg-white/5 rounded-xl p-5 border border-white/5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-zinc-500 text-xs">成功突破波次</p>
                  <p className="text-3xl font-extrabold text-white">
                    {wave - 1} <span className="text-xs font-normal text-zinc-400">Wave</span>
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-zinc-500 text-xs">最大連擊數</p>
                  <p className="text-3xl font-extrabold text-amber-400">
                    {maxCombo} <span className="text-xs font-normal text-zinc-400">Combo</span>
                  </p>
                </div>
              </div>

              <div className="h-px bg-white/10" />

              <div className="space-y-1.5 text-left px-2">
                <div className="flex justify-between text-xs text-zinc-400">
                  <span>累積造成傷害</span>
                  <span className="text-red-400 font-semibold">{totalDamageDealt.toLocaleString()} 點</span>
                </div>
                <div className="flex justify-between text-xs text-zinc-400">
                  <span>累積治療量</span>
                  <span className="text-emerald-400 font-semibold">{totalHealingDone.toLocaleString()} 點</span>
                </div>
                <div className="flex justify-between text-xs text-zinc-400">
                  <span>關卡測試點數</span>
                  <span>{baseReward.toLocaleString()} 點</span>
                </div>
                <div className="flex justify-between text-xs text-zinc-400">
                  <span>波次過關加成 (每波 +500)</span>
                  <span>{((wave - 1) * 500).toLocaleString()} 點</span>
                </div>
                <div className="flex justify-between text-xs text-zinc-400">
                  <span>最大 Combo 乘數</span>
                  <span>{multiplier}x</span>
                </div>
                <div className="flex justify-between text-sm font-extrabold text-emerald-400 pt-2.5 border-t border-white/10 mt-2.5">
                  <span>獲得總點數</span>
                  <span>{Math.round((baseReward + (wave - 1) * 500) * multiplier).toLocaleString()} 點</span>
                </div>
              </div>
            </div>

            {/* Buttons */}
            <div className="space-y-3 pt-2">
              <button
                onClick={startTestGame}
                className="w-full py-3.5 bg-amber-500 hover:bg-amber-400 text-black font-extrabold rounded-xl transition-all shadow-[0_4px_12px_rgba(251,191,36,0.3)] hover:scale-[1.02]"
              >
                再玩一次
              </button>
              <Link
                href="/login"
                className="block w-full py-2.5 bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white rounded-xl text-sm transition-colors border border-white/5"
              >
                返回登入頁面
              </Link>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
