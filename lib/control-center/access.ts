/**
 * Roles and what they may do (docs/permissions.md). Pure: shared by the API
 * guard (lib/access-server.ts) and the UI, which only hides what the API would
 * refuse anyway.
 *
 * Roles are ordered; each includes everything below it.
 */

export const ROLES = ["viewer", "operator", "store-admin", "system-admin"] as const;
export type Role = (typeof ROLES)[number];

export type Action =
  /** any read */
  | "read"
  /**
   * Writes from the in-browser machine simulator (events, alerts detected in
   * a tick). Every open page runs it, so viewers may; raise this when real
   * device ingestion replaces the simulator.
   */
  | "simulate"
  /** acknowledge / resolve alerts */
  | "alert.handle"
  /** log maintenance on a machine */
  | "maintenance.write"
  /** vehicle commands, taking control, direct-link control tickets */
  | "vehicle.command"
  /** create / edit / upload missions, fences, rally points */
  | "vehicle.mission"
  /** machines, stores, brands, groups, store settings, floor-plan versions, claw configs */
  | "store.manage"
  /** create / edit / delete vehicles */
  | "vehicle.manage"
  /** machine (ESP32) and vehicle (companion) device tokens */
  | "token.manage"
  /** see users and assign roles */
  | "users.manage";

export const MIN_ROLE: Record<Action, Role> = {
  read: "viewer",
  simulate: "viewer",
  "alert.handle": "operator",
  "maintenance.write": "operator",
  "vehicle.command": "operator",
  "vehicle.mission": "operator",
  "store.manage": "store-admin",
  "vehicle.manage": "system-admin",
  "token.manage": "system-admin",
  "users.manage": "system-admin",
};

export function isRole(v: unknown): v is Role {
  return typeof v === "string" && (ROLES as readonly string[]).includes(v);
}

export function allows(role: Role | null | undefined, action: Action): boolean {
  if (!role) return false;
  return ROLES.indexOf(role) >= ROLES.indexOf(MIN_ROLE[action]);
}

/**
 * The effective role: an explicit Control Center role wins; otherwise the
 * shared akade-users isAdmin flag maps to system-admin, so existing admins
 * keep full access; anyone else has none.
 */
export function effectiveRole(explicit: string | null | undefined, isAdmin: boolean | undefined): Role | null {
  if (isRole(explicit)) return explicit;
  return isAdmin ? "system-admin" : null;
}

/** Everything a role may do, for the UI. */
export function capabilities(role: Role | null): Record<Action, boolean> {
  return Object.fromEntries((Object.keys(MIN_ROLE) as Action[]).map((a) => [a, allows(role, a)])) as Record<Action, boolean>;
}

/** Dev-only role switch (see lib/access-server.ts). */
export const DEV_ROLE_COOKIE = "cc_dev_role";
