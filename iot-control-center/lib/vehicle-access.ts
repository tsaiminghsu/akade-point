import { requireAccess, requireAccessAt, requireAnyAccess, type Actor } from "@/lib/access-server";
import type { Action } from "@/lib/control-center/access";
import { getVehicle } from "@/lib/dynamo/cc-vehicles";

/**
 * Vehicle-module actions mapped onto the Control Center roles
 * (lib/control-center/access.ts, docs/permissions.md). Human (browser) vehicle
 * routes call this; device routes use requireDeviceToken instead.
 */
export type VehicleAction = "view" | "manage" | "command" | "mission" | "provision";

const ACTIONS: Record<VehicleAction, Action> = {
  view: "read",
  command: "vehicle.command",
  mission: "vehicle.mission",
  manage: "vehicle.manage",
  provision: "token.manage",
};

/**
 * With a vehicle id: the caller's role at the vehicle's store counts (global
 * role only for a vehicle of no store, or an unknown id — the route 404s).
 * Without one ("the vehicle list"): viewing needs access anywhere and the
 * route filters by store; anything else needs the global role.
 */
export async function requireVehicleAccess(action: VehicleAction, vehicleId: string | null): Promise<Actor | null> {
  if (vehicleId === null) return action === "view" ? requireAnyAccess("read") : requireAccess(ACTIONS[action]);
  const vehicle = await getVehicle(vehicleId);
  return requireAccessAt(ACTIONS[action], vehicle?.storeId || null);
}
