"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Copy, Joystick, RotateCcw, Save, Search, Undo2 } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/control-center/shared/ConfirmDialog";
import { EmptyState } from "@/components/control-center/shared/EmptyState";
import { ErrorState } from "@/components/control-center/shared/ErrorState";
import { StatusDot } from "@/components/control-center/shared/StatusDot";
import { cn } from "@/lib/utils";
import {
  defaultDraft,
  describeClaw,
  sameDraft,
  type ClawConfig,
  type ClawDraft,
  type ClawRig,
} from "@/lib/control-center/claw/config";
import type { ClawSettings } from "./game/settings";
import type { Machine } from "@/lib/control-center/types";
import { useClawConfigsStore } from "@/store/useClawConfigsStore";
import { useMachinesStore } from "@/store/useMachinesStore";
import { CopyConfigDialog } from "./CopyConfigDialog";

// three.js + Rapier are large; keep them out of the page chunk so the machine
// list shows while the simulator loads.
const ClawBench = dynamic(() => import("./ClawBench"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-[#0b0718]" />,
});

export function useRelativeTime() {
  const t = useTranslations("ClawConfigs");
  const locale = useLocale();
  return useCallback(
    (ts: number) => {
      const mins = Math.round((Date.now() - ts) / 60000);
      if (mins < 1) return t("justNow");
      if (mins < 60) return t("minutesAgo", { mins });
      const hours = Math.round(mins / 60);
      if (hours < 24) return t("hoursAgo", { hours });
      return new Date(ts).toLocaleDateString(locale, { month: "2-digit", day: "2-digit" });
    },
    [t, locale]
  );
}

export default function ClawConfigsPageContent() {
  const t = useTranslations("ClawConfigs");
  const router = useRouter();
  const params = useSearchParams();
  const relativeTime = useRelativeTime();

  const machines = useMachinesStore((s) => s.machines);
  const stores = useMachinesStore((s) => s.stores);
  const activeStoreId = useMachinesStore((s) => s.activeStoreId);
  const machinesHydrated = useMachinesStore((s) => s.hydrated);
  const configs = useClawConfigsStore((s) => s.configs);
  const configsHydrated = useClawConfigsStore((s) => s.hydrated);
  const configsError = useClawConfigsStore((s) => s.hydrateError);

  const [query, setQuery] = useState("");
  const [storeFilter, setStoreFilter] = useState("all");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** The saved config the draft started from (revision 0 = factory). */
  const [base, setBase] = useState<ClawConfig | null>(null);
  const [draft, setDraft] = useState<ClawDraft | null>(null);
  /** Bumped to rebuild the simulator from the draft (new machine, discard, factory). */
  const [benchKey, setBenchKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [pendingSwitch, setPendingSwitch] = useState<string | null>(null);
  const [conflict, setConflict] = useState<ClawConfig | null>(null);
  const [copyOpen, setCopyOpen] = useState(false);

  useEffect(() => {
    void useClawConfigsStore.getState().hydrate();
  }, []);

  const storeName = useMemo(() => new Map(stores.map((s) => [s.id, s.name])), [stores]);
  const machine = machines.find((m) => m.id === selectedId) ?? null;
  const dirty = Boolean(draft && base && !sameDraft(draft, base));

  /** Latest load() call; an older one that resolves late is dropped. */
  const loadSeq = useRef(0);
  const load = useCallback(
    async (id: string, config?: ClawConfig) => {
      const seq = ++loadSeq.current;
      // Read it fresh unless we were handed one: the list may be minutes old,
      // and editing a stale revision would only end in a conflict.
      const store = useClawConfigsStore.getState();
      const cfg = config ?? (await store.fetchConfig(id)) ?? store.configFor(id);
      if (seq !== loadSeq.current) return;
      setSelectedId(id);
      setBase(cfg);
      setDraft({ settings: cfg.settings, rig: cfg.rig });
      setBenchKey((k) => k + 1);
      router.replace(`?machine=${encodeURIComponent(id)}`, { scroll: false });
    },
    [router]
  );

  // First selection: the ?machine= deep link (from the machine drawer), else
  // the first machine in the store picked in the top bar.
  const started = useRef(false);
  useEffect(() => {
    if (started.current || !machinesHydrated || !configsHydrated || machines.length === 0) return;
    started.current = true;
    const wanted = params.get("machine");
    const first =
      machines.find((m) => m.id === wanted) ??
      machines.find((m) => m.storeId === activeStoreId) ??
      machines[0];
    void load(first.id);
  }, [machinesHydrated, configsHydrated, machines, params, activeStoreId, load]);

  const pick = useCallback(
    (id: string) => {
      if (id === selectedId) return;
      if (dirty) setPendingSwitch(id);
      else void load(id);
    },
    [dirty, selectedId, load]
  );

  const setSettings = useCallback((action: SetStateAction<ClawSettings>) => {
    setDraft((d) => d && { ...d, settings: typeof action === "function" ? action(d.settings) : action });
  }, []);
  const setRig = useCallback((action: SetStateAction<ClawRig>) => {
    setDraft((d) => d && { ...d, rig: typeof action === "function" ? action(d.rig) : action });
  }, []);

  const save = useCallback(
    async (revision?: number) => {
      if (!machine || !draft || !base || saving) return;
      setSaving(true);
      const res = await useClawConfigsStore.getState().save(machine.id, draft, revision ?? base.revision);
      setSaving(false);
      if (res.ok) {
        // Keep the draft object: swapping it would make the simulator reload
        // the chute and stock for values that haven't changed.
        setBase(res.config);
        toast.success(t("saved", { name: machine.name, rev: res.config.revision }));
      } else if (res.conflict) {
        setConflict(res.conflict);
      }
    },
    [machine, draft, base, saving, t]
  );

  const discard = () => {
    if (machine && base) void load(machine.id, base);
  };

  const loadFactory = () => {
    setDraft(defaultDraft());
    setBenchKey((k) => k + 1);
    toast.info(t("factoryLoaded"));
  };

  // Ctrl/Cmd+S saves; leaving the page with unsaved changes asks first.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (dirty) void save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dirty, save]);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return machines.filter((m) => {
      if (storeFilter !== "all" && m.storeId !== storeFilter) return false;
      if (q && !`${m.name} ${m.deviceId}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [machines, storeFilter, query]);

  const status = (() => {
    if (!base) return null;
    if (dirty) return <span className="font-medium text-amber-500">{t("statusDirty")}</span>;
    if (base.revision === 0) return t("statusFactory");
    return t("statusSaved", { rev: base.revision, time: relativeTime(base.updatedAt) });
  })();

  if (configsError) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <ErrorState
          title={t("loadError")}
          onRetry={() => void useClawConfigsStore.getState().hydrate()}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-2 sm:px-6 sm:py-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-base font-semibold text-foreground sm:text-lg">
            <Joystick className="h-5 w-5 text-primary" /> {t("title")}
          </h1>
          <p className="hidden text-sm text-muted-foreground sm:block">{t("subtitle")}</p>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Machine list (desktop). Phones pick from the select in the toolbar. */}
        <aside className="hidden w-72 shrink-0 flex-col border-r border-border lg:flex">
          <div className="space-y-2 border-b border-border p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("searchPlaceholder")}
                aria-label={t("searchPlaceholder")}
                className="pl-8"
              />
            </div>
            <Select value={storeFilter} onValueChange={setStoreFilter}>
              <SelectTrigger aria-label={t("storeFilter")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("allStores")}</SelectItem>
                {stores.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto p-2" aria-label={t("machineList")}>
            {filtered.map((m) => (
              <MachineRow
                key={m.id}
                machine={m}
                storeName={storeFilter === "all" ? storeName.get(m.storeId) : undefined}
                config={configs[m.id]}
                selected={m.id === selectedId}
                dirty={m.id === selectedId && dirty}
                onPick={pick}
              />
            ))}
            {machinesHydrated && filtered.length === 0 && (
              <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                {machines.length === 0 ? t("noMachines") : t("noMatch")}
              </li>
            )}
          </ul>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2 sm:px-4">
            <div className="w-full lg:hidden">
              <Select value={selectedId ?? ""} onValueChange={pick}>
                <SelectTrigger aria-label={t("selectMachine")}>
                  <SelectValue placeholder={t("selectMachine")} />
                </SelectTrigger>
                <SelectContent>
                  {machines.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name} · {storeName.get(m.storeId)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {machine && (
              <div className="min-w-0 flex-1">
                {/* On phones the select above already names the machine. */}
                <p className="hidden items-center gap-2 truncate text-sm font-medium text-foreground lg:flex">
                  <StatusDot status={machine.status} />
                  <span className="truncate">{machine.name}</span>
                  <span className="shrink-0 text-xs font-normal text-muted-foreground">
                    {storeName.get(machine.storeId)} · {machine.deviceId}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground" aria-live="polite">
                  {status}
                </p>
              </div>
            )}
            {machine && (
              <div className="flex flex-wrap items-center gap-2">
                {/* Icon-only below sm, so the toolbar stays one row on a phone. */}
                <Button variant="ghost" size="sm" onClick={loadFactory} aria-label={t("factory")} title={t("factory")}>
                  <RotateCcw className="h-4 w-4 sm:mr-1.5" /> <span className="hidden sm:inline">{t("factory")}</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={discard}
                  disabled={!dirty || saving}
                  aria-label={t("discard")}
                  title={t("discard")}
                >
                  <Undo2 className="h-4 w-4 sm:mr-1.5" /> <span className="hidden sm:inline">{t("discard")}</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCopyOpen(true)}
                  disabled={dirty || machines.length < 2}
                  aria-label={t("copyTo")}
                  title={dirty ? t("copyNeedsSave") : t("copyTo")}
                >
                  <Copy className="h-4 w-4 sm:mr-1.5" /> <span className="hidden sm:inline">{t("copyTo")}</span>
                </Button>
                <Button size="sm" onClick={() => void save()} disabled={!dirty || saving}>
                  <Save className="mr-1.5 h-4 w-4" /> {saving ? t("saving") : t("save")}
                </Button>
              </div>
            )}
          </div>

          <div className="min-h-0 flex-1">
            {machine && draft ? (
              <ClawBench
                key={`${machine.id}:${benchKey}`}
                settings={draft.settings}
                rig={draft.rig}
                onSettings={setSettings}
                onRig={setRig}
              />
            ) : machinesHydrated && configsHydrated && machines.length === 0 ? (
              <EmptyState icon={Joystick} title={t("noMachines")} description={t("noMachinesHint")} className="h-full" />
            ) : (
              <div className="h-full w-full animate-pulse bg-muted/30" />
            )}
          </div>
        </section>
      </div>

      <ConfirmDialog
        open={pendingSwitch !== null}
        onOpenChange={(open) => !open && setPendingSwitch(null)}
        title={t("switchTitle")}
        description={machine ? t("switchDescription", { name: machine.name }) : undefined}
        confirmLabel={t("switchConfirm")}
        onConfirm={() => {
          if (pendingSwitch) void load(pendingSwitch);
          setPendingSwitch(null);
        }}
      />

      <AlertDialog open={conflict !== null} onOpenChange={(open) => !open && setConflict(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("conflictTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {machine && conflict ? t("conflictDescription", { name: machine.name, rev: conflict.revision }) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("conflictKeep")}</AlertDialogCancel>
            <Button
              variant="outline"
              onClick={() => {
                if (machine && conflict) void load(machine.id, conflict);
                setConflict(null);
              }}
            >
              {t("conflictLoad")}
            </Button>
            <AlertDialogAction
              onClick={() => {
                const theirs = conflict;
                setConflict(null);
                if (theirs) void save(theirs.revision);
              }}
            >
              {t("conflictOverwrite")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {machine && base && (
        <CopyConfigDialog
          open={copyOpen}
          onOpenChange={setCopyOpen}
          source={machine}
          draft={base}
        />
      )}
    </div>
  );
}

function MachineRow({
  machine,
  storeName,
  config,
  selected,
  dirty,
  onPick,
}: {
  machine: Machine;
  storeName?: string;
  config?: ClawConfig;
  selected: boolean;
  dirty: boolean;
  onPick: (id: string) => void;
}) {
  const t = useTranslations("ClawConfigs");
  const relativeTime = useRelativeTime();
  const s = config?.settings;
  return (
    <li>
      <button
        type="button"
        onClick={() => onPick(machine.id)}
        aria-current={selected ? "true" : undefined}
        className={cn(
          "w-full rounded-md px-3 py-2 text-left transition-colors",
          selected ? "bg-primary/10" : "hover:bg-muted/60"
        )}
      >
        <span className="flex items-center gap-2">
          <StatusDot status={machine.status} animate={false} />
          <span className={cn("flex-1 truncate text-sm", selected ? "font-medium text-primary" : "text-foreground")}>
            {machine.name}
          </span>
          {dirty && <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" aria-label={t("statusDirty")} />}
        </span>
        <span className="mt-0.5 block truncate pl-4 text-xs text-muted-foreground">
          {storeName ? `${storeName} · ` : ""}
          {config ? t("revisionShort", { rev: config.revision, time: relativeTime(config.updatedAt) }) : t("factoryShort")}
        </span>
        {config && s && (
          <span className="block truncate pl-4 font-mono text-[11px] text-muted-foreground/80">
            {`${s.strongPower}/${s.midPower}/${s.weakPower}V · ${describeClaw(config.rig)}`}
          </span>
        )}
      </button>
    </li>
  );
}
