import type { VehicleLinkState } from "./types";
import { VEHICLE_ONLINE_MS, VEHICLE_STALE_MS } from "./constants";

/**
 * Derives a vehicle's link state from the last time its companion was heard
 * from. Never stored — computed fresh on every read so a vehicle silently
 * ages from online → stale → offline without a background job.
 */
export function linkStateOf(lastSeenAt: number | null | undefined, now: number = Date.now()): VehicleLinkState {
  if (lastSeenAt == null) return "offline";
  const age = now - lastSeenAt;
  if (age < VEHICLE_ONLINE_MS) return "online";
  if (age < VEHICLE_STALE_MS) return "stale";
  return "offline";
}
