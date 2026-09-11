/**
 * Server-sent events relay for live AIS.
 *
 * The browser cannot talk to AISStream.io directly without shipping the API key
 * to every visitor, so the key stays here and the server holds the upstream
 * WebSocket. Reports are normalised into the same shape the simulation produces
 * and batched, because a busy port pushes far more messages per second than a
 * display needs.
 *
 * Requires AISSTREAM_API_KEY. Without it the route answers with a status event
 * explaining what is missing rather than an opaque connection failure.
 */

import type { NextRequest } from 'next/server';

import type { AisReport, NavStatus, VesselKind } from '@/components/ship-tracker/radar/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AIS_STREAM_URL = 'wss://stream.aisstream.io/v0/stream';

/** Kaohsiung approaches, matching the simulated scene. */
const DEFAULT_BOX = { south: 22.35, west: 120.05, north: 22.85, east: 120.55 };

/** How often batched reports are flushed to the browser. */
const FLUSH_INTERVAL_MS = 1000;

/** Give up on an upstream that has said nothing at all for this long. */
const SILENCE_TIMEOUT_MS = 90_000;

export async function GET(request: NextRequest) {
  const apiKey = process.env.AISSTREAM_API_KEY;
  const encoder = new TextEncoder();

  const params = request.nextUrl.searchParams;
  const box = {
    south: numberParam(params.get('south'), DEFAULT_BOX.south),
    west: numberParam(params.get('west'), DEFAULT_BOX.west),
    north: numberParam(params.get('north'), DEFAULT_BOX.north),
    east: numberParam(params.get('east'), DEFAULT_BOX.east),
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let socket: WebSocket | null = null;
      let flushTimer: ReturnType<typeof setInterval> | null = null;
      let silenceTimer: ReturnType<typeof setTimeout> | null = null;

      const pending = new Map<string, AisReport>();
      /** Static data arrives separately from position reports; keep it around. */
      const statics = new Map<string, { name: string; kind: VesselKind; lengthM: number; destination: string }>();

      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          // The client hung up between the check and the write.
        }
      };

      const cleanup = () => {
        if (closed) return;
        closed = true;
        if (flushTimer) clearInterval(flushTimer);
        if (silenceTimer) clearTimeout(silenceTimer);
        try {
          socket?.close();
        } catch {
          // Already closed.
        }
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      };

      request.signal.addEventListener('abort', cleanup);

      if (!apiKey) {
        // `fatal` tells the browser to stop the EventSource. Without it the
        // client reconnects every few seconds forever against a server that is
        // never going to have the key it is missing.
        send('status', {
          message:
            '伺服器未設定 AISSTREAM_API_KEY，無法接收真實 AIS。請至 aisstream.io 申請免費金鑰後寫入環境變數。',
          fatal: true,
        });
        cleanup();
        return;
      }

      const armSilenceTimer = () => {
        if (silenceTimer) clearTimeout(silenceTimer);
        silenceTimer = setTimeout(() => {
          send('status', { message: 'AIS 上游長時間沒有訊息，連線已關閉。' });
          cleanup();
        }, SILENCE_TIMEOUT_MS);
      };

      send('status', { message: '連線至 AISStream.io...' });

      try {
        socket = new WebSocket(AIS_STREAM_URL);
      } catch {
        send('status', { message: '無法建立 AIS 上游連線。', fatal: true });
        cleanup();
        return;
      }

      socket.onopen = () => {
        socket?.send(
          JSON.stringify({
            APIKey: apiKey,
            BoundingBoxes: [
              [
                [box.south, box.west],
                [box.north, box.east],
              ],
            ],
            FilterMessageTypes: ['PositionReport', 'ShipStaticData'],
          })
        );
        send('status', { message: '已訂閱 AIS 區域，等待位置報告' });
        armSilenceTimer();
      };

      socket.onmessage = (event) => {
        armSilenceTimer();
        let payload: AisStreamMessage;
        try {
          payload = JSON.parse(String(event.data)) as AisStreamMessage;
        } catch {
          return;
        }

        const mmsi = String(payload.MetaData?.MMSI ?? '');
        if (!mmsi) return;

        if (payload.MessageType === 'ShipStaticData' && payload.Message?.ShipStaticData) {
          const s = payload.Message.ShipStaticData;
          const dim = s.Dimension;
          statics.set(mmsi, {
            name: (s.Name ?? '').trim(),
            kind: kindFromAisType(s.Type ?? 0),
            lengthM: dim ? Math.max(0, (dim.A ?? 0) + (dim.B ?? 0)) : 0,
            destination: (s.Destination ?? '').trim(),
          });
          return;
        }

        const report = payload.Message?.PositionReport;
        if (!report) return;

        const lat = report.Latitude ?? payload.MetaData?.latitude;
        const lon = report.Longitude ?? payload.MetaData?.longitude;
        if (typeof lat !== 'number' || typeof lon !== 'number') return;

        const info = statics.get(mmsi);
        const metaName = (payload.MetaData?.ShipName ?? '').trim();

        pending.set(mmsi, {
          mmsi,
          name: info?.name || metaName || mmsi,
          kind: info?.kind ?? 'cargo',
          lengthM: info?.lengthM && info.lengthM > 0 ? info.lengthM : 90,
          lat,
          lon,
          // A true heading of 511 is the AIS code for "not available", in which
          // case the course over ground is the best estimate of where she points.
          cog: report.Cog ?? 0,
          sog: report.Sog ?? 0,
          heading:
            report.TrueHeading !== undefined && report.TrueHeading < 360
              ? report.TrueHeading
              : (report.Cog ?? 0),
          navStatus: navStatusFrom(report.NavigationalStatus),
          destination: info?.destination ?? '',
          t: Date.now(),
        });
      };

      socket.onerror = () => {
        send('status', { message: 'AIS 上游連線錯誤。' });
      };

      socket.onclose = () => {
        send('status', { message: 'AIS 上游連線已關閉。' });
        cleanup();
      };

      flushTimer = setInterval(() => {
        if (pending.size === 0) return;
        send('position', [...pending.values()]);
        pending.clear();
      }, FLUSH_INTERVAL_MS);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Stops nginx and similar proxies from buffering the stream into silence.
      'X-Accel-Buffering': 'no',
    },
  });
}

