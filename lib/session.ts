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

/**
 * Same as requireAdmin(), but short-circuits to a fake admin outside of
 * production so a local dev machine doesn't need a LINE login plus a manual
 * isAdmin grant on the shared akade-users table just to open the app.
 * Production always runs the real check.
 */
export async function requireAdminOrDevBypass() {
  if (process.env.NODE_ENV !== "production") {
    return { id: "dev-admin", name: "Dev Admin" };
  }
  return requireAdmin();
}
