import { requireAdminOrDevBypass } from "@/lib/session";

/**
 * Actions the vehicles module gates. Today every one requires admin, but this
 * is the single seam where a role model would slot in: see docs/permissions.md
 * for the proposed viewer / operator / store-admin / system-admin matrix. Human
 * (browser) vehicle routes call this instead of requireAdminOrDevBypass
 * directly so the future change touches one file, not thirty route handlers.
 */
export type VehicleAction = "view" | "manage" | "command" | "mission" | "provision";

export async function requireVehicleAccess(_action: VehicleAction) {
  return requireAdminOrDevBypass();
}
