"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Search, UserMinus, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Role, StoreRole } from "@/lib/control-center/access";

interface Member {
  userId: string;
  name: string | null;
  email: string | null;
  storeRole: StoreRole | null;
  globalRole: Role | null;
  self: boolean;
  editable: boolean;
}

interface Found {
  userId: string;
  name: string | null;
  email: string | null;
}

/**
 * A store's team, for that store's admins: who has a role here, change or
 * remove the roles of people below you, add someone by e-mail or user id.
 * The API decides what is allowed (canAssignStoreRole); rows it would refuse
 * are read-only here.
 */
export function StoreMembersDialog({ storeId, storeName, open, onOpenChange }: { storeId: string; storeName: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useTranslations("StoreMembers");
  const tRole = useTranslations("Roles");
  const [members, setMembers] = useState<Member[] | null>(null);
  const [grantable, setGrantable] = useState<StoreRole[]>([]);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Found | null>(null);
  const [newRole, setNewRole] = useState<StoreRole>("viewer");
  const [busy, setBusy] = useState(false);

  const base = `/api/control-center/stores/${encodeURIComponent(storeId)}/members`;

  const load = useCallback(async () => {
    const res = await fetch(base).catch(() => null);
    if (!res?.ok) {
      toast.error(t("loadFailed"));
      return;
    }
    const body = (await res.json()) as { members: Member[]; grantable: StoreRole[] };
    setMembers(body.members);
    setGrantable(body.grantable);
    if (body.grantable.length && !body.grantable.includes(newRole)) setNewRole(body.grantable[0]);
  }, [base, t, newRole]);

  useEffect(() => {
    if (!open) return;
    setMembers(null);
    setFound(null);
    setQuery("");
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload per opening, not per role pick
  }, [open, storeId]);

  async function assign(userId: string, role: StoreRole | null) {
    setBusy(true);
    const res = await fetch(`${base}/${encodeURIComponent(userId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as { code?: string } | null;
      toast.error(body?.code === "SELF" ? tRole("cannotChangeSelf") : body?.code === "RANK" ? t("notAllowed") : t("saveFailed"));
      return false;
    }
    toast.success(role ? t("saved") : t("removed"));
    await load();
    return true;
  }

  async function lookup() {
    setBusy(true);
    setFound(null);
    const res = await fetch(`${base}/lookup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      toast.error(res?.status === 404 ? t("notFound") : t("lookupFailed"));
      return;
    }
    setFound(((await res.json()) as { user: Found }).user);
  }

  const who = (m: { name: string | null; email: string | null; userId: string }) => m.name || m.email || m.userId;
  const already = found && members?.find((m) => m.userId === found.userId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("title", { store: storeName })}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <div className="max-h-[45vh] space-y-1 overflow-y-auto pr-1">
          {members === null && <p className="text-sm text-muted-foreground">{t("loading")}</p>}
          {members?.length === 0 && <p className="text-sm text-muted-foreground">{t("empty")}</p>}
          {members?.map((m) => (
            <div key={m.userId} className="flex items-center gap-2 rounded-md px-1 py-1.5 hover:bg-muted/30">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">
                  {who(m)}
                  {m.self && <span className="ml-1.5 text-[11px] text-muted-foreground">{t("you")}</span>}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {m.email && m.name ? `${m.email} · ` : ""}
                  {m.globalRole ? t("globalRole", { role: tRole(m.globalRole) }) : t("storeOnly")}
                </p>
              </div>
              {m.storeRole || m.editable ? (
                <Select
                  value={m.storeRole ?? ""}
                  disabled={!m.editable || busy}
                  onValueChange={(v) => void assign(m.userId, v as StoreRole)}
                >
                  <SelectTrigger className="h-8 w-36 text-xs" aria-label={t("roleOf", { name: who(m) })}>
                    <SelectValue placeholder={t("noStoreRole")} />
                  </SelectTrigger>
                  <SelectContent>
                    {(m.editable ? grantable : m.storeRole ? [m.storeRole] : []).map((r) => (
                      <SelectItem key={r} value={r} className="text-xs">
                        {tRole(r)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <span className="w-36 text-right text-[11px] text-muted-foreground">{t("viaGlobal")}</span>
              )}
              <Button
                size="icon-sm"
                variant="ghost"
                className="text-status-alarm"
                disabled={!m.editable || !m.storeRole || busy}
                onClick={() => void assign(m.userId, null)}
                aria-label={t("remove", { name: who(m) })}
              >
                <UserMinus className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>

        {grantable.length > 0 && (
          <div className="space-y-2 border-t border-border pt-3">
            <p className="text-xs font-medium">{t("addTitle")}</p>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (query.trim().length >= 3) void lookup();
              }}
            >
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("addPlaceholder")} className="h-8 text-xs" />
              <Button type="submit" size="sm" variant="outline" className="h-8 gap-1.5" disabled={busy || query.trim().length < 3}>
                <Search className="h-3.5 w-3.5" /> {t("find")}
              </Button>
            </form>
            {found && (
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-border/60 p-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{who(found)}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{found.email ?? found.userId}</p>
                </div>
                {already ? (
                  <span className="text-[11px] text-muted-foreground">{t("alreadyMember")}</span>
                ) : (
                  <>
                    <Select value={newRole} onValueChange={(v) => setNewRole(v as StoreRole)}>
                      <SelectTrigger className="h-8 w-32 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {grantable.map((r) => (
                          <SelectItem key={r} value={r} className="text-xs">
                            {tRole(r)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      className="h-8 gap-1.5"
                      disabled={busy}
                      onClick={() => void assign(found.userId, newRole).then((ok) => ok && (setFound(null), setQuery("")))}
                    >
                      <UserPlus className="h-3.5 w-3.5" /> {t("add")}
                    </Button>
                  </>
                )}
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">{t("addHint")}</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
