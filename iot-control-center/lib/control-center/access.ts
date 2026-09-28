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
  | "users.manage"
  /** see who has a role at a store and assign store roles there (canAssignStoreRole limits which) */
  | "store.members";

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
  "store.members": "store-admin",
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

// ---- per-store roles -------------------------------------------------------------

/**
 * Roles that can be granted for one store. system-admin is global only: what
 * it adds (users, device tokens, vehicles) is not any one store's.
 */
export const STORE_ROLES = ["viewer", "operator", "store-admin"] as const;
export type StoreRole = (typeof STORE_ROLES)[number];

export function isStoreRole(v: unknown): v is StoreRole {
  return typeof v === "string" && (STORE_ROLES as readonly string[]).includes(v);
}

/**
 * What a user may do: a global role that applies to every store (and to what
 * belongs to no store), plus roles granted for single stores. At a store the
 * higher of the two counts, so a global viewer can be a store-admin of one
 * shop.
 */
export interface Grants {
  role: Role | null;
  stores: Record<string, StoreRole>;
}

export const NO_GRANTS: Grants = { role: null, stores: {} };

const higher = (a: Role | null, b: Role | null): Role | null => (!a ? b : !b ? a : ROLES.indexOf(a) >= ROLES.indexOf(b) ? a : b);

/** The role that counts at `storeId`; null/undefined asks about things that belong to no store (global role only). */
export function roleAt(g: Grants, storeId?: string | null): Role | null {
  return higher(g.role, storeId ? (g.stores[storeId] ?? null) : null);
}

export function allowsAt(g: Grants, action: Action, storeId?: string | null): boolean {
  return allows(roleAt(g, storeId), action);
}

/** Whether `action` is allowed anywhere: globally or at some store. */
export function allowsSomewhere(g: Grants, action: Action): boolean {
  return allows(g.role, action) || Object.values(g.stores).some((r) => allows(r, action));
}

/** Everywhere `action` is allowed: "all" stores (the global role allows it) or these store ids. */
export function storesAllowing(g: Grants, action: Action): "all" | string[] {
  if (allows(g.role, action)) return "all";
  return Object.entries(g.stores)
    .filter(([, r]) => allows(r, action))
    .map(([id]) => id);
}

/** A predicate over store ids for filtering lists; items of no store pass only with a global role. */
export function storeFilter(g: Grants, action: Action): (storeId: string | null | undefined) => boolean {
  const where = storesAllowing(g, action);
  if (where === "all") return () => true;
  const set = new Set(where);
  return (storeId) => !!storeId && set.has(storeId);
}

export function hasAnyAccess(g: Grants): boolean {
  return g.role !== null || Object.keys(g.stores).length > 0;
}

/** Keeps only well-formed store grants (a stored map may hold junk or stale roles). */
export function cleanStoreRoles(v: unknown): Record<string, StoreRole> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Record<string, StoreRole> = {};
  for (const [id, r] of Object.entries(v as Record<string, unknown>)) if (id && isStoreRole(r)) out[id] = r;
  return out;
}

/**
 * Whether `actor` may change `target`'s role at `storeId` to `next` (null =
 * remove the store role). Store admins run their own shop's team:
 * - only at stores where they hold "store.members";
 * - never above their own role there (a store-admin can make store-admins);
 * - only for people below them there, so peers and superiors (another
 *   store-admin, a global store-admin, a system-admin) are left alone.
 * System-admins, above every store role, may change anyone's.
 */
export function canAssignStoreRole(actor: Grants, target: Grants, storeId: string, next: StoreRole | null): boolean {
  const mine = roleAt(actor, storeId);
  if (!mine || !allows(mine, "store.members")) return false;
  const rank = (r: Role | null) => (r ? ROLES.indexOf(r) : -1);
  if (next && rank(next) > rank(mine)) return false;
  return rank(roleAt(target, storeId)) < rank(mine);
}

/** The strongest role held anywhere, for labels ("store-admin at 2 stores"). */
export function strongestRole(g: Grants): Role | null {
  return Object.values(g.stores).reduce<Role | null>((acc, r) => higher(acc, r), g.role);
}

/** Dev-only role switch (see lib/access-server.ts). */
export const DEV_ROLE_COOKIE = "cc_dev_role";
/** Dev-only: act as a user from the roles table, with their per-store grants. */
export const DEV_AS_COOKIE = "cc_dev_as";
