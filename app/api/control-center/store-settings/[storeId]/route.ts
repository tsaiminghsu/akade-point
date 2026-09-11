import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminOrDevBypass } from "@/lib/session";
import { getStoreSettings, updateStoreSettings } from "@/lib/dynamo/cc-store-settings";

const patchSchema = z.object({
  gridSize: z.number().optional(),
  snapEnabled: z.boolean().optional(),
  gridVisible: z.boolean().optional(),
  animationEnabled: z.boolean().optional(),

  toastAlerts: z.boolean().optional(),
  emailDigest: z.boolean().optional(),
  criticalOnly: z.boolean().optional(),
  sound: z.boolean().optional(),

  mqttBroker: z.string().optional(),
  mqttTopic: z.string().optional(),
  mqttClientId: z.string().optional(),

  apiEndpoint: z.string().optional(),
  apiKey: z.string().optional(),

  defaultWidgetSize: z.enum(["small", "medium", "large"]).optional(),
  defaultMode: z.enum(["edit", "live"]).optional(),
})
  // Every field is optional, so guard against `{}`: an empty patch would
  // otherwise reach DynamoDB as an empty SET expression and fail with a 500.
  .refine((patch) => Object.values(patch).some((v) => v !== undefined), {
    message: "At least one field is required",
  });

export async function GET(_req: Request, { params }: { params: { storeId: string } }) {
  if (!(await requireAdminOrDevBypass())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const settings = await getStoreSettings(params.storeId);
  return NextResponse.json({ settings });
}

export async function PATCH(req: Request, { params }: { params: { storeId: string } }) {
  if (!(await requireAdminOrDevBypass())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = patchSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  await updateStoreSettings(params.storeId, body.data);
  const settings = await getStoreSettings(params.storeId);
  return NextResponse.json({ settings });
}
