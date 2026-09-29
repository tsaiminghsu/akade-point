"use client";

// The claw machine simulator from akade-point's /games/claw-machine
// (ClawMachineGame.tsx), made controllable: the board settings and rig come
// from the page, which keeps one draft per selected machine and saves it to
// DynamoDB, instead of one copy in localStorage. The page remounts this
// component (via `key`) to load another machine or throw a draft away, so the
// simulation is always built from the config it shows.

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";

import ClawScene, { type CameraView } from "./game/ClawScene";
import { describeMiss, describeSlip } from "./game/feedback";
import { SLOT_LABEL, layoutViews, type ViewLayout, type ViewSlot } from "./game/viewLayout";
import Joystick, { type StickDir } from "./game/Joystick";
import ServicePanel, { type ServiceTab } from "./game/ServicePanel";
import {
  createSim, disposeSim, drainEvents, gripMargin, heldPrize, initPhysics, insertCoin, isPhysicsReady,
  chuteFrom, pressDrop, prizesLeft, restock, setChute, setClaw, setPrizeCount, topUp,
  type ClawSim, type Joystick as JoyInput, type Phase, type PowerStage, type PrizeKind, type Stats,
} from "./game/clawSim";
import { buildClawSpec, type ClawFit, type ClawType } from "./game/claws";
import { itemDef } from "./game/items";
import { MAX_POWER, SETTING_DEFS, stepSetting, type ClawSettings } from "./game/settings";
import type { ClawRig } from "@/lib/control-center/claw/config";

const VIEW_BUTTONS: { id: CameraView; label: string }[] = [
  { id: "front", label: "正面" }, { id: "side", label: "側面" },
  { id: "angle", label: "斜角" }, { id: "top", label: "俯視" },
];
const LAYOUT_BUTTONS: { id: ViewLayout; label: string }[] = [
  { id: "single", label: "單畫面" }, { id: "pip", label: "子母畫面" }, { id: "quad", label: "四分割" },
];
/** Clicking a helper view's inset flies the main camera to the matching preset. */
const SLOT_PRESET: Partial<Record<ViewSlot, CameraView>> = { side: "side", top: "top" };

const STAGE_LABEL: Record<PowerStage, string> = { strong: "強", mid: "中", weak: "弱", guarantee: "保夾" };
const STAGE_BAR: Record<PowerStage, string> = {
  strong: "bg-emerald-400", mid: "bg-amber-400", weak: "bg-rose-400", guarantee: "bg-sky-400",
};

const PHASE_LABEL: Record<Phase, string> = {
  idle: "請投幣", moving: "移動天車", dropping: "下爪中", closing: "夾取",
  lifting: "上升", top: "到頂", returning: "回程", releasing: "放爪", resetting: "復位",
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
  stats: Stats;
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
    stats: { ...sim.stats },
  };
}

/** Keys typed into a field (or anywhere outside the bench) are not the joystick's. */
function ownsKey(root: HTMLElement | null, target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
    return false;
  }
  if (target.isContentEditable) return false;
  return target === document.body || Boolean(root?.contains(target));
}

export interface ClawBenchProps {
  settings: ClawSettings;
  rig: ClawRig;
  onSettings: Dispatch<SetStateAction<ClawSettings>>;
  onRig: Dispatch<SetStateAction<ClawRig>>;
}

/** Loads the physics engine (WASM) first, then mounts the machine. */
export default function ClawBench(props: ClawBenchProps) {
  const [ready, setReady] = useState(isPhysicsReady);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (ready) return;
    let live = true;
    initPhysics().then(() => { if (live) setReady(true); }, () => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [ready]);
  if (ready) return <ClawMachine {...props} />;
  return (
    <div className="flex h-full items-center justify-center bg-[#0b0718] text-fuchsia-200">
      <div className="text-center">
        <div className="mb-3 animate-pulse text-3xl">🧸</div>
        <div className="text-sm text-white/50">{failed ? "物理引擎載入失敗，請重新整理" : "載入物理引擎..."}</div>
      </div>
    </div>
  );
}

