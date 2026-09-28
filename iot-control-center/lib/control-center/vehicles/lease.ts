/**
 * One operator at a time. Taking control in the ground station acquires a
 * short lease on the vehicle, renewed while the page keeps control; others
 * can watch, and can take over only deliberately. The lease is keyed by the
 * page (`cid`, random per page load), not just the user: the same admin on a
 * laptop and a phone are two operators.
 *
 * The server refuses cloud commands from anyone but the holder, and hands the
 * lease to the companion in every telemetry response so the direct link can
 * refuse them too.
 */

export interface ControlLease {
  /** the holding page */
  cid: string;
  /** user id */
  sub: string;
  /** display name */
  name: string;
  /** server epoch ms the lease runs out */
  until: number;
  /** when this holder took it */
  since: number;
}

export const LEASE_TTL_MS = 15_000;
export const LEASE_RENEW_MS = 5_000;

export function activeLease(lease: ControlLease | null | undefined, now: number): ControlLease | null {
  return lease && lease.until > now ? lease : null;
}

/** The lease that stops `cid` from commanding, or null if it may. No lease: anyone may. */
export function blockingLease(lease: ControlLease | null | undefined, cid: string | null | undefined, now: number): ControlLease | null {
  const active = activeLease(lease, now);
  return active && active.cid !== cid ? active : null;
}

/** Header the ground station sends its page id in. */
export const CLIENT_HEADER = "x-gcs-client";
