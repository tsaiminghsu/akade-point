import { NextResponse } from "next/server";
import { getCollectionStatus } from "@/lib/collection";
import { requireSession } from "@/lib/session";

export async function GET() {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const status = await getCollectionStatus(user.id);
  return NextResponse.json(status);
}
