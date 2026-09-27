import { clawConfigTopic, type ClawNotice, type ClawNotifyMode } from "@/lib/control-center/claw/device";

export type { ClawNotifyMode };

/**
 * "Your config changed" doorbell for claw machine boards. After a save, the
 * server publishes a tiny notice to claw/{machineId}/config and the board pulls
 * its settings over HTTPS at once, instead of at its next poll. HTTPS stays
 * the only data path, so a lost notice only means the board catches up on its
 * fallback poll. Never throws. Server-only.
 *
 * CLAW_CONFIG_NOTIFY picks the transport:
 *   iot   AWS IoT Core through the data-plane HTTPS API (IOT_DATA_ENDPOINT,
 *         AWS_REGION; the server role needs iot:Publish on topic/claw/*)
 *   mqtt  any MQTT broker at CLAW_MQTT_URL (local dev, or an on-prem broker)
 *   else  off: boards just poll
 */

export interface ClawNoticeTarget extends Omit<ClawNotice, "v"> {
  machineId: string;
}

export interface ClawNotifyResult {
  mode: ClawNotifyMode;
  sent: number;
  failed: number;
}

/** Longest a save waits on the broker before giving up on the notices. */
const NOTIFY_TIMEOUT_MS = 5000;
/** IoT data-plane publishes in flight at once. */
const IOT_CONCURRENCY = 10;

export function clawNotifyMode(): ClawNotifyMode {
  const mode = process.env.CLAW_CONFIG_NOTIFY;
  return mode === "iot" || mode === "mqtt" ? mode : "off";
}

/**
 * The broker address a board should use, shown on the setup page. For IoT
 * Core it's the account's ATS endpoint over TLS; for a plain broker,
 * CLAW_MQTT_DEVICE_URL (a LAN address a board can reach), else CLAW_MQTT_URL.
 */
export function boardBrokerUri(): string | null {
  const mode = clawNotifyMode();
  if (mode === "iot") {
    const host = process.env.IOT_DATA_ENDPOINT?.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    return host ? `mqtts://${host}:8883` : null;
  }
  if (mode === "mqtt") return process.env.CLAW_MQTT_DEVICE_URL || process.env.CLAW_MQTT_URL || null;
  return null;
}

const payloadOf = (t: ClawNoticeTarget) => JSON.stringify({ v: 1, sha: t.sha, rev: t.rev } satisfies ClawNotice);

function withTimeout<T>(work: Promise<T>, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), NOTIFY_TIMEOUT_MS);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

async function viaIot(targets: ClawNoticeTarget[]): Promise<number> {
  const endpoint = process.env.IOT_DATA_ENDPOINT;
  if (!endpoint) {
    console.error("claw notify: CLAW_CONFIG_NOTIFY=iot but IOT_DATA_ENDPOINT is not set");
    return 0;
  }
  // Lazy, so the SDK only loads when notices are on.
  const { IoTDataPlaneClient, PublishCommand } = await import("@aws-sdk/client-iot-data-plane");
  const client = new IoTDataPlaneClient({
    endpoint: endpoint.startsWith("http") ? endpoint : `https://${endpoint}`,
    region: process.env.AWS_REGION ?? "ap-northeast-1",
  });
  let sent = 0;
  for (let i = 0; i < targets.length; i += IOT_CONCURRENCY) {
    const results = await Promise.allSettled(
      targets.slice(i, i + IOT_CONCURRENCY).map((t) =>
        client.send(
          new PublishCommand({ topic: clawConfigTopic(t.machineId), qos: 1, payload: Buffer.from(payloadOf(t)) })
        )
      )
    );
    for (const r of results) {
      if (r.status === "fulfilled") sent += 1;
      else console.error("claw notify: IoT publish failed", r.reason);
    }
  }
  return sent;
}

async function viaMqtt(targets: ClawNoticeTarget[]): Promise<number> {
  const url = process.env.CLAW_MQTT_URL;
  if (!url) {
    console.error("claw notify: CLAW_CONFIG_NOTIFY=mqtt but CLAW_MQTT_URL is not set");
    return 0;
  }
  const { connectAsync } = await import("mqtt");
  // One short-lived connection per save (or per bulk copy): route handlers
  // can't keep a broker session open between requests.
  const client = await connectAsync(url, {
    clientId: `control-center-${Math.random().toString(36).slice(2, 10)}`,
    connectTimeout: NOTIFY_TIMEOUT_MS,
    reconnectPeriod: 0,
    clean: true,
  });
  let sent = 0;
  try {
    for (const t of targets) {
      try {
        await client.publishAsync(clawConfigTopic(t.machineId), payloadOf(t), { qos: 1 });
        sent += 1;
      } catch (err) {
        console.error("claw notify: MQTT publish failed", err);
      }
    }
  } finally {
    await client.endAsync().catch(() => undefined);
  }
  return sent;
}

/** Tell these machines' boards to pull now. Reports how many notices went out. */
export async function notifyClawConfig(targets: ClawNoticeTarget[]): Promise<ClawNotifyResult> {
  const mode = clawNotifyMode();
  if (mode === "off" || targets.length === 0) return { mode, sent: 0, failed: 0 };
  const work = (mode === "iot" ? viaIot(targets) : viaMqtt(targets)).catch((err) => {
    console.error(`claw notify (${mode}) failed`, err);
    return 0;
  });
  const sent = await withTimeout(work, 0);
  return { mode, sent, failed: targets.length - sent };
}
