import { NextResponse } from "next/server";
import { getUserRegistrations } from "@/lib/dynamo/registrations";
import { requireSession } from "@/lib/session";

export async function GET() {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const registrations = await getUserRegistrations(user.id);
  return NextResponse.json({ registrations });
}
