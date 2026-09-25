"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatusDot } from "@/components/control-center/shared/StatusDot";
import type { ClawConfigPart, ClawDraft } from "@/lib/control-center/claw/config";
import { MAX_COPY_TARGETS } from "@/lib/control-center/claw/schemas";
import type { Machine } from "@/lib/control-center/types";
import { useClawConfigsStore } from "@/store/useClawConfigsStore";
import { useMachinesStore } from "@/store/useMachinesStore";

interface CopyConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: Machine;
  /** The source machine's saved config (the page only allows copying once it's saved). */
  draft: ClawDraft;
}

/** Push one machine's saved config to others, grouped by store. */
export function CopyConfigDialog({ open, onOpenChange, source, draft }: CopyConfigDialogProps) {
  const t = useTranslations("ClawConfigs");
  const tCommon = useTranslations("Common");
  const machines = useMachinesStore((s) => s.machines);
  const stores = useMachinesStore((s) => s.stores);

  const [parts, setParts] = useState<Set<ClawConfigPart>>(() => new Set(["settings"]));
  const [targets, setTargets] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);

  // Start clean each time it opens.
  useEffect(() => {
    if (!open) return;
    setParts(new Set(["settings"]));
    setTargets(new Set());
  }, [open]);

  const groups = useMemo(() => {
    const others = machines.filter((m) => m.id !== source.id);
    // The source machine's store first: that's where a copy usually goes.
    const ordered = [...stores].sort((a, b) => Number(b.id === source.storeId) - Number(a.id === source.storeId));
    return ordered
      .map((store) => ({ store, machines: others.filter((m) => m.storeId === store.id) }))
      .filter((g) => g.machines.length > 0);
  }, [machines, stores, source]);

  const toggle = <T,>(set: Set<T>, value: T, on: boolean) => {
    const next = new Set(set);
    if (on) next.add(value);
    else next.delete(value);
    return next;
  };

  const setGroup = (ids: string[], on: boolean) => {
    setTargets((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };

  const tooMany = targets.size > MAX_COPY_TARGETS;
  const canApply = parts.size > 0 && targets.size > 0 && !tooMany && !busy;

  const apply = async () => {
    setBusy(true);
    const res = await useClawConfigsStore
      .getState()
      .copyTo(draft, Array.from(parts), Array.from(targets), source.id);
    setBusy(false);
    if (!res) return;
    const copied = t("copied", { count: res.copied });
    toast.success(res.notify?.sent ? `${copied} · ${t("notifiedToast")}` : copied);
    if (res.missing > 0) toast.warning(t("copiedMissing", { count: res.missing }));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("copyTitle")}</DialogTitle>
          <DialogDescription>{t("copyDescription", { name: source.name })}</DialogDescription>
        </DialogHeader>

        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium text-foreground">{t("partsLabel")}</legend>
          {(["settings", "rig"] as const).map((part) => (
            <label key={part} className="flex items-start gap-2 text-sm">
              <Checkbox
                checked={parts.has(part)}
                onCheckedChange={(v) => setParts((p) => toggle(p, part, v === true))}
                className="mt-0.5"
              />
              <span>{part === "settings" ? t("partSettings") : t("partRig")}</span>
            </label>
          ))}
        </fieldset>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="mb-1 flex items-center justify-between">
            <p className="text-sm font-medium text-foreground">{t("targetsLabel", { count: targets.size })}</p>
            <Button variant="ghost" size="sm" onClick={() => setTargets(new Set())} disabled={targets.size === 0}>
              {t("clearAll")}
            </Button>
          </div>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto rounded-md border border-border p-2">
            {groups.length === 0 && <p className="p-2 text-sm text-muted-foreground">{t("noOtherMachines")}</p>}
            {groups.map(({ store, machines: list }) => {
              const ids = list.map((m) => m.id);
              const all = ids.every((id) => targets.has(id));
              return (
                <div key={store.id}>
                  <label className="flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <Checkbox checked={all} onCheckedChange={(v) => setGroup(ids, v === true)} />
                    {store.name}
                    <span className="font-normal normal-case">({list.length})</span>
                  </label>
                  <ul className="mt-1 grid gap-0.5 sm:grid-cols-2">
                    {list.map((m) => (
                      <li key={m.id}>
                        <label className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted/60">
                          <Checkbox
                            checked={targets.has(m.id)}
                            onCheckedChange={(v) => setTargets((prev) => toggle(prev, m.id, v === true))}
                          />
                          <StatusDot status={m.status} animate={false} />
                          <span className="truncate">{m.name}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
          <p className={tooMany ? "mt-2 text-xs text-destructive" : "mt-2 text-xs text-muted-foreground"}>
            {tooMany ? t("copyTooMany", { max: MAX_COPY_TARGETS }) : t("copyWarning")}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {tCommon("cancel")}
          </Button>
          <Button onClick={() => void apply()} disabled={!canApply}>
            {t("copyConfirm", { count: targets.size })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
