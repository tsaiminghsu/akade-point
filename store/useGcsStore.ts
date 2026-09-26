import { create } from "zustand";

import { apiRequest } from "@/lib/control-center/apiClient";
import { resolveTimeouts } from "@/lib/control-center/vehicles/commandState";
import { GCS_LIVE_POLL_MS } from "@/lib/control-center/vehicles/constants";
import { eventSortKey } from "@/lib/control-center/vehicles/eventKey";
import { DirectLink, directCommandId, type DirectStatus, type TicketResponse } from "@/lib/control-center/vehicles/link/directLink";
import { pickLink, Staleness, STALE_ENTER_MS, STALE_EXIT_MS, type LinkKind } from "@/lib/control-center/vehicles/link/select";
import { toStateV2 } from "@/lib/control-center/vehicles/summary";
import type { CommandRequest } from "@/lib/control-center/vehicles/schemas";
import type {
  Vehicle,
  VehicleAck,
  VehicleCommand,
  VehicleCommandType,
  VehicleEvent,
  VehicleStateV2,
} from "@/lib/control-center/vehicles/types";

/** One STATUSTEXT line as the ground station shows it. */
export interface GcsMessage {
  key: string;
  t: number;
  sev: number;
  text: string;
  comp: number;
}

/** A sample kept for the live graphs (browser clock). */
export interface GcsSample {
  at: number;
  alt: number | null;
  gs: number | null;
  vs: number | null;
  batV: number | null;
  cellV: number | null;
  cur: number | null;
  roll: number | null;
  pitch: number | null;
  vibe: number | null;
  sats: number | null;
  ekf: number | null;
}

export interface GcsCommand {
  id: string;
  type: VehicleCommandType;
  status: VehicleCommand["status"];
  code?: string;
  msg?: string;
  createdAt: number;
  via: "cloud" | "direct";
  result?: Record<string, unknown>;
}

export interface LinkInfo {
  cloud: { lastRxAt: number | null; ok: boolean; error: boolean };
  direct: { status: DirectStatus; detail?: string; lastRxAt: number | null; scope: "view" | "control" | null };
  active: LinkKind | "none";
}

interface GcsState {
  vehicleId: string | null;
  vehicle: Vehicle | null;
  state: VehicleStateV2 | null;
  stateSource: LinkKind | null;
  /** browser-clock time the shown state was sampled */
  stateAt: number | null;
  stale: boolean;
  link: LinkInfo;
  messages: GcsMessage[];
  commands: GcsCommand[];
  samples: GcsSample[];
  trail: [number, number][];
  control: boolean;
  now: number;

  open: (vehicleId: string) => void;
  close: () => void;
  /**
   * Sends a command over the direct link when it is open with control scope,
   * otherwise through the server. `directExtra` args (e.g. mission items
   * inline) only travel on the direct link. Resolves true once issued.
   */
  send: (request: CommandRequest, directExtra?: Record<string, unknown>) => Promise<boolean>;
  /** Like send, then waits for the command to settle (acked/failed/timeout). */
  sendAndWait: (request: CommandRequest, opts?: { timeoutMs?: number; directExtra?: Record<string, unknown> }) => Promise<GcsCommand | null>;
  /** True when commands would go over the direct link right now. */
  viaDirect: () => boolean;
  /** GET a file from the companion's direct-link HTTP server (tlogs), authorised with a ticket. */
  fileFetch: (path: string) => Promise<Response | null>;
  drive: (vx: number, yr: number) => boolean;
  /** Stream gimbal angles over the direct link; false if it is not open. */
  gimbalStream: (pitch: number, yaw: number, lock: boolean) => boolean;
  setControl: (on: boolean) => void;
  reconnectDirect: () => void;
}

const MAX_MESSAGES = 300;
const MAX_SAMPLES = 600; // 5 min at 2 Hz
const SAMPLE_EVERY_MS = 500;
const MAX_TRAIL = 1800;
const TRAIL_MIN_STEP_DEG = 0.000003; // ~0.3 m

let pollTimer: ReturnType<typeof setInterval> | null = null;
let tickTimer: ReturnType<typeof setInterval> | null = null;
let direct: DirectLink | null = null;
let cursor: string | undefined;
let lastCloudStateAt: number | null = null;
let lastSampleAt = 0;
let polling = false;
let ticketCache: { vehicleId: string; ticket: TicketResponse; exp: number } | null = null;
const staleness: Record<LinkKind, Staleness> = {
  direct: new Staleness(STALE_ENTER_MS.direct, STALE_EXIT_MS.direct),
  cloud: new Staleness(STALE_ENTER_MS.cloud, STALE_EXIT_MS.cloud),
};

