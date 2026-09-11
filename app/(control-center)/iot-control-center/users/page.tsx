import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Coins, Ticket, Users, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/control-center/shared/EmptyState";
import { ErrorState } from "@/components/control-center/shared/ErrorState";
import { KPICard } from "@/components/control-center/shared/KPICard";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { User } from "@/lib/dynamo/users";

export const metadata: Metadata = { title: "Users" };

async function getUsersData(loadError: string): Promise<{ users: User[]; error: string | null }> {
  try {
    const { listUsers } = await import("@/lib/dynamo/users");
    const users = await listUsers();
    return { users, error: null };
  } catch (error) {
    console.error("Failed to load control center users:", error);
    return {
      users: [],
      error: loadError,
    };
  }
}

function formatDate(value: string | number | Date | undefined, locale: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getDisplayName(user: User, anonymousUser: string) {
  return user.displayName?.trim() || anonymousUser;
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
  const t = await getTranslations("UsersPage");
  const locale = await getLocale();
  const { users, error } = await getUsersData(t("loadError"));
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
              <Users className="h-5 w-5 text-primary" /> {t("title")}
            </h1>
            <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
          </div>
          <div className="rounded-full border border-border/70 bg-muted/30 px-3 py-1 text-xs text-muted-foreground">
            {sortedUsers.length} {t("accountsSuffix")}
          </div>
        </div>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KPICard
          label={t("totalUsers")}
          value={sortedUsers.length}
          icon={Users}
          sub={t("totalUsersSub")}
          accent="primary"
        />
        <KPICard
          label={t("administrators")}
          value={adminCount}
          icon={ShieldCheck}
          sub={t("administratorsSub")}
          accent="online"
        />
        <KPICard
          label={t("totalPoints")}
          value={totalPoints.toLocaleString(locale)}
          icon={Coins}
          sub={t("totalPointsSub")}
          accent="warning"
        />
        <KPICard
          label={t("totalTickets")}
          value={totalTickets.toLocaleString(locale)}
          icon={Ticket}
          sub={latestUpdate ? t("updatedAt", { date: formatDate(latestUpdate, locale) }) : t("noActivityYet")}
          accent="muted"
        />
      </div>

      {error ? (
        <ErrorState title={t("unavailableTitle")} description={error} className="min-h-[360px]" />
      ) : sortedUsers.length === 0 ? (
        <EmptyState
          icon={Users}
          title={t("emptyTitle")}
          description={t("emptyDescription")}
          className="min-h-[360px]"
        />
      ) : (
        <div className="rounded-2xl border border-border/70 bg-card/70 backdrop-blur-sm">
          <div className="border-b border-border/70 px-4 py-3">
            <p className="text-sm font-medium text-foreground">{t("directoryTitle")}</p>
            <p className="text-xs text-muted-foreground">{t("directorySubtitle")}</p>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("user")}</TableHead>
                <TableHead className="text-right">{t("points")}</TableHead>
                <TableHead className="text-right">{t("tickets")}</TableHead>
                <TableHead className="text-right">{t("role")}</TableHead>
                <TableHead className="text-right">{t("joined")}</TableHead>
                <TableHead className="text-right">{t("updated")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedUsers.map((user) => {
                const displayName = getDisplayName(user, t("anonymousUser"));
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
                      {(user.totalPoints ?? 0).toLocaleString(locale)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {(user.ticketCount ?? 0).toLocaleString(locale)}
                    </TableCell>
                    <TableCell className="text-right">
                      {user.isAdmin ? (
                        <Badge variant="default" className="bg-status-online text-white hover:bg-status-online/90">
                          {t("admin")}
                        </Badge>
                      ) : (
                        <Badge variant="secondary">{t("regularUser")}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">{formatDate(user.createdAt, locale)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{formatDate(user.updatedAt, locale)}</TableCell>
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
