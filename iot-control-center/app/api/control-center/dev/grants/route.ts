import { NextResponse } from "next/server";

import { listRoles } from "@/lib/dynamo/cc-roles";

export const dynamic = "force-dynamic";

/**
 * Local dev only: who has grants in the roles table, for the top bar's
 * "view as" switch (lib/access-server.ts reads the chosen user's grants).
 * Absent in production, where there is a real login.
 */
export async function GET() {
  if (process.env.NODE_ENV === "production") return NextResponse.json({ error: "Not found" }, { status: 404 });
  const roles = await listRoles();
  return NextResponse.json({ users: roles.map((r) => ({ userId: r.userId, role: r.role ?? null, stores: r.stores ?? {} })) });
}