const INITIAL_LINK: LinkInfo = {
  cloud: { lastRxAt: null, ok: false, error: false },
  direct: { status: "idle", lastRxAt: null, scope: null },
  active: "none",
};

function mergeMessages(prev: GcsMessage[], incoming: GcsMessage[]): GcsMessage[] {
  if (incoming.length === 0) return prev;
  const seen = new Set(prev.map((m) => m.key));
  const fresh = incoming.filter((m) => !seen.has(m.key));
  if (fresh.length === 0) return prev;
  return [...prev, ...fresh].sort((a, b) => (a.key < b.key ? -1 : 1)).slice(-MAX_MESSAGES);
}

function sampleOf(s: VehicleStateV2, at: number): GcsSample {
  return {
    at,
    alt: s.pos?.rel ?? null,
    gs: s.gs,
    vs: s.vs,
    batV: s.bat?.v ?? null,
    cellV: s.bat?.cellV ?? null,
    cur: s.bat?.a ?? null,
    roll: s.att?.r ?? null,
    pitch: s.att?.p ?? null,
    vibe: s.vibe ? Math.max(s.vibe.x, s.vibe.y, s.vibe.z) : null,
    sats: s.gps?.sats ?? null,
    ekf: s.ekf?.worst ?? null,
  };
}

function fromCloudCommand(c: VehicleCommand): GcsCommand {
  return {
    id: c.id,
    type: c.type,
    status: c.status,
    code: c.code,
    msg: c.msg,
    createdAt: c.createdAt,
    via: c.via ?? "cloud",
    result: c.result,
  };
}

