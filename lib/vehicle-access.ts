import { requireAccess } from "@/lib/access-server";
import type { Action } from "@/lib/control-center/access";

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

export async function requireVehicleAccess(action: VehicleAction) {
  return requireAccess(ACTIONS[action]);
}
