'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ClawScene, { type CameraView } from './ClawScene';
import { describeMiss, describeSlip } from './feedback';
import { SLOT_LABEL, layoutViews, type ViewLayout, type ViewSlot } from './viewLayout';
import Joystick, { type StickDir } from './Joystick';
import ServicePanel, { type ServiceTab } from './ServicePanel';
import MachinePicker from './MachinePicker';
import {
  createSim, diceFocus, disposeSim, drainEvents, gripMargin, heldPrize, initPhysics, insertCoin, isPhysicsReady,
  chuteFrom, holdsDiceOnly, lastTowerResult, pressDrop, prizesLeft, restock, setAntiSwing, setBedLift, setChute, setClaw,
  setField, setPrizeCount, setGantry, setShakerConfig, setTowerConfig, topUp,
  type ClawSim, type Joystick as JoyInput, type Phase, type PowerStage, type PrizeKind, type ShakerResult, type Stats,
  type TowerResult,
} from './clawSim';
import { buildClawSpec, type ClawFit, type ClawType } from './claws';
import {
  FLEET_KEY, LEGACY_KEYS, activeMachine, sanitizeFleet, updateMachine,
  type Books, type Fleet, type MachineConfig, type Rig,
} from './fleet';
import {
  FLEET_SAVED_AT_KEY, SYNC_LABEL, fetchServerFleet, pickStart, putServerFleet, shopFromUrl, type SyncState,
} from './fleetSync';
import { itemDef } from './items';
import { isRed } from './tower';
import { MAX_POWER, SETTING_DEFS, stepSetting, type ClawSettings } from './settings';

const VIEW_BUTTONS: { id: CameraView; label: string }[] = [
  { id: 'front', label: '正面' }, { id: 'side', label: '側面' },
  { id: 'angle', label: '斜角' }, { id: 'top', label: '俯視' },
];
const LAYOUT_BUTTONS: { id: ViewLayout; label: string }[] = [
  { id: 'single', label: '單畫面' }, { id: 'pip', label: '子母畫面' }, { id: 'quad', label: '四分割' },
];
/** Clicking a helper view's inset flies the main camera to the matching preset. */
const SLOT_PRESET: Partial<Record<ViewSlot, CameraView>> = { side: 'side', top: 'top' };

const STAGE_LABEL: Record<PowerStage, string> = { strong: '強', mid: '中', weak: '弱', guarantee: '保夾' };
const STAGE_BAR: Record<PowerStage, string> = {
  strong: 'bg-emerald-400', mid: 'bg-amber-400', weak: 'bg-rose-400', guarantee: 'bg-sky-400',
};

const PHASE_LABEL: Record<Phase, string> = {
  idle: '請投幣', moving: '移動天車', dropping: '下爪中', closing: '夾取',
  lifting: '上升', top: '到頂', returning: '回程', releasing: '放爪', resetting: '復位',
};

interface Hud {
  phase: Phase;
  timer: number;
  credits: number;
  coins: number;
  power: number;
  stage: PowerStage;
  /** Cable out below the top stop (m). */
  line: number;
  margin: number | null;
  guaranteed: boolean;
  sinceGuarantee: number;
  remaining: number;
  /** The last load stopped short because the pile reached the claw. */
  full: boolean;
  /** How far the claw hangs out from under the trolley (m). */
  swing: number;
  /** How many 大怒神 stand in the cabinet (0 on other 檯面), and the last throw on any of them. */
  towers: number;
  dice: (TowerResult & { tower: number; double: boolean }) | null;
  /** A 搖骰子盒 is fitted; its last shake (points, reds, paid out?), if any. */
  shaker: { result: ShakerResult | null } | null;
  /** The cabinet holds only dice (大怒神 or 搖骰子盒), no prizes. */
  diceOnly: boolean;
  /** The claw cam is showing dice close up. */
  diceCam: boolean;
  stats: Stats;
}

function readJson(key: string): unknown {
  try {
    return JSON.parse(window.localStorage.getItem(key) ?? 'null');
  } catch {
    return null;
  }
}

/** The saved machines; the first visit after fleets arrived turns the old single machine into 1號機. */
function loadFleet(): Fleet {
  const saved = readJson(FLEET_KEY);
  if (saved) return sanitizeFleet(saved);
  return sanitizeFleet(null, { settings: readJson(LEGACY_KEYS.settings), rig: readJson(LEGACY_KEYS.rig) });
}

