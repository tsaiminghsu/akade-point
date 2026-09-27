"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check, History, Pencil, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/control-center/shared/ConfirmDialog";
import { useControlCenterStore } from "@/store/useControlCenterStore";
import { useMachinesStore } from "@/store/useMachinesStore";
import { useLayoutVersionsStore, type LayoutVersion } from "@/store/useLayoutVersionsStore";

function relativeTime(ts: number, t: ReturnType<typeof useTranslations>, locale: string): string {
  const diffMs = Date.now() - ts;
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return t("justNow");
  if (mins < 60) return t("minutesAgo", { mins });
  const hours = Math.round(mins / 60);
  if (hours < 24) return t("hoursAgo", { hours });
  return new Date(ts).toLocaleDateString(locale, { month: "2-digit", day: "2-digit" });
}

interface NameDialogState {
  mode: "rename" | "create";
  version?: LayoutVersion;
}

const EMPTY_VERSIONS: LayoutVersion[] = [];

export function LayoutVersionsMenu() {
  const t = useTranslations("LayoutVersionsMenu");
  const tCommon = useTranslations("Common");
  const locale = useLocale();
  const activeStoreId = useMachinesStore((s) => s.activeStoreId);
  const isDirty = useControlCenterStore((s) => s.isDirty);
  const loadWidgets = useControlCenterStore((s) => s.loadWidgets);
  const markSaved = useControlCenterStore((s) => s.markSaved);

  const versions = useLayoutVersionsStore((s) => s.versionsByStore[activeStoreId] ?? EMPTY_VERSIONS);
  const activeVersionId = useLayoutVersionsStore((s) => s.activeVersionIdByStore[activeStoreId]);
  const saveAsNewVersion = useLayoutVersionsStore((s) => s.saveAsNewVersion);
  const renameVersion = useLayoutVersionsStore((s) => s.renameVersion);
  const deleteVersion = useLayoutVersionsStore((s) => s.deleteVersion);

  const [open, setOpen] = useState(false);
  const [switchTarget, setSwitchTarget] = useState<LayoutVersion | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LayoutVersion | null>(null);
  const [nameDialog, setNameDialog] = useState<NameDialogState | null>(null);
  const [nameValue, setNameValue] = useState("");

  const sorted = [...versions].sort((a, b) => b.savedAt - a.savedAt);

  async function applySwitch(version: LayoutVersion) {
    loadWidgets(version.widgets);
    await useLayoutVersionsStore.getState().setActiveVersion(activeStoreId, version.id);
    setOpen(false);
  }

  function handleRowClick(version: LayoutVersion) {
    if (version.id === activeVersionId) return;
    if (isDirty) {
      setSwitchTarget(version);
    } else {
      applySwitch(version);
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    const wasActive = deleteTarget.id === activeVersionId;
    const ok = await deleteVersion(activeStoreId, deleteTarget.id);
    if (ok && wasActive) {
      const next = useLayoutVersionsStore.getState().getActiveVersion(activeStoreId);
      if (next) loadWidgets(next.widgets);
    }
    setDeleteTarget(null);
  }

  function openCreateDialog() {
    setNameValue(t("defaultVersionName", { number: sorted.length + 1 }));
    setNameDialog({ mode: "create" });
  }

  function openRenameDialog(version: LayoutVersion) {
    setNameValue(version.name);
    setNameDialog({ mode: "rename", version });
  }

  async function handleNameSubmit() {
    const name = nameValue.trim();
    if (!name || !nameDialog) return;
    if (nameDialog.mode === "create") {
      // Read at submit time rather than subscribing: this menu lives in the
      // toolbar and would otherwise re-render on every drag frame.
      const id = await saveAsNewVersion(activeStoreId, name, useControlCenterStore.getState().widgets);
      if (id) {
        markSaved();
        toast.success(t("savedAs", { name }));
      }
    } else if (nameDialog.version) {
      await renameVersion(activeStoreId, nameDialog.version.id, name);
    }
    setNameDialog(null);
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button size="sm" variant="ghost" className="shrink-0 gap-1.5">
            <History className="h-4 w-4" /> <span className="hidden lg:inline">{t("versions")}</span>
            <span className="rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground">{sorted.length}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-0">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <p className="text-sm font-medium text-foreground">{t("title")}</p>
            <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" onClick={openCreateDialog}>
              <Plus className="h-3.5 w-3.5" /> {t("saveNew")}
            </Button>
          </div>
          <ScrollArea className="max-h-72">
            <div className="flex flex-col divide-y divide-border">
              {sorted.map((v) => (
                <div
                  key={v.id}
                  role="button"
                  onClick={() => handleRowClick(v)}
                  className="flex cursor-pointer items-center gap-2 px-3 py-2.5 text-left text-xs hover:bg-muted/50"
                >
                  <span className="flex w-4 shrink-0 items-center justify-center">
                    {v.id === activeVersionId && <Check className="h-3.5 w-3.5 text-primary" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-foreground">{v.name}</p>
                    <p className="text-muted-foreground">{relativeTime(v.savedAt, t, locale)}</p>
                  </div>
                  <button
                    type="button"
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    onClick={(e) => {
                      e.stopPropagation();
                      openRenameDialog(v);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    className="rounded p-1 text-muted-foreground hover:bg-status-alarm/10 hover:text-status-alarm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget(v);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </ScrollArea>
        </PopoverContent>
      </Popover>

      <ConfirmDialog
        open={Boolean(switchTarget)}
        onOpenChange={(o) => !o && setSwitchTarget(null)}
        title={t("switchTitle")}
        description={t("switchDescription")}
        confirmLabel={t("switchConfirm")}
        destructive={false}
        onConfirm={() => {
          if (switchTarget) applySwitch(switchTarget);
          setSwitchTarget(null);
        }}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title={t("deleteTitle", { name: deleteTarget?.name ?? "" })}
        description={t("deleteDescription")}
        confirmLabel={tCommon("delete")}
        onConfirm={handleDeleteConfirm}
      />

      <Dialog open={Boolean(nameDialog)} onOpenChange={(o) => !o && setNameDialog(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{nameDialog?.mode === "create" ? t("saveAsNewTitle") : t("renameTitle")}</DialogTitle>
            <DialogDescription>
              {nameDialog?.mode === "create" ? t("saveAsNewDescription") : t("renameDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t("nameLabel")}</Label>
            <Input
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleNameSubmit()}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNameDialog(null)}>
              {tCommon("cancel")}
            </Button>
            <Button onClick={handleNameSubmit} disabled={!nameValue.trim()}>
              {nameDialog?.mode === "create" ? t("save") : t("rename")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
