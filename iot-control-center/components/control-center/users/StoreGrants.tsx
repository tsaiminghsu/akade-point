"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Store as StoreIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { STORE_ROLES, type StoreRole } from "@/lib/control-center/access";

const NONE = "__none";

/**
 * A user's per-store roles (system-admins only): at each store the higher of
 * the global role and the store's role counts, so a global viewer can run one
 * shop. system-admin is global only.
 */
export function StoreGrants({
  userId,
  stores,
  grants,
  self,
}: {
  userId: string;
  stores: { id: string; name: string }[];
  grants: Record<string, StoreRole>;
  self: boolean;
}) {
  const t = useTranslations("Roles");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, StoreRole>>(grants);
  const [busy, setBusy] = useState(false);
  const count = Object.keys(grants).length;
  // Grants for stores that were deleted since still count here until saved away.
  const names = new Map(stores.map((s) => [s.id, s.name]));

  async function save() {
    setBusy(true);
    const res = await fetch(`/api/control-center/users/${encodeURIComponent(userId)}/role`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stores: Object.fromEntries(Object.entries(draft).filter(([id]) => names.has(id))) }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as { code?: string } | null;
      toast.error(body?.code === "SELF" ? t("cannotChangeSelf") : t("saveFailed"));
      return;
    }
    toast.success(t("saved"));
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-8 gap-1.5 text-xs"
        disabled={self}
        title={self ? t("cannotChangeSelf") : undefined}
        onClick={() => {
          setDraft(grants);
          setOpen(true);
        }}
      >
        <StoreIcon className="h-3.5 w-3.5" />
        {count ? t("storeGrantsCount", { count }) : t("storeGrantsNone")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("storeGrantsTitle")}</DialogTitle>
            <DialogDescription>{t("storeGrantsDescription")}</DialogDescription>
          </DialogHeader>
          <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
            {stores.length === 0 && <p className="text-sm text-muted-foreground">{t("storeGrantsNoStores")}</p>}
            {stores.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3">
                <span className="truncate text-sm">{s.name}</span>
                <Select
                  value={draft[s.id] ?? NONE}
                  onValueChange={(v) =>
                    setDraft((d) => {
                      const next = { ...d };
                      if (v === NONE) delete next[s.id];
                      else next[s.id] = v as StoreRole;
                      return next;
                    })
                  }
                >
                  <SelectTrigger className="min-h-8 w-40 text-xs h-auto py-1 text-left [&>span]:line-clamp-none" aria-label={t("storeRoleAt", { store: s.name })}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE} className="text-xs">
                      {t("storeGrantNone")}
                    </SelectItem>
                    {STORE_ROLES.map((r) => (
                      <SelectItem key={r} value={r} className="text-xs">
                        {t(r)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t("cancel")}
            </Button>
            <Button disabled={busy} onClick={() => void save()}>
              {t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