/** When the browser's copy of the fleet was last changed (0 if never recorded). */
function loadSavedAt(): number {
  try {
    const n = Number(window.localStorage.getItem(FLEET_SAVED_AT_KEY));
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

/** Where the machines start from: the fleet, when it was saved, and whether the store is there (and needs this copy). */
interface Boot { shop: string; fleet: Fleet; savedAt: number; online: boolean; upload: boolean }

async function bootFleet(): Promise<Boot> {
  const shop = shopFromUrl();
  const local = loadFleet();
  const localAt = loadSavedAt();
  const server = await fetchServerFleet(shop);
  const start = pickStart(localAt, server);
  if (start.use === 'server' && typeof server === 'object') {
    const fleet = sanitizeFleet(server.fleet);
    // Refresh the browser's copy with the store's.
    try {
      window.localStorage.setItem(FLEET_KEY, JSON.stringify(fleet));
      window.localStorage.setItem(FLEET_SAVED_AT_KEY, String(server.savedAt));
    } catch { /* private mode */ }
    return { shop, fleet, savedAt: server.savedAt, online: true, upload: false };
  }
  return { shop, fleet: local, savedAt: localAt, online: start.online, upload: start.upload };
}

function booksOf(sim: ClawSim): Books {
  return { stats: { ...sim.stats }, sinceGuarantee: sim.sinceGuarantee };
}

function snapshot(sim: ClawSim): Hud {
  return {
    phase: sim.phase,
    timer: sim.timer,
    credits: sim.credits,
    coins: sim.coins,
    power: sim.claw.power,
    stage: sim.powerStage,
    line: sim.claw.line,
    margin: heldPrize(sim) ? gripMargin(sim) : null,
    guaranteed: sim.guaranteed,
    sinceGuarantee: sim.sinceGuarantee,
    remaining: prizesLeft(sim),
    full: sim.full,
    swing: Math.hypot(sim.claw.hx - sim.claw.x, sim.claw.hz - sim.claw.z),
    towers: sim.towers.length,
    dice: lastTowerResult(sim),
    shaker: sim.shaker ? { result: sim.shaker.result } : null,
    diceOnly: holdsDiceOnly(sim.field),
    diceCam: diceFocus(sim) !== null,
    stats: { ...sim.stats },
  };
}

/** Dice points as the die faces ⚀–⚅. */
const DIE_GLYPH = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
const CELL_NAME = ['左格', '右格'];

/** A throw's points, cell by cell on a 雙格 (「左格 ⚀ ⚃ ／ 右格 ⚅」). */
function diceText(faces: number[][]) {
  const glyphs = (f: number[]) => f.map((n) => DIE_GLYPH[n - 1]).join(' ');
  return faces.length === 1 ? glyphs(faces[0]) : faces.map((f, i) => `${CELL_NAME[i]} ${glyphs(f)}`).join('　／　');
}

/** 「第 2 座」 when there's more than one tower to tell apart. */
function towerName(sim: ClawSim, index: number) {
  return sim.towers.length > 1 ? `第 ${index + 1} 座` : '';
}

/** Loads the physics engine (WASM) and the machines' settings first, then mounts the machine. */
export default function ClawMachineGame() {
  const [ready, setReady] = useState(isPhysicsReady);
  const [failed, setFailed] = useState(false);
  const [boot, setBoot] = useState<Boot | null>(null);
  useEffect(() => {
    if (ready) return;
    let live = true;
    initPhysics().then(() => { if (live) setReady(true); }, () => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [ready]);
  useEffect(() => {
    let live = true;
    bootFleet().then((b) => { if (live) setBoot(b); });
    return () => { live = false; };
  }, []);
  if (ready && boot) return <ArcadeFloor boot={boot} />;
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[#0b0718] text-fuchsia-200">
      <div className="text-center">
        <div className="mb-3 animate-pulse text-3xl">🧸</div>
        <div className="text-sm text-white/50">
          {failed ? '物理引擎載入失敗，請重新整理' : !ready ? '載入物理引擎...' : '讀取機台設定...'}
        </div>
      </div>
    </div>
  );
}

/**
 * The operator's machines, one on screen at a time. Switching remounts the
 * machine (keyed by id), so each loads its own settings, rig and books.
 * Every change goes to the browser at once and to the store (see
 * fleetSync.ts) a moment later, or as the page closes.
 */
function ArcadeFloor({ boot }: { boot: Boot }) {
  const [fleet, setFleet] = useState<Fleet>(boot.fleet);
  const [sync, setSync] = useState<SyncState>(boot.online ? (boot.upload ? 'saving' : 'saved') : 'offline');
  const latest = useRef({ fleet: boot.fleet, savedAt: boot.savedAt });
  const lastJson = useRef<string | null>(boot.upload ? null : JSON.stringify(boot.fleet));
  const timer = useRef<number | undefined>(undefined);

  const push = useCallback(async (keepalive = false) => {
    timer.current = undefined;
    const { fleet: f, savedAt } = latest.current;
    const ok = await putServerFleet(boot.shop, f, savedAt, keepalive);
    if (latest.current.savedAt !== savedAt) return; // a newer change is on its way
    setSync(ok ? 'saved' : 'error');
    // The store didn't take it: try again in a while.
    if (!ok) timer.current = window.setTimeout(() => void push(), 5000);
  }, [boot.shop]);

  useEffect(() => {
    const json = JSON.stringify(fleet);
    if (json === lastJson.current) return;
    const first = lastJson.current === null;
    lastJson.current = json;
    // Uploading the copy loaded at start keeps its time; a real change is now.
    const savedAt = first ? boot.savedAt || Date.now() : Date.now();
    latest.current = { fleet, savedAt };
    try {
      window.localStorage.setItem(FLEET_KEY, json);
      window.localStorage.setItem(FLEET_SAVED_AT_KEY, String(savedAt));
    } catch { /* private mode */ }
    if (!boot.online) return;
    setSync('saving');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void push(), first ? 0 : 800);
  }, [fleet, boot, push]);

  // Leaving with a save still waiting: send it as the page goes.
  useEffect(() => {
    const flush = () => {
      if (timer.current === undefined) return;
      window.clearTimeout(timer.current);
      void push(true);
    };
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [push]);

  const save = useCallback((id: string, patch: Partial<Omit<MachineConfig, 'id'>>) => {
    setFleet((f) => updateMachine(f, id, patch));
  }, []);
  const machine = activeMachine(fleet);
  return <ClawMachine key={machine.id} machine={machine} fleet={fleet} sync={sync} onFleet={setFleet} onSave={save} />;
}

interface MachineProps {
  machine: MachineConfig;
  fleet: Fleet;
  /** Where the fleet is saved to: the store, or only this browser. */
  sync: SyncState;
  onFleet: (f: Fleet) => void;
  /** Store a change to this machine's saved config. */
  onSave: (id: string, patch: Partial<Omit<MachineConfig, 'id'>>) => void;
}

function ClawMachine({ machine, fleet, sync, onFleet, onSave }: MachineProps) {
  const [settings, setSettings] = useState<ClawSettings>(machine.settings);
  const [rig, setRig] = useState<Rig>(machine.rig);
  const simRef = useRef<ClawSim | null>(null);
  if (!simRef.current) {
    const created = createSim(settings, {
      seed: Date.now() | 0, claw: rig.claw, clawFit: rig.fit, stock: rig.stock, chute: rig.chute,
      field: rig.field, bedLift: rig.bedLift, tower: rig.tower, shaker: rig.shaker, antiSwing: rig.antiSwing, gantry: rig.gantry,
    });
    // The machine's books carry over between visits, like the board's 帳目 and 累保.
    created.stats = { ...machine.books.stats };
    created.sinceGuarantee = machine.books.sinceGuarantee;
    simRef.current = created;
  }
  const sim = simRef.current;
  const machineId = machine.id;

  // Free the physics world's WASM memory when the machine goes away. Deferred
  // so React's dev-mode unmount/remount doesn't free a world still in use.
  useEffect(() => {
    const pending = (sim as ClawSim & { disposeTimer?: number }).disposeTimer;
    if (pending) window.clearTimeout(pending);
    return () => {
      (sim as ClawSim & { disposeTimer?: number }).disposeTimer = window.setTimeout(() => disposeSim(sim), 1000);
    };
  }, [sim]);

  const joyRef = useRef<JoyInput>({ x: 0, z: 0 });
  const [hud, setHud] = useState<Hud>(() => snapshot(sim));
  const [view, setView] = useState<CameraView>('front');
  const [viewNonce, setViewNonce] = useState(0);
  const [layout, setLayout] = useState<ViewLayout>('pip');
  const [aimAssist, setAimAssist] = useState(true);
  const stage = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ w: 0, h: 0 });
  const [service, setService] = useState(false);
  const [serviceTab, setServiceTab] = useState<ServiceTab>('board');
  const [menuIndex, setMenuIndex] = useState(0);
  const [monitor, setMonitor] = useState(() => window.innerWidth >= 640);
  const [restockKey, setRestockKey] = useState(0);
  const [toast, setToast] = useState<{ text: string; tone: 'win' | 'lose' | 'info'; id: number } | null>(null);
  const [won, setWon] = useState<PrizeKind[]>([]);

  // Settings are live: the sim reads them every step. Both are saved to this machine.
  useEffect(() => {
    sim.settings = settings;
    onSave(machineId, { settings });
  }, [sim, settings, machineId, onSave]);

  useEffect(() => {
    onSave(machineId, { rig });
  }, [rig, machineId, onSave]);

  // Books are saved whenever they change, and once more when leaving the machine.
  const savedBooks = useRef(JSON.stringify(machine.books));
  const saveBooks = useCallback(() => {
    const books = booksOf(sim);
    const json = JSON.stringify(books);
    if (json === savedBooks.current) return;
    savedBooks.current = json;
    onSave(machineId, { books });
  }, [sim, machineId, onSave]);
  useEffect(() => saveBooks, [saveBooks]);

  // HUD + event polling at 10 Hz; the scene itself updates every frame.
  useEffect(() => {
    const id = window.setInterval(() => {
      for (const e of drainEvents(sim)) {
        const now = Date.now();
        if (e.type === 'win') {
          setWon((w) => [...w, e.kind]);
          const item = itemDef(e.kind);
          const text = holdsDiceOnly(sim.field) ? `骰子中獎，出貨 ${item.icon} ${item.label}！` : `恭喜夾到 ${item.icon} ${item.label}！`;
          setToast({ text, tone: 'win', id: now });
        } else if (e.type === 'lift') {
          const name = towerName(sim, e.tower);
          setToast({ text: `吸住${name ? `${name}的` : ''}壓克力盒了！`, tone: 'info', id: now });
        } else if (e.type === 'drop') {
          setToast({ text: `${towerName(sim, e.tower)}大怒神！從 ${Math.round(e.height * 100)} cm 落下`, tone: 'info', id: now });
        } else if (e.type === 'dice') {
          const which = e.wins.length > 1 && e.wins.some(Boolean)
            ? `${e.wins.every(Boolean) ? '兩格都' : CELL_NAME[e.wins.indexOf(true)]}中獎！` : '中獎！';
          const verdict = e.guaranteed ? '沒中，保夾局照樣出貨' : e.win ? which : '沒中';
          setToast({ text: `${towerName(sim, e.tower)}骰子 ${diceText(e.faces)}　${verdict}`, tone: e.win ? 'win' : 'lose', id: now });
        } else if (e.type === 'shakeLift') setToast({ text: '吸住搖骰子盒的鐵板了！', tone: 'info', id: now });
        else if (e.type === 'shakeDrop') {
          setToast({ text: `拉了 ${Math.round(e.height * 100)} cm 被扯開，盒子彈回去亂晃！`, tone: 'info', id: now });
        } else if (e.type === 'shakeDice') {
          const verdict = e.guaranteed ? '沒中，保夾局照樣出貨' : e.win ? '中獎！' : '沒中';
          setToast({ text: `骰子 ${diceText([e.faces])}（紅點 ${e.reds} 顆）　${verdict}`, tone: e.win ? 'win' : 'lose', id: now });
        } else if (e.type === 'slip') setToast({ text: describeSlip(e.weak), tone: 'lose', id: now });
        else if (e.type === 'miss') setToast({ text: describeMiss(e.nearest), tone: 'lose', id: now });
        else if (e.type === 'timeUp') setToast({ text: '時間到！', tone: 'info', id: now });
      }
      setHud(snapshot(sim));
      saveBooks();
    }, 100);
    return () => window.clearInterval(id);
  }, [sim, saveBooks]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast((t) => (t?.id === toast.id ? null : t)), 3200);
    return () => window.clearTimeout(id);
  }, [toast]);

  // Track the canvas box so the HTML labels line up with the WebGL viewports.
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setStageSize({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pickView = useCallback((v: CameraView) => {
    setView(v);
    setViewNonce((k) => k + 1);
  }, []);

  const n = SETTING_DEFS.length;
  const stepCurrent = useCallback((dir: 1 | -1) => {
    setSettings((s) => stepSetting(s, SETTING_DEFS[menuIndex].key, dir));
  }, [menuIndex]);

  // In service mode the stick and button drive the menu, like on the board.
  const onStick = useCallback((d: StickDir) => {
    if (!service) { joyRef.current = { x: d.x, z: d.z }; return; }
    if (serviceTab !== 'board') return;
    if (d.z === -1) setMenuIndex((i) => (i - 1 + n) % n);
    else if (d.z === 1) setMenuIndex((i) => (i + 1) % n);
    else if (d.x !== 0) stepCurrent(d.x);
  }, [service, serviceTab, n, stepCurrent]);

  const onDrop = useCallback(() => {
    if (service) setMenuIndex((i) => (i + 1) % n);
    else pressDrop(sim);
  }, [service, n, sim]);

  const onCoin = useCallback(() => { if (!service) insertCoin(sim); }, [service, sim]);

  const toggleService = useCallback(() => {
    joyRef.current = { x: 0, z: 0 };
    setService((s) => !s);
  }, []);

  /** The stock the cabinet was last loaded to. */
  const appliedStock = useRef(rig.stock);
  const reloaded = useCallback(() => {
    appliedStock.current = sim.stock;
    setRestockKey((k) => k + 1);
    setHud(snapshot(sim));
  }, [sim]);

  const doRestock = useCallback(() => {
    restock(sim, rig.stock);
    reloaded();
  }, [sim, rig.stock, reloaded]);

  const doTopUp = useCallback(() => {
    topUp(sim, rig.stock);
    reloaded();
  }, [sim, rig.stock, reloaded]);

  // Stock edits apply to the cabinet as soon as the slider or checkbox
  // settles: a new count tops up or takes prizes off the top, and a new mix
  // of items reloads it.
  useEffect(() => {
    const prev = appliedStock.current;
    const next = rig.stock;
    if (prev === next) return;
    const id = window.setTimeout(() => {
      const sameItems = prev.categories.length === next.categories.length
        && prev.categories.every((c) => next.categories.includes(c));
      if (!sameItems) {
        restock(sim, next);
      } else {
        const live = prizesLeft(sim);
        const target = next.random ? Math.min(next.count, Math.max(next.countMin, live)) : next.count;
        if (target === live) {
          sim.stock = next;
          appliedStock.current = next;
          return;
        }
        setPrizeCount(sim, target, next);
      }
      reloaded();
    }, 350);
    return () => window.clearTimeout(id);
  }, [sim, rig.stock, reloaded]);

  // Chute edits (擋板 height, hole size) apply once the slider settles.
  const appliedChute = useRef(rig.chute);
  useEffect(() => {
    if (appliedChute.current === rig.chute) return;
    const id = window.setTimeout(() => {
      appliedChute.current = rig.chute;
      setChute(sim, rig.chute);
      reloaded();
    }, 250);
    return () => window.clearTimeout(id);
  }, [sim, rig.chute, reloaded]);
  const chute = useMemo(() => chuteFrom(rig.chute), [rig.chute]);

  // A new 檯面 resettles the pile on it.
  const appliedField = useRef(rig.field);
  useEffect(() => {
    if (appliedField.current === rig.field) return;
    appliedField.current = rig.field;
    setField(sim, rig.field);
    reloaded();
  }, [sim, rig.field, reloaded]);

  // A 3D 彈跳台's corner lift, once the slider settles.
  const appliedLift = useRef(rig.bedLift);
  useEffect(() => {
    if (appliedLift.current === rig.bedLift) return;
    const id = window.setTimeout(() => {
      appliedLift.current = rig.bedLift;
      setBedLift(sim, rig.bedLift);
      reloaded();
    }, 250);
    return () => window.clearTimeout(id);
  }, [sim, rig.bedLift, reloaded]);

  // Limit switches and start point: an idle claw goes straight to the new start point.
  useEffect(() => { setGantry(sim, rig.gantry); }, [sim, rig.gantry]);

  // A 大怒神's dice and rule take effect straight away, and so does a 搖骰子盒's.
  useEffect(() => { setTowerConfig(sim, rig.tower); }, [sim, rig.tower]);
  useEffect(() => { setShakerConfig(sim, rig.shaker); }, [sim, rig.shaker]);

  // The 防甩片 is cheap to refit: apply it straight away.
  useEffect(() => { setAntiSwing(sim, rig.antiSwing); }, [sim, rig.antiSwing]);

  const fitClaw = useCallback((claw: ClawType, fit: ClawFit) => {
    setClaw(sim, claw, fit);
    setRig((r) => ({ ...r, claw, fit }));
  }, [sim]);
  const clawSpec = buildClawSpec(rig.claw, rig.fit);

  // Keyboard: arrows/WASD = stick, Space/Enter = 下爪, C = coin, F2/P = service.
  useEffect(() => {
    const held = new Set<string>();
    const dirFromKeys = (): StickDir => {
      const x = (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0);
      const z = (held.has('down') ? 1 : 0) - (held.has('up') ? 1 : 0);
      return { x: x as StickDir['x'], z: z as StickDir['z'] };
    };
    const map: Record<string, string> = {
      ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
      ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
    };
    const down = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      const dir = map[e.code];
      if (dir) {
        e.preventDefault();
        if (service) {
          // Menu navigation acts per press (with key-repeat), not while held.
          onStick({ x: dir === 'left' ? -1 : dir === 'right' ? 1 : 0, z: dir === 'up' ? -1 : dir === 'down' ? 1 : 0 });
          return;
        }
        held.add(dir);
        onStick(dirFromKeys());
      } else if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat) {
        e.preventDefault();
        onDrop();
      } else if (e.code === 'KeyC' && !e.repeat) {
        onCoin();
      } else if ((e.code === 'F2' || e.code === 'KeyP') && !e.repeat) {
        e.preventDefault();
        toggleService();
      } else if (e.code === 'Escape' && service) {
        toggleService();
      }
    };
    const up = (e: KeyboardEvent) => {
      const dir = map[e.code];
      if (!dir || service) return;
      held.delete(dir);
      onStick(dirFromKeys());
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [service, onStick, onDrop, onCoin, toggleService]);

  const playing = hud.phase === 'moving';
  const lcdMain = service ? 'SETUP' : hud.phase === 'idle' && hud.credits === 0 ? 'INSERT COIN' : PHASE_LABEL[hud.phase];
  const powerPct = (hud.power / MAX_POWER) * 100;

  return (
    <main className="flex h-dvh flex-col overflow-hidden bg-[#0b0718] text-white">
      {/* Marquee / top bar */}
      <header className="flex shrink-0 items-center gap-2 border-b border-fuchsia-500/30 bg-gradient-to-r from-fuchsia-900/60 via-violet-900/60 to-fuchsia-900/60 px-3 py-2">
        <Link href="/games" className="rounded-md px-2 py-1 text-sm text-white/60 hover:text-white" aria-label="回遊戲大廳">←</Link>
        <h1 className="min-w-0 flex-1 truncate text-base font-black tracking-wider text-fuchsia-100 [text-shadow:0_0_12px_#e879f9] sm:text-lg">
          二代選物販賣機
        </h1>
        <MachinePicker fleet={fleet} onFleet={onFleet} />
        <span
          data-testid="fleet-sync"
          title={sync === 'offline' ? '連不到資料庫，設定先存在這台瀏覽器' : '機台設定存在資料庫（目前是 SQLite）'}
          className={`hidden shrink-0 text-[11px] sm:inline ${sync === 'saved' ? 'text-emerald-300/80' : sync === 'saving' ? 'text-white/50' : 'text-amber-300'}`}
        >
          {SYNC_LABEL[sync]}
        </span>
        {won.length > 0 && (
          <span className="max-w-[30%] truncate text-base leading-none" aria-label={`已夾到 ${won.length} 個`} title="已夾到">
            {won.map((k) => itemDef(k).icon).join('')}
          </span>
        )}
        <button type="button" onClick={() => setMonitor((m) => !m)} className={`rounded-md border px-2 py-1 text-xs ${monitor ? 'border-cyan-400/60 text-cyan-300' : 'border-white/15 text-white/60'}`}>
          監看
        </button>
        <button type="button" onClick={toggleService} className={`rounded-md border px-2 py-1 text-xs ${service ? 'border-amber-400 bg-amber-500 text-slate-950' : 'border-amber-400/60 text-amber-300'}`}>
          設定
        </button>
      </header>

      {/* View toolbar: camera preset, screen layout, aiming aid */}
      <nav className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-white/10 bg-black/30 px-3 py-1.5 text-xs [scrollbar-width:none]" aria-label="視角">
        <span className="shrink-0 text-white/40">視角</span>
        <div className="flex shrink-0 rounded-md border border-white/15">
          {VIEW_BUTTONS.map((b) => (
            <button key={b.id} type="button" onClick={() => pickView(b.id)}
              className={`px-2 py-1 first:rounded-l-md last:rounded-r-md ${view === b.id ? 'bg-white/20 text-white' : 'text-white/60 hover:text-white'}`}>
              {b.label}
            </button>
          ))}
        </div>
        <span className="shrink-0 text-white/40">畫面</span>
        <div className="flex shrink-0 rounded-md border border-white/15">
          {LAYOUT_BUTTONS.map((b) => (
            <button key={b.id} type="button" onClick={() => setLayout(b.id)}
              className={`px-2 py-1 first:rounded-l-md last:rounded-r-md ${layout === b.id ? 'bg-white/20 text-white' : 'text-white/60 hover:text-white'}`}>
              {b.label}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setAimAssist((a) => !a)}
          className={`shrink-0 rounded-md border px-2 py-1 ${aimAssist ? 'border-emerald-400/60 text-emerald-300' : 'border-white/15 text-white/60'}`}>
          ◎ 瞄準輔助
        </button>
        <span className="hidden shrink-0 text-white/35 lg:inline">拖曳畫面旋轉 · 滾輪/雙指縮放</span>
      </nav>

      <div className="relative flex min-h-0 flex-1">
        {/* Cabinet view */}
        <div ref={stage} className="relative min-w-0 flex-1">
          <ClawScene
            sim={sim} joyRef={joyRef} paused={service} restockKey={restockKey}
            view={view} viewNonce={viewNonce} layout={layout} aimAssist={aimAssist}
            clawKey={`${rig.claw}-${rig.fit.size}-${rig.fit.bend}-${rig.fit.openPct}`}
            chute={chute}
            field={rig.field}
            bedLift={rig.bedLift}
            tower={rig.tower}
            antiSwing={rig.antiSwing}
            gantry={rig.gantry}
            plate={String(fleet.machines.findIndex((m) => m.id === machine.id) + 1)}
            guideKey={service && serviceTab === 'board' ? SETTING_DEFS[menuIndex].key : null}
          />

          {/* Frames + labels over each viewport. Helper insets swallow pointer
              events (so dragging them doesn't orbit the main view) and a click
              flies the main camera to that angle. */}
          {layout !== 'single' && stageSize.w > 0 && layoutViews(layout, stageSize.w, stageSize.h).map((r) => {
            const preset = SLOT_PRESET[r.slot];
            const isMain = r.slot === 'main';
            return (
              <div
                key={r.slot}
                className={`absolute ${isMain ? 'pointer-events-none' : 'cursor-pointer rounded-md border-2 border-white/30 shadow-lg hover:border-amber-300'}`}
                style={{ left: r.x, top: r.y, width: r.w, height: r.h }}
                onClick={preset ? () => pickView(preset) : undefined}
                onKeyDown={preset ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickView(preset); } } : undefined}
                role={preset ? 'button' : undefined}
                tabIndex={preset ? 0 : undefined}
                aria-label={preset ? `主畫面切到${SLOT_LABEL[r.slot]}` : undefined}
                title={preset ? '點一下，主畫面轉到這個角度' : undefined}
              >
                {(!isMain || layout === 'quad') && (
                  <span className="pointer-events-none absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white/85">
                    {r.slot === 'claw' && hud.diceCam ? '骰子特寫' : SLOT_LABEL[r.slot]}
                  </span>
                )}
              </div>
            );
          })}

          {toast && (
            <div
              key={toast.id}
              className={`pointer-events-none absolute left-1/2 top-4 z-10 max-w-[90%] -translate-x-1/2 rounded-full px-5 py-2 text-center text-sm font-bold shadow-lg ${toast.tone === 'win' ? 'animate-bounce' : ''} ${
                toast.tone === 'win' ? 'bg-amber-400 text-slate-950' : toast.tone === 'lose' ? 'bg-slate-800/90 text-white' : 'bg-violet-600/90 text-white'
              }`}
            >
              {toast.text}
            </div>
          )}

          {monitor && (
            <div className="absolute left-2 top-2 w-44 rounded-lg border border-cyan-400/30 bg-slate-950/80 p-2 font-mono text-[11px] text-cyan-100 backdrop-blur">
              <div className="mb-1 flex justify-between text-cyan-400"><span>爪力監看</span><span>{PHASE_LABEL[hud.phase]}</span></div>
              <div className="flex items-center gap-2">
                <div className="h-2 flex-1 overflow-hidden rounded bg-slate-800">
                  <div
                    className={`h-full transition-[width] duration-100 ${STAGE_BAR[hud.stage]}`}
                    style={{ width: `${powerPct}%` }}
                  />
                </div>
                <span className="w-14 text-right tabular-nums">{STAGE_LABEL[hud.stage]} {hud.power.toFixed(0)}V</span>
              </div>
              <div className="mt-1 flex justify-between gap-2 text-slate-400">
                <span className="shrink-0">爪子</span>
                <span className="truncate text-cyan-200">{clawSpec.label}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>強/中/弱 {[settings.strongPower, settings.midPower, settings.weakPower].map((v) => v.toFixed(0)).join('/')}</span>
                <span className={hud.guaranteed ? 'text-amber-300' : ''}>{hud.guaranteed ? '保夾局' : '一般局'}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>線長</span>
                <span className="tabular-nums">{(hud.line * 100).toFixed(0)} cm</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>保夾計數</span>
                <span>
                  {settings.guaranteeN === 0 ? '關閉' : settings.payoutMode === 0 ? `${hud.sinceGuarantee}/${settings.guaranteeN}` : `機率 1/${settings.guaranteeN}`}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 text-slate-400">
                <span>擺幅</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded bg-slate-800">
                  <div className="h-full bg-violet-400" style={{ width: `${Math.min(100, (hud.swing / 0.12) * 100)}%` }} />
                </div>
                <span className="w-12 text-right tabular-nums">{(hud.swing * 100).toFixed(1)} cm</span>
              </div>
              {hud.towers > 0 && (
                <div className="flex items-center justify-between gap-2 text-slate-400" data-testid="dice-result">
                  <span className="shrink-0">{hud.towers > 1 && hud.dice ? `第${hud.dice.tower + 1}座` : '骰子'}</span>
                  {hud.dice ? (
                    <span className="flex flex-wrap items-center justify-end gap-1.5">
                      {hud.dice.faces.map((cell, ci) => (
                        <span key={ci} className={`text-lg leading-none tracking-wider ${hud.dice && hud.dice.faces.length > 1 && hud.dice.wins[ci] ? 'rounded bg-emerald-500/20 px-0.5' : ''}`}>
                          {cell.map((f, i) => (
                            <span key={i} className={isRed(f) ? 'text-rose-400' : 'text-slate-100'}>{DIE_GLYPH[f - 1]}</span>
                          ))}
                        </span>
                      ))}
                      <span className={hud.dice.win ? 'text-emerald-300' : 'text-slate-500'}>
                        {hud.dice.guaranteed ? '保夾出貨' : hud.dice.win ? '中獎' : '沒中'}
                      </span>
                    </span>
                  ) : (
                    <span className="text-slate-500">還沒落下</span>
                  )}
                </div>
              )}
              {hud.shaker && (
                <div className="flex items-center justify-between gap-2 text-slate-400" data-testid="shake-result">
                  <span className="shrink-0">搖骰盒</span>
                  {hud.shaker.result ? (
                    <span className="flex items-center gap-1.5">
                      <span className="text-lg leading-none tracking-wider">
                        {hud.shaker.result.faces.map((f, i) => (
                          <span key={i} className={isRed(f) ? 'text-rose-400' : 'text-slate-100'}>{DIE_GLYPH[f - 1]}</span>
                        ))}
                      </span>
                      <span className={hud.shaker.result.win ? 'text-emerald-300' : 'text-slate-500'}>
                        {hud.shaker.result.guaranteed ? '保夾出貨' : hud.shaker.result.win ? '中獎' : '沒中'}
                      </span>
                    </span>
                  ) : (
                    <span className="text-slate-500">還沒搖</span>
                  )}
                </div>
              )}
              {hud.margin !== null && (
                <div className="flex justify-between text-slate-400">
                  <span>抓力餘裕</span>
                  <span className={hud.margin > 0.15 ? 'text-emerald-300' : hud.margin > 0 ? 'text-amber-300' : 'text-rose-300'}>
                    {hud.margin >= 0 ? '+' : ''}{hud.margin.toFixed(2)}
                  </span>
                </div>
              )}
            </div>
          )}

          {hud.remaining === 0 && !hud.diceOnly && !service && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <div className="rounded-xl bg-slate-900 p-5 text-center">
                <p className="mb-3 font-bold">娃娃都被夾完了！</p>
                <button type="button" onClick={doRestock} className="rounded-md bg-amber-500 px-4 py-2 font-bold text-slate-950">補貨</button>
              </div>
            </div>
          )}

          {service && (
            <div className="pointer-events-none absolute inset-x-0 bottom-2 text-center text-xs font-bold tracking-widest text-amber-300">
              ⚙ 設定模式中 · 遊戲暫停
            </div>
          )}
        </div>

        {/* Service drawer: side panel on desktop, bottom sheet on phones */}
        {service && (
          <aside className="absolute inset-x-0 bottom-0 z-10 max-h-[70%] overflow-hidden rounded-t-xl border-t border-amber-500/40 shadow-2xl md:static md:max-h-none md:w-96 md:rounded-none md:border-l md:border-t-0">
            <ServicePanel
              tab={serviceTab}
              onTab={setServiceTab}
              settings={settings}
              index={menuIndex}
              stats={hud.stats}
              clawType={rig.claw}
              fit={rig.fit}
              chute={rig.chute}
              field={rig.field}
              onField={(f) => setRig((r) => ({ ...r, field: f }))}
              bedLift={rig.bedLift}
              onBedLift={(bedLift) => setRig((r) => ({ ...r, bedLift }))}
              tower={rig.tower}
              onTower={(tower) => setRig((r) => ({ ...r, tower }))}
              shaker={rig.shaker}
              onShaker={(shaker) => setRig((r) => ({ ...r, shaker }))}
              gantry={rig.gantry}
              onGantry={(gantry) => setRig((r) => ({ ...r, gantry }))}
              antiSwing={rig.antiSwing}
              onAntiSwing={(a) => setRig((r) => ({ ...r, antiSwing: a }))}
              remaining={hud.remaining}
              full={hud.full}
              stock={rig.stock}
              onIndex={setMenuIndex}
              onStep={stepCurrent}
              onSettings={setSettings}
              onClaw={fitClaw}
              onChute={(c) => setRig((r) => ({ ...r, chute: c }))}
              onStock={(stock) => setRig((r) => ({ ...r, stock }))}
              onClearStats={() => { sim.stats = { coins: 0, plays: 0, wins: 0, guarantees: 0 }; setHud(snapshot(sim)); }}
              onRestock={doRestock}
              onTopUp={doTopUp}
              onClose={toggleService}
            />
          </aside>
        )}
      </div>

      {/* Control deck, laid out like a Taiwanese cabinet: drop button on the left, joystick on the right */}
      <footer className="shrink-0 border-t-4 border-fuchsia-500/50 bg-gradient-to-b from-violet-950 to-slate-950 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <button
            type="button"
            onClick={onDrop}
            aria-label="下爪"
            className="h-24 w-24 shrink-0 rounded-full border-4 border-red-900 bg-[radial-gradient(circle_at_35%_30%,#fecaca,#ef4444_45%,#991b1b)] text-lg font-black text-white shadow-[0_8px_0_#450a0a,0_10px_20px_rgba(0,0,0,0.5)] [text-shadow:0_1px_2px_rgba(0,0,0,0.6)] active:translate-y-1.5 active:shadow-[0_2px_0_#450a0a]"
          >
            {service ? '確定' : '下爪'}
          </button>

          <div className="flex min-w-0 flex-1 flex-col items-center gap-2">
            <div className="w-full max-w-[15rem] rounded-md border-2 border-slate-700 bg-black px-3 py-1.5 font-mono text-red-500 shadow-[inset_0_0_10px_rgba(239,68,68,0.25)]">
              <div className="flex justify-between text-[10px] text-red-400/70">
                <span>CREDIT</span><span>TIME</span>
              </div>
              <div className="flex items-baseline justify-between text-2xl font-bold tabular-nums [text-shadow:0_0_6px_#ef4444]">
                <span>{String(hud.credits).padStart(2, '0')}</span>
                <span>{playing ? String(Math.ceil(hud.timer)).padStart(2, '0') : '--'}</span>
              </div>
              <div className="truncate text-center text-xs text-red-400">
                {lcdMain}
                {settings.coinsPerPlay > 1 && hud.coins > 0 && !service ? ` · 硬幣 ${hud.coins}/${settings.coinsPerPlay}` : ''}
              </div>
            </div>
            <button
              type="button"
              onClick={onCoin}
              disabled={service}
              className="flex items-center gap-2 rounded-md border border-amber-600 bg-gradient-to-b from-amber-400 to-amber-600 px-4 py-1.5 text-sm font-bold text-slate-950 shadow-[0_3px_0_#92400e] active:translate-y-0.5 active:shadow-none disabled:opacity-40"
            >
              <span className="inline-block h-4 w-1 rounded bg-slate-900" aria-hidden />
              投幣
            </button>
          </div>

          <Joystick onChange={onStick} />

        </div>
        <p className="mx-auto mt-2 hidden max-w-2xl text-center text-[11px] text-white/35 sm:block">
          鍵盤：方向鍵 / WASD 移動（來回推可甩爪，下降中也能移動）· 空白鍵 下爪（下降中再按 = 空中抓物）· C 投幣 · P 設定模式
        </p>
      </footer>
    </main>
  );
}
