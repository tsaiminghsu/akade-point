import { NextResponse } from "next/server";
import { getGameSession } from "@/lib/dynamo/sessions";
import { verifyCommitment } from "@/lib/game/provably-fair";
import { requireSession } from "@/lib/session";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const session = await getGameSession(params.id);
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (session.userId !== user.id)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (session.status !== "COMPLETED")
    return NextResponse.json({ error: "Game not completed yet" }, { status: 400 });

  const isValid = verifyCommitment(session.serverSeed, session.serverSeedHash);

  return NextResponse.json({
    serverSeed: session.serverSeed,
    serverSeedHash: session.serverSeedHash,
    clientSeed: session.clientSeed ?? null,
    nonce: session.nonce,
    finalSeed: session.finalSeed,
    initialGrid: JSON.parse(session.initialGrid!),
    isValid,
    instructions:
      "驗證方法: SHA256(serverSeed) 應等於 serverSeedHash。最終局面由 SHA256(serverSeed|clientSeed|nonce) 決定。",
  });
}