function numberParam(raw: string | null, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * AIS navigational status codes, narrowed to the states the display cares
 * about. Anything unrecognised is treated as under way, which is the safe
 * assumption for collision avoidance.
 */
function navStatusFrom(code: number | undefined): NavStatus {
  switch (code) {
    case 1:
      return 'anchored';
    case 5:
      return 'moored';
    case 7:
      return 'fishing';
    case 3:
    case 4:
    case 6:
      return 'restricted';
    default:
      return 'underway';
  }
}

/** AIS ship-and-cargo type codes, collapsed onto the kinds this display draws. */
function kindFromAisType(code: number): VesselKind {
  if (code === 30) return 'fishing';
  if (code === 31 || code === 32 || code === 52) return 'tug';
  if (code === 50) return 'pilot';
  if (code === 35 || code === 55) return 'patrol';
  if (code >= 80 && code <= 89) return 'tanker';
  if (code >= 70 && code <= 79) return 'cargo';
  return 'cargo';
}

// ── Upstream payload shapes ───────────────────────────────────────

interface AisStreamMessage {
  MessageType?: string;
  MetaData?: {
    MMSI?: number | string;
    ShipName?: string;
    latitude?: number;
    longitude?: number;
  };
  Message?: {
    PositionReport?: {
      Cog?: number;
      Sog?: number;
      TrueHeading?: number;
      NavigationalStatus?: number;
      Latitude?: number;
      Longitude?: number;
    };
    ShipStaticData?: {
      Name?: string;
      Type?: number;
      Destination?: string;
      Dimension?: { A?: number; B?: number; C?: number; D?: number };
    };
  };
}
