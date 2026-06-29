import { NextResponse } from "next/server";
import { z } from "zod";
import { getGameSession, startGameSession } from "@/lib/dynamo/sessions";
import { buildFinalSeed } from "@/lib/game/provably-fair";
import { generateGrid } from "@/lib/game/orb-generator";
import { requireSession } from "@/lib/session";

const schema = z.object({ clientSeed: z.string().optional() });

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const session = await getGameSession(params.id);
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (session.userId !== user.id)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (session.status !== "PENDING")
    return NextResponse.json({ error: "Game already started" }, { status: 400 });

  const body = schema.safeParse(await req.json().catch(() => ({})));
  const clientSeed = body.success ? (body.data.clientSeed ?? "") : "";

  const finalSeed = buildFinalSeed(session.serverSeed, clientSeed, session.nonce);
  const grid = generateGrid(finalSeed);
  const initialGrid = JSON.stringify(grid);

  await startGameSession(params.id, clientSeed, finalSeed, initialGrid);

  return NextResponse.json({
    sessionId: params.id,
    serverSeedHash: session.serverSeedHash,
    clientSeed,
    initialGrid: grid,
    timeLimit: 60,
  });
}
