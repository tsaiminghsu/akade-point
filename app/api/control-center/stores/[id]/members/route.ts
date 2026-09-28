import { NextResponse } from "next/server";

import { requireAccessAt } from "@/lib/access-server";
import { canAssignStoreRole, cleanStoreRoles, effectiveRole, ROLES, STORE_ROLES, type StoreRole } from "@/lib/control-center/access";
import { listStoreMembers } from "@/lib/dynamo/cc-roles";
import { getStore } from "@/lib/dynamo/cc-stores";
import { getUser } from "@/lib/dynamo/users";

export const dynamic = "force-dynamic";

/**
 * Who has a role at this store: its own members and everyone with a global
 * role (shown read-only, their access comes from elsewhere). For the store's
 * admins, so they see their team without seeing every account.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const actor = await requireAccessAt("store.members", params.id);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await getStore(params.id))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const records = await listStoreMembers(params.id);
  const members = await Promise.all(
    records.map(async (r) => {
      const profile = await getUser(r.userId);
      const target = { role: effectiveRole(r.role, profile?.isAdmin), stores: cleanStoreRoles(r.stores) };
      return {
        userId: r.userId,
        name: profile?.displayName ?? null,
        email: profile?.email ?? null,
        storeRole: target.stores[params.id] ?? null,
        globalRole: target.role,
        self: r.userId === actor.id,
        editable: r.userId !== actor.id && canAssignStoreRole(actor, target, params.id, null),
      };
    })
  );
  members.sort(
    (a, b) =>
      Number(!!b.storeRole) - Number(!!a.storeRole) ||
      ROLES.indexOf(b.storeRole ?? b.globalRole ?? "viewer") - ROLES.indexOf(a.storeRole ?? a.globalRole ?? "viewer") ||
      (a.name ?? a.userId).localeCompare(b.name ?? b.userId)
  );
  // The roles this caller may hand out here: up to their own.
  const grantable: StoreRole[] = STORE_ROLES.filter((r) => canAssignStoreRole(actor, { role: null, stores: {} }, params.id, r));
  return NextResponse.json({ members, grantable });
}
