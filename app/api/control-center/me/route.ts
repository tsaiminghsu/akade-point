import { NextResponse } from "next/server";

import { currentActor } from "@/lib/access-server";
import { capabilities } from "@/lib/control-center/access";

/** The caller's role and what it allows, for hiding actions in the UI. */
export async function GET() {
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({
    id: actor.id,
    name: actor.name,
    role: actor.role,
    can: capabilities(actor.role),
    // Local dev has no login; the role can be switched to try each one.
    devRoleSwitch: process.env.NODE_ENV !== "production",
  });
}
