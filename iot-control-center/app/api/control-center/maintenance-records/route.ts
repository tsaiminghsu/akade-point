import { NextResponse } from "next/server";
import { z } from "zod";
import { canAt, requireAccessAt, requireAnyAccess, storeFilter } from "@/lib/access-server";
import { getMachine, listMachines } from "@/lib/dynamo/cc-machines";
import { createMaintenanceRecord, listMaintenanceByMachine, listMaintenanceRecords } from "@/lib/dynamo/cc-maintenance-records";

const createSchema = z.object({
  machineId: z.string().min(1),
  date: z.number().optional(),
  description: z.string().min(1),
  technician: z.string().min(1),
});

export async function GET(req: Request) {
  const actor = await requireAnyAccess("read");
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { searchParams } = new URL(req.url);
  const machineId = searchParams.get("machineId");
  if (machineId) {
    if (!canAt(actor, "read", (await getMachine(machineId))?.storeId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    return NextResponse.json({ records: await listMaintenanceByMachine(machineId) });
  }
  const [records, machines] = await Promise.all([listMaintenanceRecords(), listMachines()]);
  const allowed = storeFilter(actor, "read");
  const storeOf = new Map(machines.map((m) => [m.id, m.storeId]));
  return NextResponse.json({ records: records.filter((r) => allowed(storeOf.get(r.machineId))) });
}

export async function POST(req: Request) {
  const body = createSchema.safeParse(await req.json().catch(() => null));
  const machine = body.success ? await getMachine(body.data.machineId) : null;
  if (!(await requireAccessAt("maintenance.write", machine?.storeId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { date, ...rest } = body.data;
  const record = await createMaintenanceRecord({ ...rest, date: date ?? Date.now() });
  return NextResponse.json({ record });
}