export const useGcsStore = create<GcsState>()((set, get) => {
  /** Adopt a new state snapshot from `source` sampled at `at` (browser clock). */
  function acceptState(state: VehicleStateV2, source: LinkKind, at: number) {
    staleness[source].onMessage(at);
    const cur = get();
    const link = { ...cur.link };
    if (source === "direct") link.direct = { ...link.direct, lastRxAt: at };
    else link.cloud = { ...link.cloud, lastRxAt: at };
    link.active = pickLink(
      { enabled: link.direct.status === "open", lastRxAt: link.direct.lastRxAt },
      { enabled: true, lastRxAt: link.cloud.lastRxAt },
      Date.now()
    );
    // The fresher, faster link owns the display.
    if (link.active !== "none" && link.active !== source) {
      set({ link });
      return;
    }
    const patch: Partial<GcsState> = { link, state, stateSource: source, stateAt: at, stale: false };
    if (at - lastSampleAt >= SAMPLE_EVERY_MS) {
      lastSampleAt = at;
      patch.samples = [...cur.samples, sampleOf(state, at)].slice(-MAX_SAMPLES);
    }
    const pos = state.pos;
    if (pos) {
      const last = cur.trail[cur.trail.length - 1];
      if (!last || Math.abs(last[0] - pos.lat) > TRAIL_MIN_STEP_DEG || Math.abs(last[1] - pos.lon) > TRAIL_MIN_STEP_DEG) {
        patch.trail = [...cur.trail, [pos.lat, pos.lon] as [number, number]].slice(-MAX_TRAIL);
      }
    }
    set(patch);
  }

  function upsertCommand(cmd: GcsCommand) {
    set((s) => {
      const i = s.commands.findIndex((c) => c.id === cmd.id);
      if (i === -1) return { commands: [cmd, ...s.commands].slice(0, 100) };
      const next = [...s.commands];
      next[i] = { ...next[i], ...cmd };
      return { commands: next };
    });
  }

  async function fetchTicket(vehicleId: string): Promise<TicketResponse | { error: string } | null> {
    try {
      const res = await fetch(`/api/control-center/vehicles/${vehicleId}/direct-ticket`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "control" }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return { error: body.error ?? String(res.status) };
      ticketCache = { vehicleId, ticket: body as TicketResponse, exp: (body as { exp?: number }).exp ?? Date.now() + 600_000 };
      return body as TicketResponse;
    } catch {
      return null;
    }
  }

  /** Issues a command; returns its id, or null if it could not be sent. */
  async function issue(request: CommandRequest, directExtra?: Record<string, unknown>): Promise<string | null> {
    const id = get().vehicleId;
    if (!id) return null;
    const { type, ...args } = request as CommandRequest & Record<string, unknown>;
    if (direct?.isOpen && get().link.direct.scope === "control") {
      const cmdId = directCommandId();
      upsertCommand({ id: cmdId, type: type as VehicleCommandType, status: "sent", createdAt: Date.now(), via: "direct" });
      if (direct.sendCommand({ id: cmdId, type, args: { ...args, ...directExtra } })) return cmdId;
      set((s) => ({ commands: s.commands.filter((c) => c.id !== cmdId) }));
    }
    const res = await apiRequest<{ command: VehicleCommand }>(`/api/control-center/vehicles/${id}/commands`, {
      method: "POST",
      body: JSON.stringify(request),
    });
    if (!res) return null;
    upsertCommand(fromCloudCommand(res.command));
    return res.command.id;
  }

  function startDirect(vehicleId: string) {
    direct?.stop();
    direct = new DirectLink(() => fetchTicket(vehicleId), {
      onStatus: (status, detail) =>
        set((s) => ({ link: { ...s.link, direct: { ...s.link.direct, status, detail, scope: status === "open" ? s.link.direct.scope : null } } })),
      onHello: (hello) => {
        set((s) => ({
          link: { ...s.link, direct: { ...s.link.direct, scope: hello.scope } },
          messages: mergeMessages(
            s.messages,
            hello.msgs.map((m) => ({ key: eventSortKey(m.t, m.seq), t: m.t, sev: m.sev, text: m.text, comp: m.comp }))
          ),
        }));
        if (get().control) direct?.setOperator(true);
      },
      onState: (state, rxAt) => acceptState(state, "direct", rxAt),
      onMessage: (m) =>
        set((s) => ({ messages: mergeMessages(s.messages, [{ key: eventSortKey(m.t, m.seq), t: m.t, sev: m.sev, text: m.text, comp: m.comp }]) })),
      onAck: (ack: VehicleAck) => {
        const existing = get().commands.find((c) => c.id === ack.id);
        if (!existing) return; // an ack for a command this page did not issue
        upsertCommand({ ...existing, status: ack.st, code: ack.code, msg: ack.msg, result: ack.res });
      },
    });
    direct.start();
  }

  async function pollLive() {
    const id = get().vehicleId;
    if (!id || polling) return;
    polling = true;
    try {
      const qs = new URLSearchParams();
      if (cursor) qs.set("after", cursor);
      if (get().control) qs.set("op", "1");
      const sent = Date.now();
      const res = await apiRequest<{ vehicle: Vehicle; events: VehicleEvent[]; commands: VehicleCommand[]; now: number }>(
        `/api/control-center/vehicles/${id}/live?${qs}`,
        undefined,
        { silent: true, timeoutMs: 8000 }
      );
      if (get().vehicleId !== id) return;
      if (!res) {
        set((s) => ({ link: { ...s.link, cloud: { ...s.link.cloud, ok: false, error: true } } }));
        return;
      }
      const rx = Date.now();
      const clockOffset = res.now - (sent + rx) / 2; // server − browser
      const { vehicle } = res;
      const firstLoad = get().vehicle === null;
      set((s) => ({
        vehicle,
        link: { ...s.link, cloud: { ...s.link.cloud, ok: true, error: false } },
        messages: mergeMessages(
          s.messages,
          res.events.map((e) => ({ key: e.sk, t: e.t, sev: e.sev, text: e.text, comp: e.comp }))
        ),
      }));
      if (res.events.length > 0) cursor = res.events[res.events.length - 1].sk;

      // Merge the server's command log with commands only this page knows about yet.
      const { commands } = resolveTimeouts(res.commands, res.now);
      const serverCmds = commands.map(fromCloudCommand);
      set((s) => {
        const byId = new Map(serverCmds.map((c) => [c.id, c]));
        const localOnly = s.commands.filter((c) => !byId.has(c.id));
        return { commands: [...localOnly, ...serverCmds].sort((a, b) => b.createdAt - a.createdAt).slice(0, 100) };
      });

      // A new snapshot: place it on the browser clock via the server's.
      if (vehicle.state && vehicle.stateAt !== null && vehicle.stateAt !== lastCloudStateAt) {
        lastCloudStateAt = vehicle.stateAt;
        const sampledAt = (vehicle.lastSeenAt ?? vehicle.stateAt) - clockOffset;
        const state = toStateV2(vehicle.state, vehicle.type);
        if (state) acceptState(state, "cloud", Math.min(sampledAt, rx));
      }
      if (firstLoad && vehicle.directUrl) startDirect(id);
      if (!vehicle.directUrl && direct) {
        direct.stop();
        direct = null;
      }
    } finally {
      polling = false;
    }
  }

  function tick() {
    const s = get();
    const now = Date.now();
    const active = pickLink(
      { enabled: s.link.direct.status === "open", lastRxAt: s.link.direct.lastRxAt },
      { enabled: true, lastRxAt: s.link.cloud.lastRxAt },
      now
    );
    const stale = s.stateSource ? staleness[s.stateSource].isStale(now) : true;
    set({ now, stale, link: active === s.link.active ? s.link : { ...s.link, active } });
  }

  return {
    vehicleId: null,
    vehicle: null,
    state: null,
    stateSource: null,
    stateAt: null,
    stale: true,
    link: INITIAL_LINK,
    messages: [],
    commands: [],
    samples: [],
    trail: [],
    control: false,
    now: Date.now(),

    open: (vehicleId) => {
      if (get().vehicleId === vehicleId) return;
      get().close();
      set({ vehicleId });
      void pollLive();
      pollTimer = setInterval(() => {
        // Keep polling in a background tab while holding control: the
        // operator stamp is what the companion's heartbeat policy follows.
        if (typeof document !== "undefined" && document.hidden && !get().control) return;
        void pollLive();
      }, GCS_LIVE_POLL_MS);
      tickTimer = setInterval(tick, 250);
    },

    close: () => {
      if (pollTimer) clearInterval(pollTimer);
      if (tickTimer) clearInterval(tickTimer);
      pollTimer = tickTimer = null;
      direct?.stop();
      direct = null;
      cursor = undefined;
      lastCloudStateAt = null;
      lastSampleAt = 0;
      staleness.direct.reset();
      staleness.cloud.reset();
      set({
        vehicleId: null,
        vehicle: null,
        state: null,
        stateSource: null,
        stateAt: null,
        stale: true,
        link: INITIAL_LINK,
        messages: [],
        commands: [],
        samples: [],
        trail: [],
        control: false,
      });
    },

    send: async (request, directExtra) => (await issue(request, directExtra)) !== null,

    sendAndWait: async (request, opts = {}) => {
      const cmdId = await issue(request, opts.directExtra);
      if (!cmdId) return null;
      const timeoutMs = opts.timeoutMs ?? 30_000;
      const settled = (c?: GcsCommand) => c && (c.status === "acked" || c.status === "failed" || c.status === "timeout");
      const now = get().commands.find((c) => c.id === cmdId);
      if (settled(now)) return now!;
      return new Promise<GcsCommand | null>((resolve) => {
        const timer = setTimeout(() => {
          unsub();
          resolve(get().commands.find((c) => c.id === cmdId) ?? null);
        }, timeoutMs);
        const unsub = useGcsStore.subscribe((s) => {
          const c = s.commands.find((x) => x.id === cmdId);
          if (settled(c)) {
            clearTimeout(timer);
            unsub();
            resolve(c!);
          }
        });
      });
    },

    viaDirect: () => Boolean(direct?.isOpen && get().link.direct.scope === "control"),

    fileFetch: async (path) => {
      const id = get().vehicleId;
      const url = get().vehicle?.directUrl;
      if (!id || !url) return null;
      let t = ticketCache && ticketCache.vehicleId === id && ticketCache.exp - Date.now() > 60_000 ? ticketCache.ticket : null;
      if (!t) {
        const fresh = await fetchTicket(id);
        if (!fresh || "error" in fresh) return null;
        t = fresh;
      }
      const base = new URL(url);
      base.protocol = base.protocol === "wss:" ? "https:" : "http:";
      base.pathname = path;
      try {
        return await fetch(base.toString(), { headers: { Authorization: `Ticket ${t.ticket}` } });
      } catch {
        return null;
      }
    },

    drive: (vx, yr) => (direct?.isOpen ? direct.sendManual(vx, yr) : false),
    gimbalStream: (p, y, lock) => (direct?.isOpen && get().link.direct.scope === "control" ? direct.sendGimbal(p, y, lock) : false),

    setControl: (on) => {
      set({ control: on });
      direct?.setOperator(on);
      void pollLive();
    },

    reconnectDirect: () => {
      const id = get().vehicleId;
      if (id && get().vehicle?.directUrl) startDirect(id);
    },
  };
});
