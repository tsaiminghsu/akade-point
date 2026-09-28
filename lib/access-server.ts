import { cookies } from "next/headers";

import {
  allows,
  allowsAt,
  allowsSomewhere,
  cleanStoreRoles,
  DEV_AS_COOKIE,
  DEV_ROLE_COOKIE,
  effectiveRole,
  hasAnyAccess,
  isRole,
  storeFilter,
  type Action,
  type Grants,
  type Role,
  type StoreRole,
} from "@/lib/control-center/access";
import { getRole } from "@/lib/dynamo/cc-roles";
import { getUser } from "@/lib/dynamo/users";
import { requireSession } from "@/lib/session";

export interface Actor extends Grants {
  id: string;
  name: string;
  /** global role (every store); null when the user only has store grants */
  role: Role | null;
  stores: Record<string, StoreRole>;
}

/**
 * Who is calling and what they were granted, or null when not signed in / no
 * grants at all.
 *
 * Outside production there is no login (see lib/session.ts): the caller is a
 * fake "Dev Admin" whose role defaults to system-admin and can be switched
 * with the dev-only cookie, or who acts as a user from the roles table (with
 * that user's per-store grants), so every combination can be tried locally.
 */
export async function currentActor(): Promise<Actor | null> {
  if (process.env.NODE_ENV !== "production") {
    const jar = cookies();
    const as = jar.get(DEV_AS_COOKIE)?.value;
    if (as) {
      const rec = await getRole(as);
      const actor: Actor = { id: as, name: `Dev as ${as}`, role: effectiveRole(rec?.role, false), stores: cleanStoreRoles(rec?.stores) };
      return hasAnyAccess(actor) ? actor : null;
    }
    const fromCookie = jar.get(DEV_ROLE_COOKIE)?.value;
    const role: Role = isRole(fromCookie) ? fromCookie : "system-admin";
    return { id: "dev-admin", name: "Dev Admin", role, stores: {} };
  }
  const session = await requireSession();
  if (!session) return null;
  const [profile, rec] = await Promise.all([getUser(session.id), getRole(session.id)]);
  const actor: Actor = {
    id: session.id,
    name: session.name ?? profile?.displayName ?? session.id,
    role: effectiveRole(rec?.role, profile?.isAdmin),
    stores: cleanStoreRoles(rec?.stores),
  };
  return hasAnyAccess(actor) ? actor : null;
}

/**
 * The actor if their **global** role allows `action`, else null (routes
 * answer 403). For things that belong to no store (users, brands, device
 * tokens, vehicles without a store) and for creating stores.
 */
export async function requireAccess(action: Action): Promise<Actor | null> {
  const actor = await currentActor();
  return actor && allows(actor.role, action) ? actor : null;
}

/** The actor if they may do `action` at `storeId` (their global role or that store's). null storeId = requireAccess. */
export async function requireAccessAt(action: Action, storeId: string | null | undefined): Promise<Actor | null> {
  const actor = await currentActor();
  return actor && allowsAt(actor, action, storeId) ? actor : null;
}

/**
 * The actor if `action` is allowed anywhere; the route must then confine what
 * it returns or touches with `storeFilter(actor, action)` / `canAt`.
 */
export async function requireAnyAccess(action: Action): Promise<Actor | null> {
  const actor = await currentActor();
  return actor && allowsSomewhere(actor, action) ? actor : null;
}

export function canAt(actor: Actor, action: Action, storeId: string | null | undefined): boolean {
  return allowsAt(actor, action, storeId);
}

export { storeFilter };
