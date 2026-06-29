import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { BottomNav } from "@/components/layout/bottom-nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  const isDev = process.env.NODE_ENV === "development";
  if (!session && !isDev) redirect("/login");

  return (
    <div className="max-w-lg mx-auto min-h-screen pb-20">
      {children}
      <BottomNav />
    </div>
  );
}
