import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Coins, Ticket, Users, ShieldCheck } from "lucide-react";

import { EmptyState } from "@/components/control-center/shared/EmptyState";
import { ErrorState } from "@/components/control-center/shared/ErrorState";
import { KPICard } from "@/components/control-center/shared/KPICard";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { User } from "@/lib/dynamo/users";
import { RoleSelect } from "@/components/control-center/users/RoleSelect";
import { currentActor } from "@/lib/access-server";
import { allows, cleanStoreRoles, effectiveRole, type Role } from "@/lib/control-center/access";
import type { RoleRecord } from "@/lib/dynamo/cc-roles";
import { StoreGrants } from "@/components/control-center/users/StoreGrants";

export const metadata: Metadata = { title: "Users" };

async function getUsersData(
  loadError: string
): Promise<{ users: User[]; roles: Map<string, RoleRecord>; stores: { id: string; name: string }[]; error: string | null }> {
  try {
    const [{ listUsers }, { listRoles }, { listStores }] = await Promise.all([
      import("@/lib/dynamo/users"),
      import("@/lib/dynamo/cc-roles"),
      import("@/lib/dynamo/cc-stores"),
    ]);
    const [users, roles, stores] = await Promise.all([listUsers(), listRoles(), listStores()]);
    return {
      users,
      roles: new Map(roles.map((r) => [r.userId, r])),
      stores: stores.map((s) => ({ id: s.id, name: s.name })).sort((a, b) => a.name.localeCompare(b.name)),
      error: null,
    };
  } catch (error) {
    console.error("Failed to load control center users:", error);
    return {
      users: [],
      roles: new Map(),
      stores: [],
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
  const actor = await currentActor();
  // Users and their roles are for system-admins only (the nav hides the link;
  // this guards the page itself).
  if (!actor || !allows(actor.role, "users.manage")) {
    return <ErrorState title={t("forbiddenTitle")} description={t("forbiddenDescription")} className="m-6 min-h-[360px]" />;
  }
  const { users, roles, stores, error } = await getUsersData(t("loadError"));
  const sortedUsers = [...users].sort((a, b) => (b.totalPoints ?? 0) - (a.totalPoints ?? 0));
  const roleOf = (user: User): Role | null => effectiveRole(roles.get(user.userId)?.role, user.isAdmin);
  const storeGrantsOf = (user: User) => cleanStoreRoles(roles.get(user.userId)?.stores);
  const adminCount = sortedUsers.filter((user) => roleOf(user) !== null || Object.keys(storeGrantsOf(user)).length > 0).length;
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
                <TableHead className="text-right">{t("storeRoles")}</TableHead>
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
                      <RoleSelect userId={user.userId} role={roles.get(user.userId)?.role ?? null} isAdmin={user.isAdmin} self={user.userId === actor.id} />
                    </TableCell>
                    <TableCell className="text-right">
                      <StoreGrants userId={user.userId} stores={stores} grants={storeGrantsOf(user)} self={user.userId === actor.id} />
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
