import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Tickets for the direct browser ⇄ companion WebSocket.
 *
 * The companion cannot ask this server whether a browser is logged in (it may
 * be offline, and it should not be an open door on the LAN), so the server
 * signs a short-lived ticket the browser presents as its first WebSocket
 * message. The signing key is per vehicle and per device token:
 *
 *   key = base64url(HMAC-SHA256(VEHICLE_DIRECT_SIGNING_KEY, "direct:<vehicleId>:<tokenId>"))
 *
 * The companion receives `key` once, in its config, when the device token is
 * generated. Reissuing the token (which revokes the old one) therefore also
 * rotates the direct-link key, and nothing secret is stored server-side.
 *
 * Ticket = base64url(JSON payload) + "." + base64url(HMAC-SHA256(key, first part)).
 * The Python side is companion/vehicle_companion/links/ticket.py; both are
 * tested against the same vector.
 */

export type DirectScope = "view" | "control";

export interface DirectTicketPayload {
  /** vehicle id */
  vid: string;
  /** user id of the operator */
  sub: string;
  scope: DirectScope;
  /** expiry, epoch ms (server clock) */
  exp: number;
  /** nonce */
  n: string;
}

export const DIRECT_TICKET_TTL_MS = 15 * 60 * 1000;

const b64url = (buf: Buffer | string) => Buffer.from(buf).toString("base64url");

export function masterKey(): string | null {
  return process.env.VEHICLE_DIRECT_SIGNING_KEY || process.env.NEXTAUTH_SECRET || null;
}

export function deriveDirectKey(master: string, vehicleId: string, tokenId: string): string {
  return createHmac("sha256", master).update(`direct:${vehicleId}:${tokenId}`).digest("base64url");
}

export function signTicket(key: string, payload: DirectTicketPayload): string {
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", key).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function newTicketPayload(vehicleId: string, userId: string, scope: DirectScope, now: number = Date.now()): DirectTicketPayload {
  return { vid: vehicleId, sub: userId, scope, exp: now + DIRECT_TICKET_TTL_MS, n: randomBytes(9).toString("base64url") };
}

/** Verifies signature, vehicle and expiry. Returns the payload or null. */
export function verifyTicket(key: string, ticket: string, vehicleId: string, now: number = Date.now()): DirectTicketPayload | null {
  const [body, sig] = ticket.split(".");
  if (!body || !sig) return null;
  const want = createHmac("sha256", key).update(body).digest();
  const got = Buffer.from(sig, "base64url");
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as DirectTicketPayload;
    if (payload.vid !== vehicleId || typeof payload.exp !== "number" || payload.exp < now) return null;
    return payload;
  } catch {
    return null;
  }
}
