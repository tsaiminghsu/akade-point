import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAccess } from "@/lib/access-server";
import { createMaintenanceRecord, listMaintenanceByMachine, listMaintenanceRecords } from "@/lib/dynamo/cc-maintenance-records";

const createSchema = z.object({
  machineId: z.string().min(1),
  date: z.number().optional(),
  description: z.string().min(1),
  technician: z.string().min(1),
});

export async function GET(req: Request) {
  if (!(await requireAccess("read"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { searchParams } = new URL(req.url);
  const machineId = searchParams.get("machineId");
  const records = machineId ? await listMaintenanceByMachine(machineId) : await listMaintenanceRecords();
  return NextResponse.json({ records });
}

export async function POST(req: Request) {
  if (!(await requireAccess("maintenance.write"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = createSchema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { date, ...rest } = body.data;
  const record = await createMaintenanceRecord({ ...rest, date: date ?? Date.now() });
  return NextResponse.json({ record });
}
