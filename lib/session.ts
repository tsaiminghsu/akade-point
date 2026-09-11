import { getServerSession } from "next-auth";
import { authOptions } from "./auth";
import { getUser } from "./dynamo/users";

export async function requireSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  const userId = (session.user as { id?: string }).id;
  return userId ? { ...session.user, id: userId } : null;
}

export async function requireAdmin() {
  const authUser = await requireSession();
  if (!authUser) return null;
  const profile = await getUser(authUser.id);
  if (!profile?.isAdmin) return null;
  return authUser;
}
