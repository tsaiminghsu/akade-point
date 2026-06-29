import { getServerSession } from "next-auth";
import { authOptions } from "./auth";

export async function requireSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  const userId = (session.user as { id?: string }).id;
  return userId ? { ...session.user, id: userId } : null;
}