function ClawMachine({ settings, rig, onSettings: setSettings, onRig: setRig }: ClawBenchProps) {
  const simRef = useRef<ClawSim | null>(null);
  if (!simRef.current) {
    simRef.current = createSim(settings, {
      seed: Date.now() | 0, claw: rig.claw, clawFit: rig.fit, stock: rig.stock, chute: rig.chute,
    });
  }
  const sim = simRef.current;

  // Free the physics world's WASM memory when the machine goes away. Deferred
  // so React's dev-mode unmount/remount doesn't free a world still in use.
  useEffect(() => {
    const pending = (sim as ClawSim & { disposeTimer?: number }).disposeTimer;
    if (pending) window.clearTimeout(pending);
    return () => {
      (sim as ClawSim & { disposeTimer?: number }).disposeTimer = window.setTimeout(() => disposeSim(sim), 1000);
    };
  }, [sim]);

  const root = useRef<HTMLDivElement>(null);
  const joyRef = useRef<JoyInput>({ x: 0, z: 0 });
  const [hud, setHud] = useState<Hud>(() => snapshot(sim));
  const [view, setView] = useState<CameraView>("front");
  const [viewNonce, setViewNonce] = useState(0);
  const [layout, setLayout] = useState<ViewLayout>("pip");
  const [aimAssist, setAimAssist] = useState(true);
  const stage = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ w: 0, h: 0 });
  // This page is for setting machines up, so it opens on the service panel.
  const [service, setService] = useState(true);
  const [serviceTab, setServiceTab] = useState<ServiceTab>("board");
  const [menuIndex, setMenuIndex] = useState(0);
  const [monitor, setMonitor] = useState(() => window.innerWidth >= 640);
  const [restockKey, setRestockKey] = useState(0);
  const [toast, setToast] = useState<{ text: string; tone: "win" | "lose" | "info"; id: number } | null>(null);
  const [won, setWon] = useState<PrizeKind[]>([]);

  // Settings are live: the sim reads them every step.
  useEffect(() => {
    sim.settings = settings;
  }, [sim, settings]);

  // HUD + event polling at 10 Hz; the scene itself updates every frame.
  useEffect(() => {
    const id = window.setInterval(() => {
      for (const e of drainEvents(sim)) {
        const now = Date.now();
        if (e.type === "win") {
          setWon((w) => [...w, e.kind]);
          const item = itemDef(e.kind);
          setToast({ text: `恭喜夾到 ${item.icon} ${item.label}！`, tone: "win", id: now });
        } else if (e.type === "slip") setToast({ text: describeSlip(e.weak), tone: "lose", id: now });
        else if (e.type === "miss") setToast({ text: describeMiss(e.nearest), tone: "lose", id: now });
        else if (e.type === "timeUp") setToast({ text: "時間到！", tone: "info", id: now });
      }
      setHud(snapshot(sim));
    }, 100);
    return () => window.clearInterval(id);
  }, [sim]);

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
  }, [menuIndex, setSettings]);

  // In service mode the stick and button drive the menu, like on the board.
  const onStick = useCallback((d: StickDir) => {
    if (!service) { joyRef.current = { x: d.x, z: d.z }; return; }
    if (serviceTab !== "board") return;
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

  const fitClaw = useCallback((claw: ClawType, fit: ClawFit) => {
    setClaw(sim, claw, fit);
    setRig((r) => ({ ...r, claw, fit }));
  }, [sim, setRig]);
  const clawSpec = buildClawSpec(rig.claw, rig.fit);

  // Keyboard: arrows/WASD = stick, Space/Enter = 下爪, C = coin, F2/P = service.
  // Only while focus is on the bench (or nowhere), so the rest of the Control
  // Center's buttons, search box and dialogs keep their keys.
  useEffect(() => {
    const held = new Set<string>();
    const dirFromKeys = (): StickDir => {
      const x = (held.has("right") ? 1 : 0) - (held.has("left") ? 1 : 0);
      const z = (held.has("down") ? 1 : 0) - (held.has("up") ? 1 : 0);
      return { x: x as StickDir["x"], z: z as StickDir["z"] };
    };
    const map: Record<string, string> = {
      ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down",
      ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right",
    };
    const down = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || !ownsKey(root.current, e.target)) return;
      const dir = map[e.code];
      if (dir) {
        e.preventDefault();
        if (service) {
          // Menu navigation acts per press (with key-repeat), not while held.
          onStick({ x: dir === "left" ? -1 : dir === "right" ? 1 : 0, z: dir === "up" ? -1 : dir === "down" ? 1 : 0 });
          return;
        }
        held.add(dir);
        onStick(dirFromKeys());
      } else if ((e.code === "Space" || e.code === "Enter") && !e.repeat) {
        e.preventDefault();
        onDrop();
      } else if (e.code === "KeyC" && !e.repeat) {
        onCoin();
      } else if ((e.code === "F2" || e.code === "KeyP") && !e.repeat) {
        e.preventDefault();
        toggleService();
      } else if (e.code === "Escape" && service) {
        toggleService();
      }
    };
    const up = (e: KeyboardEvent) => {
      const dir = map[e.code];
      if (!dir || service) return;
      held.delete(dir);
      onStick(dirFromKeys());
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [service, onStick, onDrop, onCoin, toggleService]);

  const playing = hud.phase === "moving";
  const lcdMain = service ? "SETUP" : hud.phase === "idle" && hud.credits === 0 ? "INSERT COIN" : PHASE_LABEL[hud.phase];
  const powerPct = (hud.power / MAX_POWER) * 100;

  return (
    <div ref={root} className="flex h-full min-h-0 flex-col overflow-hidden bg-[#0b0718] text-white">
      {/* View toolbar: camera preset, screen layout, aiming aid, panels */}
      <nav className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-white/10 bg-black/30 px-3 py-1.5 text-xs [scrollbar-width:none]" aria-label="視角">
        <span className="shrink-0 text-white/40">視角</span>
        <div className="flex shrink-0 rounded-md border border-white/15">
          {VIEW_BUTTONS.map((b) => (
            <button key={b.id} type="button" onClick={() => pickView(b.id)}
              className={`px-2 py-1 first:rounded-l-md last:rounded-r-md ${view === b.id ? "bg-white/20 text-white" : "text-white/60 hover:text-white"}`}>
              {b.label}
            </button>
          ))}
        </div>
        <span className="shrink-0 text-white/40">畫面</span>
        <div className="flex shrink-0 rounded-md border border-white/15">
          {LAYOUT_BUTTONS.map((b) => (
            <button key={b.id} type="button" onClick={() => setLayout(b.id)}
              className={`px-2 py-1 first:rounded-l-md last:rounded-r-md ${layout === b.id ? "bg-white/20 text-white" : "text-white/60 hover:text-white"}`}>
              {b.label}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setAimAssist((a) => !a)}
          className={`shrink-0 rounded-md border px-2 py-1 ${aimAssist ? "border-emerald-400/60 text-emerald-300" : "border-white/15 text-white/60"}`}>
          ◎ 瞄準輔助
        </button>
        <span className="flex-1" />
        {won.length > 0 && (
          <span className="max-w-[30%] shrink-0 truncate text-base leading-none" aria-label={`已夾到 ${won.length} 個`} title="已夾到">
            {won.map((k) => itemDef(k).icon).join("")}
          </span>
        )}
        <button type="button" onClick={() => setMonitor((m) => !m)} className={`shrink-0 rounded-md border px-2 py-1 ${monitor ? "border-cyan-400/60 text-cyan-300" : "border-white/15 text-white/60"}`}>
          監看
        </button>
        <button type="button" onClick={toggleService} className={`shrink-0 rounded-md border px-2 py-1 ${service ? "border-amber-400 bg-amber-500 text-slate-950" : "border-amber-400/60 text-amber-300"}`}>
          設定
        </button>
      </nav>

      <div className="relative flex min-h-0 flex-1">
        {/* Cabinet view */}
        <div ref={stage} className="relative min-w-0 flex-1">
          <ClawScene
            sim={sim} joyRef={joyRef} paused={service} restockKey={restockKey}
            view={view} viewNonce={viewNonce} layout={layout} aimAssist={aimAssist}
            clawKey={`${rig.claw}-${rig.fit.size}-${rig.fit.bend}-${rig.fit.openPct}`}
            chute={chute}
            guideKey={service && serviceTab === "board" ? SETTING_DEFS[menuIndex].key : null}
          />

          {/* Frames + labels over each viewport. Helper insets swallow pointer
              events (so dragging them doesn't orbit the main view) and a click
              flies the main camera to that angle. */}
          {layout !== "single" && stageSize.w > 0 && layoutViews(layout, stageSize.w, stageSize.h).map((r) => {
            const preset = SLOT_PRESET[r.slot];
            const isMain = r.slot === "main";
            return (
              <div
                key={r.slot}
                className={`absolute ${isMain ? "pointer-events-none" : "cursor-pointer rounded-md border-2 border-white/30 shadow-lg hover:border-amber-300"}`}
                style={{ left: r.x, top: r.y, width: r.w, height: r.h }}
                onClick={preset ? () => pickView(preset) : undefined}
                onKeyDown={preset ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pickView(preset); } } : undefined}
                role={preset ? "button" : undefined}
                tabIndex={preset ? 0 : undefined}
                aria-label={preset ? `主畫面切到${SLOT_LABEL[r.slot]}` : undefined}
                title={preset ? "點一下，主畫面轉到這個角度" : undefined}
              >
                {(!isMain || layout === "quad") && (
                  <span className="pointer-events-none absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white/85">
                    {SLOT_LABEL[r.slot]}
                  </span>
                )}
              </div>
            );
          })}

          {toast && (
            <div
              key={toast.id}
              className={`pointer-events-none absolute left-1/2 top-4 z-10 max-w-[90%] -translate-x-1/2 rounded-full px-5 py-2 text-center text-sm font-bold shadow-lg ${toast.tone === "win" ? "animate-bounce" : ""} ${
                toast.tone === "win" ? "bg-amber-400 text-slate-950" : toast.tone === "lose" ? "bg-slate-800/90 text-white" : "bg-violet-600/90 text-white"
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
                <span>強/中/弱 {[settings.strongPower, settings.midPower, settings.weakPower].map((v) => v.toFixed(0)).join("/")}</span>
                <span className={hud.guaranteed ? "text-amber-300" : ""}>{hud.guaranteed ? "保夾局" : "一般局"}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>線長</span>
                <span className="tabular-nums">{(hud.line * 100).toFixed(0)} cm</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>保夾計數</span>
                <span>
                  {settings.guaranteeN === 0 ? "關閉" : settings.payoutMode === 0 ? `${hud.sinceGuarantee}/${settings.guaranteeN}` : `機率 1/${settings.guaranteeN}`}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 text-slate-400">
                <span>擺幅</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded bg-slate-800">
                  <div className="h-full bg-violet-400" style={{ width: `${Math.min(100, (hud.swing / 0.12) * 100)}%` }} />
                </div>
                <span className="w-12 text-right tabular-nums">{(hud.swing * 100).toFixed(1)} cm</span>
              </div>
              {hud.margin !== null && (
                <div className="flex justify-between text-slate-400">
                  <span>抓力餘裕</span>
                  <span className={hud.margin > 0.15 ? "text-emerald-300" : hud.margin > 0 ? "text-amber-300" : "text-rose-300"}>
                    {hud.margin >= 0 ? "+" : ""}{hud.margin.toFixed(2)}
                  </span>
                </div>
              )}
            </div>
          )}

          {hud.remaining === 0 && !service && (
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
          <aside className="absolute inset-x-0 bottom-0 z-10 max-h-[58%] overflow-hidden rounded-t-xl border-t border-amber-500/40 shadow-2xl md:static md:max-h-none md:w-96 md:rounded-none md:border-l md:border-t-0">
            <ServicePanel
              tab={serviceTab}
              onTab={setServiceTab}
              settings={settings}
              index={menuIndex}
              stats={hud.stats}
              clawType={rig.claw}
              fit={rig.fit}
              chute={rig.chute}
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
              closeLabel="收起面板"
            />
          </aside>
        )}
      </div>

      {/* Control deck */}
      <footer className="shrink-0 border-t-4 border-fuchsia-500/50 bg-gradient-to-b from-violet-950 to-slate-950 px-4 pb-3 pt-3">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <Joystick onChange={onStick} />

          <div className="flex min-w-0 flex-1 flex-col items-center gap-2">
            <div className="w-full max-w-[15rem] rounded-md border-2 border-slate-700 bg-black px-3 py-1.5 font-mono text-red-500 shadow-[inset_0_0_10px_rgba(239,68,68,0.25)]">
              <div className="flex justify-between text-[10px] text-red-400/70">
                <span>CREDIT</span><span>TIME</span>
              </div>
              <div className="flex items-baseline justify-between text-2xl font-bold tabular-nums [text-shadow:0_0_6px_#ef4444]">
                <span>{String(hud.credits).padStart(2, "0")}</span>
                <span>{playing ? String(Math.ceil(hud.timer)).padStart(2, "0") : "--"}</span>
              </div>
              <div className="truncate text-center text-xs text-red-400">
                {lcdMain}
                {settings.coinsPerPlay > 1 && hud.coins > 0 && !service ? ` · 硬幣 ${hud.coins}/${settings.coinsPerPlay}` : ""}
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

          <button
            type="button"
            onClick={onDrop}
            aria-label="下爪"
            className="h-20 w-20 shrink-0 rounded-full border-4 border-red-900 bg-[radial-gradient(circle_at_35%_30%,#fecaca,#ef4444_45%,#991b1b)] text-lg font-black text-white shadow-[0_8px_0_#450a0a,0_10px_20px_rgba(0,0,0,0.5)] [text-shadow:0_1px_2px_rgba(0,0,0,0.6)] active:translate-y-1.5 active:shadow-[0_2px_0_#450a0a]"
          >
            {service ? "確定" : "下爪"}
          </button>
        </div>
        <p className="mx-auto mt-2 hidden max-w-2xl text-center text-[11px] text-white/35 sm:block">
          點一下機台畫面後可用鍵盤：方向鍵 / WASD 移動（來回推可甩爪）· 空白鍵 下爪 · C 投幣 · P 設定模式
        </p>
      </footer>
    </div>
  );
}
