import { NextResponse } from "next/server";

import { currentActor } from "@/lib/access-server";
import { capabilities } from "@/lib/control-center/access";

/** The caller's grants and what the global role allows, for hiding actions in the UI. */
export async function GET() {
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const dev = process.env.NODE_ENV !== "production";
  return NextResponse.json({
    id: actor.id,
    name: actor.name,
    role: actor.role,
    stores: actor.stores,
    can: capabilities(actor.role),
    // Local dev has no login; the role can be switched, or the app used as a user from the roles table.
    devRoleSwitch: dev,
    devAs: dev && actor.id !== "dev-admin" ? actor.id : null,
  });
}
