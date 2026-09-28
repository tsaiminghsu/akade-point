import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAccess } from "@/lib/access-server";
import { issueMachineToken } from "@/lib/machine-auth";
import { getMachine } from "@/lib/dynamo/cc-machines";
import { listTokensByMachine, revokeAllForMachine } from "@/lib/dynamo/cc-machine-tokens";

type Ctx = { params: { id: string } };

const issueSchema = z.object({ label: z.string().trim().max(60).optional() });

/** The machine's board tokens, without hashes, newest first. */
export async function GET(_req: Request, { params }: Ctx) {
  if (!(await requireAccess("read"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const tokens = await listTokensByMachine(params.id);
  return NextResponse.json({
    tokens: tokens
      .map(({ tokenId, label, createdAt, revokedAt }) => ({ tokenId, label, createdAt, revokedAt: revokedAt ?? null }))
      .sort((a, b) => b.createdAt - a.createdAt),
  });
}

/** Issue a board token (the plaintext is in this response only) and revoke the previous ones. */
export async function POST(req: Request, { params }: Ctx) {
  if (!(await requireAccess("token.manage"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = issueSchema.safeParse((await req.json().catch(() => null)) ?? {});
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const machine = await getMachine(params.id);
  if (!machine) return NextResponse.json({ error: "Machine not found" }, { status: 404 });
  return NextResponse.json(await issueMachineToken(machine.id, body.data.label || "ESP32"));
}

/** Disconnect the board: revoke every token. */
export async function DELETE(_req: Request, { params }: Ctx) {
  if (!(await requireAccess("token.manage"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const revoked = await revokeAllForMachine(params.id);
  return NextResponse.json({ ok: true, revoked });
}
