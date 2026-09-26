/**
 * Browser side of the direct link (see companion/vehicle_companion/links/direct.py).
 * Fetches a ticket from the Control Center, opens the companion's WebSocket,
 * authenticates, and reconnects with backoff. Browser-only.
 */

import type { VehicleAck, VehicleStateV2 } from "../types";

export type DirectStatus =
  | "idle"
  | "connecting"
  | "open"
  /** ticket refused or not obtainable */
  | "unauthorized"
  /** the browser will not open it: ws:// from an https page, or bad URL */
  | "blocked"
  /** tried and failed (unreachable, or Local Network Access denied) */
  | "error";

export interface DirectMessageEntry {
  seq: number;
  t: number;
  sev: number;
  text: string;
  comp: number;
}

export interface DirectHandlers {
  onStatus(status: DirectStatus, detail?: string): void;
  onHello(hello: { scope: "view" | "control"; sub: string; now: number; msgs: DirectMessageEntry[] }): void;
  onState(state: VehicleStateV2, rxAt: number): void;
  onMessage(entry: DirectMessageEntry): void;
  onAck(ack: VehicleAck): void;
}

export interface TicketResponse {
  url: string;
  ticket: string;
  scope: "view" | "control";
}

const BACKOFF_MS = [1000, 2000, 4000, 8000, 15000];

/** "wss://host:8765" → "wss://host:8765/ws"; a URL with a path is used as is. */
export function socketUrl(base: string): string {
  const u = new URL(base);
  if (u.pathname === "/" || u.pathname === "") u.pathname = "/ws";
  return u.toString();
}

/** Why a browser would refuse the URL before trying, or null if it may work. */
export function blockedReason(url: string, pageProtocol: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return "badUrl";
  }
  if (u.protocol !== "ws:" && u.protocol !== "wss:") return "badUrl";
  if (pageProtocol === "https:" && u.protocol === "ws:") {
    // Mixed content is blocked, except to loopback addresses.
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
    if (!loopback) return "mixedContent";
  }
  return null;
}

export class DirectLink {
  private ws: WebSocket | null = null;
  private stopped = true;
  private attempt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private opened = false;
  status: DirectStatus = "idle";

  constructor(private getTicket: () => Promise<TicketResponse | { error: string } | null>, private h: DirectHandlers) {}

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    void this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.ws?.close();
    this.ws = null;
    this.setStatus("idle");
  }

  get isOpen(): boolean {
    return this.status === "open" && this.ws?.readyState === WebSocket.OPEN;
  }

  private setStatus(status: DirectStatus, detail?: string) {
    this.status = status;
    this.h.onStatus(status, detail);
  }

  private scheduleRetry() {
    if (this.stopped) return;
    const delay = BACKOFF_MS[Math.min(this.attempt, BACKOFF_MS.length - 1)];
    this.attempt += 1;
    this.retryTimer = setTimeout(() => void this.connect(), delay);
  }

  private async connect(): Promise<void> {
    if (this.stopped) return;
    this.setStatus("connecting");
    const t = await this.getTicket();
    if (this.stopped) return;
    if (!t || "error" in t) {
      this.setStatus("unauthorized", t && "error" in t ? t.error : undefined);
      this.scheduleRetry();
      return;
    }
    const reason = blockedReason(t.url, window.location.protocol);
    if (reason) {
      this.setStatus("blocked", reason);
      return; // retrying cannot help
    }
    let ws: WebSocket;
    try {
      ws = new WebSocket(socketUrl(t.url));
    } catch (err) {
      this.setStatus("blocked", err instanceof Error ? err.name : "blocked");
      return;
    }
    this.ws = ws;
    this.opened = false;
    ws.onopen = () => ws.send(JSON.stringify({ k: "auth", ticket: t.ticket }));
    ws.onmessage = (ev) => this.onMessage(ev.data);
    ws.onerror = () => {
      /* onclose follows with the details we can act on */
    };
    ws.onclose = (ev) => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.stopped) return;
      if (ev.code === 4401) this.setStatus("unauthorized");
      // Never opened: unreachable, or the browser's Local Network Access
      // permission was denied — the page cannot tell which.
      else this.setStatus("error", this.opened ? "closed" : "unreachable");
      this.scheduleRetry();
    };
  }

  private onMessage(raw: unknown) {
    if (typeof raw !== "string") return;
    let data: { k?: string; [key: string]: unknown };
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }
    const rxAt = Date.now();
    switch (data.k) {
      case "hello":
        this.opened = true;
        this.attempt = 0;
        this.setStatus("open");
        this.h.onHello(data as never);
        break;
      case "state":
        this.h.onState(data.s as VehicleStateV2, rxAt);
        break;
      case "msg":
        this.h.onMessage(data.e as DirectMessageEntry);
        break;
      case "ack":
        this.h.onAck(data.a as VehicleAck);
        break;
      default:
        break;
    }
  }

  private send(obj: unknown): boolean {
    if (!this.isOpen) return false;
    this.ws!.send(JSON.stringify(obj));
    return true;
  }

  sendCommand(cmd: { id: string; type: string; args: Record<string, unknown> }): boolean {
    return this.send({ k: "cmd", cmd });
  }

  sendManual(vx: number, yr: number): boolean {
    return this.send({ k: "manual", vx, yr });
  }

  setOperator(on: boolean): boolean {
    return this.send({ k: "op", on });
  }
}

/** Command ids for the direct link; the companion only accepts the d_ prefix. */
export function directCommandId(): string {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return `d_${Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("")}`;
}
