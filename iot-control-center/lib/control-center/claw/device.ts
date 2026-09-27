// What a claw machine's ESP32 pulls, and how far the delivery has got.
//
// The board polls GET /api/device/machines/config with If-None-Match set to
// the `sha` it last processed; a 304 means nothing changed. A board that also
// listens on MQTT (claw/{machineId}/config) is told the moment a config is
// saved and pulls right away, so it only needs a slow safety poll. Only the board
// settings are sent: the rig (claw head, stock, chute) is hardware the
// operator fits by hand, so a board has nothing to apply it to.
//
// Pure and crypto-free, so the page can compute the same `sha` to tell
// whether a machine is running the saved config.

import { SETTING_DEFS, sanitizeSettings, type ClawSettings } from "@/components/control-center/claw-machine/game/settings";
import type { ClawConfig } from "./config";

export const DEVICE_CONTRACT_VERSION = 1;
/** How often the board asks for its config (s). Sent in every response, so it can be changed here. */
export const DEVICE_POLL_S = 30;
/**
 * The poll while the board's MQTT session is up (s). Notices make changes
 * arrive at once; this only catches one that was lost.
 */
export const MQTT_FALLBACK_POLL_S = 300;

/** How the server rings boards when a config is saved (see lib/iot/claw-notify.ts). */
export type ClawNotifyMode = "iot" | "mqtt" | "off";

/** The topic a machine's board subscribes to for "your config changed" notices. */
export const clawConfigTopic = (machineId: string) => `claw/${machineId}/config`;

/** An MQTT notice: tiny on purpose; the board fetches the settings over HTTPS. */
export interface ClawNotice {
  v: typeof DEVICE_CONTRACT_VERSION;
  sha: string;
  rev: number;
}
/**
 * A pull rewrites `pulledAt` only when the stored one is at least this old,
 * or the config or firmware changed, so polling costs about one write per
 * machine every five minutes instead of one every 30 s.
 */
export const PULL_RECORD_INTERVAL_MS = 5 * 60_000;
/** No recorded pull for this long and the board counts as not connected. */
export const DEVICE_OFFLINE_MS = 3 * PULL_RECORD_INTERVAL_MS;

/**
 * cyrb53, a small non-cryptographic 53-bit string hash. The config `sha` only
 * has to notice a change, and this one runs the same on the server, in the
 * browser and (if a board wants to check) on an ESP32.
 */
export function cyrb53(str: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** Identifies the board settings a machine should be running: 14 hex digits. */
export function settingsSha(settings: ClawSettings): string {
  const s = sanitizeSettings(settings);
  const canonical = SETTING_DEFS.map((d) => `${d.key}=${s[d.key]}`).join(";");
  return cyrb53(canonical).toString(16).padStart(14, "0");
}

export interface DeviceConfigPayload {
  v: typeof DEVICE_CONTRACT_VERSION;
  machineId: string;
  /** The saved revision (0 = factory). For display and logs; `sha` is what changes are detected by. */
  rev: number;
  sha: string;
  /** Seconds until the next pull. */
  poll: number;
  /** Seconds until the next pull while the board's MQTT session is up. */
  pollMqtt: number;
  /** Board settings in SETTING_DEFS order, in board units (枚, 秒, V, 段, levels). */
  settings: ClawSettings;
}

export function toDevicePayload(config: ClawConfig): DeviceConfigPayload {
  const settings = sanitizeSettings(config.settings);
  return {
    v: DEVICE_CONTRACT_VERSION,
    machineId: config.machineId,
    rev: config.revision,
    sha: settingsSha(settings),
    poll: DEVICE_POLL_S,
    pollMqtt: MQTT_FALLBACK_POLL_S,
    settings,
  };
}

export const etagFor = (sha: string) => `"${sha}"`;

/** Does an If-None-Match header cover this sha? Handles lists, weak tags and `*`. */
export function matchesEtag(header: string | null, sha: string): boolean {
  if (!header) return false;
  return header.split(",").some((raw) => {
    const tag = raw.trim().replace(/^W\//, "");
    return tag === "*" || tag === etagFor(sha) || tag === sha;
  });
}

/** Trim a board-reported firmware string to something safe to store and show. */
export function cleanFirmware(raw: string | null): string | undefined {
  const fw = (raw ?? "").replace(/[^\x20-\x7e]/g, "").trim().slice(0, 40);
  return fw || undefined;
}

// ── Delivery state ───────────────────────────────────────────────────────────

export interface ClawAck {
  st: "applied" | "failed";
  sha: string;
  rev: number;
  code: string;
  msg: string;
  t: number;
}

export type BoardNotify = "mqtt" | "poll";

/** Read the board's X-Notify header: "mqtt" while it is subscribed, anything else means polling. */
export const boardNotifyFrom = (header: string | null): BoardNotify => (header?.trim().toLowerCase() === "mqtt" ? "mqtt" : "poll");

/** What the server knows about a machine's board, one row per machine. */
export interface ClawSync {
  machineId: string;
  /** Last recorded pull (see PULL_RECORD_INTERVAL_MS) and what it was sent. */
  pulledAt?: number;
  pulledSha?: string;
  pulledRevision?: number;
  fw?: string;
  /** Whether the board had its MQTT session up at its last recorded pull. */
  notify?: BoardNotify;
  /** Last config the board reported as applied. */
  appliedSha?: string;
  appliedRevision?: number;
  appliedAt?: number;
  /** Latest report of either kind. */
  lastAck?: ClawAck;
}

export function shouldRecordPull(
  prev: ClawSync | null | undefined,
  pull: { sha: string; fw?: string; notify: BoardNotify },
  now: number
) {
  if (!prev?.pulledAt) return true;
  if (prev.pulledSha !== pull.sha || (pull.fw && prev.fw !== pull.fw) || prev.notify !== pull.notify) return true;
  return now - prev.pulledAt >= PULL_RECORD_INTERVAL_MS;
}

/**
 * - never: no board has pulled with this machine's token yet
 * - applied: the board runs the saved settings
 * - failed: the board rejected the saved settings (see lastAck)
 * - offline: the saved settings are newer than the board's, and it isn't polling
 * - pending: the board is polling and will get the saved settings on its next pull
 */
export type DeliveryState = "never" | "applied" | "failed" | "offline" | "pending";

export function deliveryState(
  savedSha: string,
  sync: ClawSync | null | undefined,
  now: number
): { state: DeliveryState; online: boolean } {
  if (!sync?.pulledAt) return { state: "never", online: false };
  const online = now - sync.pulledAt < DEVICE_OFFLINE_MS;
  if (sync.appliedSha === savedSha) return { state: "applied", online };
  if (sync.lastAck?.st === "failed" && sync.lastAck.sha === savedSha) return { state: "failed", online };
  return { state: online ? "pending" : "offline", online };
}
