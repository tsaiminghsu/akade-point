import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAccess } from "@/lib/access-server";
import { createMachine, listMachines, listMachinesByGroup, listMachinesByStore } from "@/lib/dynamo/cc-machines";

const createSchema = z.object({
  name: z.string().min(1),
  deviceId: z.string().min(1),
  storeId: z.string().min(1),
  groupId: z.string().min(1),
  status: z.enum(["online", "warning", "alarm", "offline"]),
});

export async function GET(req: Request) {
  if (!(await requireAccess("read"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get("storeId");
  const groupId = searchParams.get("groupId");
  const machines =
    storeId && groupId
      ? await listMachinesByGroup(storeId, groupId)
      : storeId
        ? await listMachinesByStore(storeId)
        : await listMachines();
  return NextResponse.json({ machines });
}

export async function POST(req: Request) {
  if (!(await requireAccess("store.manage"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = createSchema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const { name, deviceId, storeId, groupId, status } = body.data;
  const now = Date.now();
  const machine = await createMachine({
    name,
    deviceId,
    storeId,
    groupId,
    status,
    current: status === "alarm" ? 11.5 : status === "warning" ? 9 : 3,
    door: "closed",
    doorOpenSince: null,
    heartbeatAt: now,
    rssi: -50,
    firmware: "v2.5.0",
    restartCount: 0,
    lastUpdate: now,
    currentHistory: [{ t: now, value: 3 }],
  });
  return NextResponse.json({ machine });
}
