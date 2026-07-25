import type { Metadata } from "next";
import { Coins, Ticket, Users, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/control-center/shared/EmptyState";
import { ErrorState } from "@/components/control-center/shared/ErrorState";
import { KPICard } from "@/components/control-center/shared/KPICard";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { User } from "@/lib/dynamo/users";

export const metadata: Metadata = { title: "Users" };

async function getUsersData(): Promise<{ users: User[]; error: string | null }> {
  try {
    const { listUsers } = await import("@/lib/dynamo/users");
    const users = await listUsers();
    return { users, error: null };
  } catch (error) {
    console.error("Failed to load control center users:", error);
    return {
      users: [],
      error: "無法載入使用者資料，請稍後再試。",
    };
  }
}

function formatDate(value?: string | number | Date) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getDisplayName(user: User) {
  return user.displayName?.trim() || "匿名使用者";
}

function getSubtitle(user: User) {
  return user.email?.trim() || user.userId;
}

function getInitials(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "U";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

export default async function UsersPage() {
  const { users, error } = await getUsersData();
  const sortedUsers = [...users].sort((a, b) => (b.totalPoints ?? 0) - (a.totalPoints ?? 0));
  const adminCount = sortedUsers.filter((user) => user.isAdmin).length;
  const totalPoints = sortedUsers.reduce((sum, user) => sum + (user.totalPoints ?? 0), 0);
  const totalTickets = sortedUsers.reduce((sum, user) => sum + (user.ticketCount ?? 0), 0);
  const latestUpdate =
    sortedUsers.length > 0
      ? sortedUsers.reduce((latest, user) => {
          const updatedAt = Date.parse(user.updatedAt);
          return Number.isFinite(updatedAt) && updatedAt > latest ? updatedAt : latest;
        }, 0)
      : null;

  return (
    <div className="h-full overflow-y-auto custom-scrollbar p-4 sm:p-6">
      <div className="mb-6 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <Users className="h-5 w-5 text-primary" /> Users & Permissions
            </h1>
            <p className="text-sm text-muted-foreground">View all account records and current permission state</p>
          </div>
          <div className="rounded-full border border-border/70 bg-muted/30 px-3 py-1 text-xs text-muted-foreground">
            {sortedUsers.length} accounts
          </div>
        </div>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KPICard
          label="Total Users"
          value={sortedUsers.length}
          icon={Users}
          sub="All registered accounts"
          accent="primary"
        />
        <KPICard
          label="Administrators"
          value={adminCount}
          icon={ShieldCheck}
          sub="Users with elevated access"
          accent="online"
        />
        <KPICard
          label="Total Points"
          value={totalPoints.toLocaleString("zh-TW")}
          icon={Coins}
          sub="Combined reward balance"
          accent="warning"
        />
        <KPICard
          label="Total Tickets"
          value={totalTickets.toLocaleString("zh-TW")}
          icon={Ticket}
          sub={latestUpdate ? `Updated ${formatDate(latestUpdate)}` : "No activity yet"}
          accent="muted"
        />
      </div>

      {error ? (
        <ErrorState title="Users page unavailable" description={error} className="min-h-[360px]" />
      ) : sortedUsers.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No users yet"
          description="Users will appear here once accounts are created or synced from the backend."
          className="min-h-[360px]"
        />
      ) : (
        <div className="rounded-2xl border border-border/70 bg-card/70 backdrop-blur-sm">
          <div className="border-b border-border/70 px-4 py-3">
            <p className="text-sm font-medium text-foreground">User Directory</p>
            <p className="text-xs text-muted-foreground">Sorted by total points in descending order</p>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead className="text-right">Points</TableHead>
                <TableHead className="text-right">Tickets</TableHead>
                <TableHead className="text-right">Role</TableHead>
                <TableHead className="text-right">Joined</TableHead>
                <TableHead className="text-right">Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedUsers.map((user) => {
                const displayName = getDisplayName(user);
                return (
                  <TableRow key={user.userId}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                          {getInitials(displayName)}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-foreground">{displayName}</p>
                          <p className="truncate text-xs text-muted-foreground">{getSubtitle(user)}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums text-foreground">
                      {(user.totalPoints ?? 0).toLocaleString("zh-TW")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {(user.ticketCount ?? 0).toLocaleString("zh-TW")}
                    </TableCell>
                    <TableCell className="text-right">
                      {user.isAdmin ? (
                        <Badge variant="default" className="bg-status-online text-white hover:bg-status-online/90">
                          Admin
                        </Badge>
                      ) : (
                        <Badge variant="secondary">User</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">{formatDate(user.createdAt)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{formatDate(user.updatedAt)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
