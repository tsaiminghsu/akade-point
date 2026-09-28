import { cookies } from "next/headers";

import { allows, DEV_ROLE_COOKIE, effectiveRole, isRole, type Action, type Role } from "@/lib/control-center/access";
import { getRole } from "@/lib/dynamo/cc-roles";
import { getUser } from "@/lib/dynamo/users";
import { requireSession } from "@/lib/session";

export interface Actor {
  id: string;
  name: string;
  role: Role;
}

/**
 * Who is calling and with what role, or null when not signed in / no role.
 *
 * Outside production there is no login (see lib/session.ts): the caller is a
 * fake "Dev Admin" whose role defaults to system-admin and can be switched
 * with the dev-only cookie, so every role can be tried locally.
 */
export async function currentActor(): Promise<Actor | null> {
  if (process.env.NODE_ENV !== "production") {
    const fromCookie = cookies().get(DEV_ROLE_COOKIE)?.value;
    const role: Role = isRole(fromCookie) ? fromCookie : "system-admin";
    return { id: "dev-admin", name: "Dev Admin", role };
  }
  const session = await requireSession();
  if (!session) return null;
  const [profile, explicit] = await Promise.all([getUser(session.id), getRole(session.id)]);
  const role = effectiveRole(explicit?.role, profile?.isAdmin);
  if (!role) return null;
  return { id: session.id, name: session.name ?? profile?.displayName ?? session.id, role };
}

/** The actor if their role allows `action`, else null (routes answer 403). */
export async function requireAccess(action: Action): Promise<Actor | null> {
  const actor = await currentActor();
  return actor && allows(actor.role, action) ? actor : null;
}
