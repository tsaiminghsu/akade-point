import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUser } from "@/lib/dynamo/users";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const userId = (session.user as { id: string }).id;
  const user = await getUser(userId);
  if (!user?.isAdmin) redirect("/");

  return (
    <div className="max-w-4xl mx-auto">
      <nav className="bg-black/30 border-b border-white/10 px-4 py-3 flex items-center gap-4">
        <span className="text-amber-400 font-bold">Admin</span>
        {[
          { href: "/admin", label: "統計" },
          { href: "/admin/cards", label: "卡片" },
          { href: "/admin/shops", label: "店家" },
          { href: "/admin/users", label: "用戶" },
          { href: "/admin/knowledge-base", label: "知識庫" },
          { href: "/admin/questionnaire-maintenance", label: "問卷維護" },
          { href: "/admin/line-auth-settings", label: "LINE 設定" },
        ].map(({ href, label }) => (
          <Link key={href} href={href} className="text-sm text-zinc-400 hover:text-white">
            {label}
          </Link>
        ))}
      </nav>
      <div className="p-4">{children}</div>
    </div>
  );
}
