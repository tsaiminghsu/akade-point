/**
 * Decides when the ground station should speak or flash an alert. Pure: feed
 * it snapshots, it returns the alerts that just became due.
 *
 * Lessons from Mission Planner's voice alerts: a missing reading must never
 * trigger anything (MP announces "battery 0 volts" when a packet is lost), and
 * a condition has to hold for a moment before it is announced so a sagging
 * cell under throttle does not chatter. Unknown input freezes a condition
 * rather than clearing it.
 */

import type { VehicleStateV2 } from "../types";
import { batteryLevel, ekfLevel, gpsLevel, vibeLevel, type BatteryThresholds, DEFAULT_BATTERY } from "./health";

export type AlertKind =
  | "mode"
  | "armed"
  | "disarmed"
  | "batteryLow"
  | "batteryCritical"
  | "linkLost"
  | "linkRestored"
  | "fcLost"
  | "gpsLost"
  | "ekfBad"
  | "vibeHigh"
  | "fenceBreach"
  | "text";

export type AlertSeverity = "info" | "warn" | "critical";

export interface Alert {
  kind: AlertKind;
  severity: AlertSeverity;
  params: Record<string, string | number>;
  at: number;
}

interface ConditionOpts {
  holdMs: number;
  repeatMs?: number;
}

/** A debounced boolean: fires once after being true for holdMs, re-arms after
 *  being false for holdMs, optionally repeats while it stays true. */
class Condition {
  private since: number | null = null;
  private falseSince: number | null = null;
  private firedAt: number | null = null;

  constructor(private opts: ConditionOpts) {}

  /** Returns true when the alert should fire now. */
  step(value: boolean | null, now: number): boolean {
    if (value === null) return false;
    if (value) {
      this.falseSince = null;
      this.since ??= now;
      if (now - this.since < this.opts.holdMs) return false;
      if (this.firedAt === null) {
        this.firedAt = now;
        return true;
      }
      if (this.opts.repeatMs && now - this.firedAt >= this.opts.repeatMs) {
        this.firedAt = now;
        return true;
      }
      return false;
    }
    this.since = null;
    this.falseSince ??= now;
    if (this.firedAt !== null && now - this.falseSince >= this.opts.holdMs) this.firedAt = null;
    return false;
  }

  get active(): boolean {
    return this.firedAt !== null;
  }
}

export interface AlertInput {
  state: VehicleStateV2 | null;
  /** browser can hear the vehicle (fresh telemetry over either link) */
  linkOk: boolean;
  now: number;
}

export class AlertEngine {
  private prevMode: string | null = null;
  private prevArmed: boolean | null = null;
  private battLow = new Condition({ holdMs: 5000 });
  private battCrit = new Condition({ holdMs: 3000, repeatMs: 30_000 });
  private link = new Condition({ holdMs: 3000, repeatMs: 60_000 });
  private fc = new Condition({ holdMs: 3000 });
  private gps = new Condition({ holdMs: 3000 });
  private ekf = new Condition({ holdMs: 3000 });
  private vibe = new Condition({ holdMs: 5000 });
  private fence = new Condition({ holdMs: 0 });
  private linkWasLost = false;

  constructor(private battery: BatteryThresholds = DEFAULT_BATTERY) {}

  setBatteryThresholds(th: BatteryThresholds): void {
    this.battery = th;
  }

  update({ state, linkOk, now }: AlertInput): Alert[] {
    const out: Alert[] = [];
    const push = (kind: AlertKind, severity: AlertSeverity, params: Alert["params"] = {}) =>
      out.push({ kind, severity, params, at: now });

    if (this.link.step(!linkOk, now)) {
      this.linkWasLost = true;
      push("linkLost", "critical");
    }
    if (linkOk && this.linkWasLost && !this.link.active) {
      this.linkWasLost = false;
      push("linkRestored", "info");
    }
    // Without a live link every reading below is old; judge nothing.
    if (!linkOk || !state) return out;

    if (this.fc.step(state.fc.ok === false, now)) push("fcLost", "critical");
    if (!state.fc.ok) return out;

    if (state.mode !== null) {
      if (this.prevMode !== null && state.mode !== this.prevMode) push("mode", "info", { mode: state.mode });
      this.prevMode = state.mode;
    }
    if (state.armed !== null) {
      if (this.prevArmed !== null && state.armed !== this.prevArmed) push(state.armed ? "armed" : "disarmed", "info");
      this.prevArmed = state.armed;
    }

    const bl = batteryLevel(state.bat, this.battery);
    const unknownBat = bl === "unknown";
    const cellOrPct = state.bat?.cellV ?? state.bat?.pct ?? 0;
    const battParams = state.bat?.cellV != null ? { value: state.bat.cellV.toFixed(2), unit: "V" } : { value: Math.round(cellOrPct), unit: "%" };
    if (this.battCrit.step(unknownBat ? null : bl === "bad", now)) push("batteryCritical", "critical", battParams);
    else if (!this.battCrit.active && this.battLow.step(unknownBat ? null : bl !== "ok", now)) push("batteryLow", "warn", battParams);

    const gl = gpsLevel(state.gps);
    if (this.gps.step(gl === "unknown" ? null : gl === "bad", now)) push("gpsLost", "warn");

    const el = ekfLevel(state.ekf);
    if (this.ekf.step(el === "unknown" ? null : el === "bad", now)) push("ekfBad", "critical");

    const vl = vibeLevel(state.vibe);
    if (this.vibe.step(vl === "unknown" ? null : vl === "bad", now)) push("vibeHigh", "warn");

    if (this.fence.step(state.fence ? state.fence.breach : null, now)) push("fenceBreach", "critical");

    return out;
  }

  /** STATUSTEXT at CRITICAL or worse (failsafes, EKF, crash checks) is spoken as-is. */
  text(entry: { sev: number; text: string }, now: number): Alert | null {
    if (entry.sev > 2) return null;
    return { kind: "text", severity: "critical", params: { text: entry.text }, at: now };
  }
}
