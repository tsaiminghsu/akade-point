/**
 * DynamoDB TTL for the two append-only Control Center tables. Live Mode writes
 * telemetry every second, so without an expiry these tables grow forever and
 * every list request gets permanently slower. TTL is declared on the tables by
 * scripts/create-tables.mjs; these constants decide the horizon.
 *
 * Note: DynamoDB Local accepts the TTL API and reports it as enabled but never
 * actually deletes expired items, so local dev keeps everything.
 */

/** Raw telemetry events: 30 days. The History page reads the recent window. */
export const EVENT_TTL_SECONDS = 30 * 24 * 60 * 60;

/** Alerts: 90 days, so Analytics' resolution-rate history stays meaningful. */
export const ALERT_TTL_SECONDS = 90 * 24 * 60 * 60;

/** Vehicle telemetry history: 7 days. The live state lives on the vehicle row;
 *  this table is only the recent flight-path window. */
export const VEHICLE_TELEMETRY_TTL_SECONDS = 7 * 24 * 60 * 60;

/** Vehicle STATUSTEXT messages (events table): 7 days, like telemetry. */
export const VEHICLE_EVENT_TTL_SECONDS = 7 * 24 * 60 * 60;

/** Vehicle command log: 30 days. */
export const VEHICLE_COMMAND_TTL_SECONDS = 30 * 24 * 60 * 60;

/**
 * TTL attribute value (epoch **seconds**, as DynamoDB requires) derived from the
 * record's own domain time rather than "now", so a back-dated record expires
 * relative to when it actually happened.
 */
export function expiresAtFrom(epochMs: number, ttlSeconds: number): number {
  return Math.floor(epochMs / 1000) + ttlSeconds;
}
