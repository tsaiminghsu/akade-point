"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ROLES, type Role } from "@/lib/control-center/access";

const NONE = "__none";

/**
 * A user's Control Center role (system-admins only). "None" removes the
 * explicit role; users with akade-users.isAdmin then fall back to
 * system-admin, everyone else has no access.
 */
export function RoleSelect({ userId, role, isAdmin, self }: { userId: string; role: Role | null; isAdmin: boolean; self: boolean }) {
  const t = useTranslations("Roles");
  const router = useRouter();
  const [value, setValue] = useState<string>(role ?? NONE);
  const [busy, setBusy] = useState(false);

  async function change(next: string) {
    const prev = value;
    setValue(next);
    setBusy(true);
    const res = await fetch(`/api/control-center/users/${encodeURIComponent(userId)}/role`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: next === NONE ? null : next }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setValue(prev);
      const body = (await res?.json().catch(() => null)) as { code?: string } | null;
      toast.error(body?.code === "SELF" ? t("cannotChangeSelf") : t("saveFailed"));
      return;
    }
    toast.success(t("saved"));
    router.refresh();
  }

  return (
    <Select value={value} onValueChange={(v) => void change(v)} disabled={busy || self}>
      <SelectTrigger className="ml-auto h-8 w-44 text-xs" aria-label={t("label")} title={self ? t("cannotChangeSelf") : undefined}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE} className="text-xs">
          {isAdmin ? t("fromIsAdmin") : t("none")}
        </SelectItem>
        {ROLES.map((r) => (
          <SelectItem key={r} value={r} className="text-xs">
            {t(r)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
