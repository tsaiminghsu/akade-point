"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertTriangle, ChevronDown, ChevronRight, Download, FileDown, FileUp, Info, RefreshCw, RotateCcw, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  SAFETY_GROUPS,
  configChecks,
  diffParams,
  formatValue,
  parseParamFile,
  serializeParamFile,
  valuesOf,
  type ParamValues,
} from "@/lib/control-center/vehicles/params/params";
import type { Vehicle } from "@/lib/control-center/vehicles/types";
import { useGcsStore } from "@/store/useGcsStore";
import { useParamStore } from "@/store/useParamStore";
import { ParamValueEditor } from "./ParamValueEditor";

const PAGE = 150;

function when(ms: number | null): string {
  return ms ? new Date(ms).toLocaleString() : "—";
}

/** Mission Planner's Config/Tuning parameter screens: full list, safety settings, compare. */
export function ParamsView({ vehicle, canCommand }: { vehicle: Vehicle; canCommand: boolean }) {
  const t = useTranslations("Gcs.params");
  const family = vehicle.type === "drone" ? "copter" : "rover";
  const s = useParamStore();
  const gcsState = useGcsStore((x) => x.state);
  const [confirmWrite, setConfirmWrite] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [compareWith, setCompareWith] = useState<{ label: string; values: ParamValues } | null>(null);
  const [tab, setTab] = useState("all");

  useEffect(() => s.init(vehicle.id, family), [vehicle.id, family]); // eslint-disable-line react-hooks/exhaustive-deps

  const values = useMemo(() => (s.table ? valuesOf(s.table) : {}), [s.table]);
  const editCount = Object.keys(s.edits).length;

  async function fetchNow() {
    const ok = await s.fetchFromVehicle();
    if (ok) toast.success(t("fetched", { n: Object.keys(useParamStore.getState().table ?? {}).length }));
    else toast.error(t("fetchFailed"));
  }

  async function write() {
    setConfirmWrite(false);
    const ok = await s.writeEdits();
    const lw = useParamStore.getState().lastWrite;
    if (ok) toast.success(t("written", { n: lw?.ok.length ?? 0 }));
    else toast.error(t("writePartial", { ok: lw?.ok.length ?? 0, failed: lw?.failed.map((f) => `${f.name} (${f.code})`).join(", ") ?? "" }));
    if (lw?.reboot.length) toast.warning(t("rebootNeeded", { names: lw.reboot.join(", ") }), { duration: 10_000 });
  }

  function exportFile() {
    const merged = { ...values, ...s.edits };
    const blob = new Blob([serializeParamFile(merged, `${vehicle.name} ${s.fw ?? ""} ${when(s.capturedAt)}`)], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${vehicle.name.replace(/[\\/:*?"<>|]+/g, "_")}_${new Date().toISOString().slice(0, 10)}.param`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function importFile(file: File) {
    const { values: v, bad } = parseParamFile(await file.text());
    if (Object.keys(v).length === 0) {
      toast.error(t("importEmpty"));
      return;
    }
    if (bad.length) toast.warning(t("importBadLines", { lines: bad.slice(0, 5).join(", ") }));
    setCompareWith({ label: file.name, values: v });
    setTab("compare");
  }

  return (
    <div className="flex flex-col gap-3 lg:h-full lg:min-h-0">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" className="gap-1.5" disabled={!canCommand || s.busy !== null} onClick={fetchNow}>
          <RefreshCw className={`h-3.5 w-3.5 ${s.busy === "fetch" ? "animate-spin" : ""}`} /> {s.busy === "fetch" ? t("fetching") : t("fetch")}
        </Button>
        <Select value={s.capturedAt ? String(s.capturedAt) : undefined} onValueChange={(v) => void s.loadSnapshot(Number(v))}>
          <SelectTrigger className="h-8 w-60 text-xs">
            <SelectValue placeholder={t("noSnapshot")} />
          </SelectTrigger>
          <SelectContent>
            {s.snapshots.map((sn) => (
              <SelectItem key={sn.capturedAt} value={String(sn.capturedAt)} className="text-xs">
                {when(sn.capturedAt)} · {sn.count} {sn.fw ? `· ${sn.fw}` : ""}
              </SelectItem>
            ))}
            {s.capturedAt && !s.snapshots.some((x) => x.capturedAt === s.capturedAt) && (
              <SelectItem value={String(s.capturedAt)} className="text-xs">
                {when(s.capturedAt)} · {t("live")}
              </SelectItem>
            )}
          </SelectContent>
        </Select>
        <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => fileRef.current?.click()}>
          <FileUp className="h-3.5 w-3.5" /> {t("loadFile")}
        </Button>
        <Button size="sm" variant="ghost" className="gap-1.5" disabled={!s.table} onClick={exportFile}>
          <FileDown className="h-3.5 w-3.5" /> {t("saveFile")}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".param,.params,.parm,.txt"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importFile(f);
            e.target.value = "";
          }}
        />
        <div className="ml-auto flex items-center gap-2">
          {editCount > 0 && (
            <Button size="sm" variant="ghost" className="gap-1.5" onClick={s.clearEdits}>
              <RotateCcw className="h-3.5 w-3.5" /> {t("discard")}
            </Button>
          )}
          <Button size="sm" className="gap-1.5" disabled={!canCommand || editCount === 0 || s.busy !== null} onClick={() => setConfirmWrite(true)}>
            <Save className="h-3.5 w-3.5" /> {s.busy === "write" ? t("writing") : t("write", { n: editCount })}
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {s.table ? t("source", { when: when(s.capturedAt), n: Object.keys(s.table).length, fw: s.fw ?? "—" }) : t("empty")}
        {s.metaState === "loading" && ` · ${t("metaLoading")}`}
        {s.metaState === "error" && ` · ${t("metaError")}`}
        {s.metaState === "ready" && ` · ${t("metaNote")}`}
      </p>

      <Tabs value={tab} onValueChange={setTab} className="flex flex-col lg:min-h-0 lg:flex-1">
        <TabsList className="self-start">
          <TabsTrigger value="all">{t("tabAll")}</TabsTrigger>
          <TabsTrigger value="safety">{t("tabSafety")}</TabsTrigger>
          <TabsTrigger value="compare">{t("tabCompare")}</TabsTrigger>
        </TabsList>
        <TabsContent value="all" className="mt-2 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
          <ParamList values={values} disabled={!canCommand} />
        </TabsContent>
        <TabsContent value="safety" className="mt-2 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
          <SafetyPanel family={family} values={values} policy={gcsState?.gcs.policy ?? null} disabled={!canCommand} />
        </TabsContent>
        <TabsContent value="compare" className="mt-2 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
          <ComparePanel values={values} compareWith={compareWith} setCompareWith={setCompareWith} />
        </TabsContent>
      </Tabs>

      <Dialog open={confirmWrite} onOpenChange={setConfirmWrite}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("confirmTitle", { n: editCount })}</DialogTitle>
            <DialogDescription>{t("confirmDescription")}</DialogDescription>
          </DialogHeader>
          <ul className="max-h-72 space-y-0.5 overflow-y-auto font-mono text-xs">
            {Object.entries(s.edits).map(([name, v]) => (
              <li key={name} className="flex justify-between gap-3">
                <span>
                  {name}
                  {s.meta?.[name]?.reboot && <span className="ml-1 text-status-warning">({t("reboot")})</span>}
                </span>
                <span className="tabular-nums">
                  {values[name] !== undefined ? formatValue(values[name]) : "—"} → <b>{formatValue(v)}</b>
                </span>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmWrite(false)}>
              {t("cancel")}
            </Button>
            <Button onClick={() => void write()}>{t("confirmWrite")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ParamList({ values, disabled }: { values: ParamValues; disabled: boolean }) {
  const t = useTranslations("Gcs.params");
  const meta = useParamStore((s) => s.meta);
  const edits = useParamStore((s) => s.edits);
  const setEdit = useParamStore((s) => s.setEdit);
  const [q, setQ] = useState("");
  const [onlyChanged, setOnlyChanged] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(true);
  const [limit, setLimit] = useState(PAGE);
  const [open, setOpen] = useState<string | null>(null);

  const names = useMemo(() => {
    const needle = q.trim().toUpperCase();
    const needleText = q.trim().toLowerCase();
    return Object.keys(values)
      .sort()
      .filter((n) => {
        if (onlyChanged && !(n in edits)) return false;
        const m = meta?.[n];
        if (!showAdvanced && m?.advanced) return false;
        if (!needle) return true;
        return n.includes(needle) || (m?.display.toLowerCase().includes(needleText) ?? false) || (m?.desc.toLowerCase().includes(needleText) ?? false);
      });
  }, [values, q, onlyChanged, showAdvanced, meta, edits]);

  if (Object.keys(values).length === 0) return <p className="py-8 text-center text-sm text-muted-foreground">{t("emptyHint")}</p>;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <Input className="h-8 w-64 text-xs" placeholder={t("search")} value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} />
        <label className="flex items-center gap-1.5 text-xs">
          <Switch aria-label={t("onlyChanged")} checked={onlyChanged} onCheckedChange={setOnlyChanged} /> {t("onlyChanged")}
        </label>
        <label className="flex items-center gap-1.5 text-xs">
          <Switch aria-label={t("showAdvanced")} checked={showAdvanced} onCheckedChange={setShowAdvanced} /> {t("showAdvanced")}
        </label>
        <span className="text-xs text-muted-foreground">{t("count", { n: names.length })}</span>
      </div>
      <ul className="divide-y divide-border/50 rounded-md border border-border/60">
        {names.slice(0, limit).map((n) => {
          const m = meta?.[n];
          const expanded = open === n;
          return (
            <li key={n} className="px-2 py-1.5 text-xs">
              <div className="grid grid-cols-[1fr_9rem] items-center gap-2 sm:grid-cols-[14rem_1fr_10rem]">
                <button className="flex min-w-0 items-center gap-1 text-left font-mono" onClick={() => setOpen(expanded ? null : n)} aria-expanded={expanded}>
                  {expanded ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
                  <span className={`truncate ${n in edits ? "text-status-warning" : ""}`}>{n}</span>
                  {m?.reboot && <span className="shrink-0 text-[9px] text-status-warning">⟳</span>}
                </button>
                <span className="hidden truncate text-muted-foreground sm:block">{m?.display ?? ""}</span>
                <ParamValueEditor name={n} value={edits[n] ?? values[n]} original={values[n]} meta={m} disabled={disabled} onChange={(v) => setEdit(n, v)} />
              </div>
              {expanded && (
                <div className="mt-1.5 space-y-1 pl-4 text-[11px] text-muted-foreground">
                  {m ? (
                    <>
                      <p className="text-foreground">{m.display}</p>
                      <p>{m.desc}</p>
                      {m.range && <p>{t("range", { lo: m.range[0], hi: m.range[1], units: m.units ?? "" })}</p>}
                      {m.reboot && <p className="text-status-warning">{t("rebootRequired")}</p>}
                      {m.bitmask && <ParamValueEditor name={n} value={edits[n] ?? values[n]} original={values[n]} meta={m} disabled={disabled} onChange={(v) => setEdit(n, v)} showBits />}
                    </>
                  ) : (
                    <p>{t("noMeta")}</p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {names.length > limit && (
        <Button size="sm" variant="ghost" className="w-full" onClick={() => setLimit((l) => l + PAGE)}>
          {t("more", { n: names.length - limit })}
        </Button>
      )}
    </div>
  );
}

function SafetyPanel({ family, values, policy, disabled }: { family: "copter" | "rover"; values: ParamValues; policy: "off" | "always" | "operator" | null; disabled: boolean }) {
  const t = useTranslations("Gcs.params");
  const meta = useParamStore((s) => s.meta);
  const edits = useParamStore((s) => s.edits);
  const setEdit = useParamStore((s) => s.setEdit);
  const merged = { ...values, ...edits };
  const checks = configChecks(merged, { sysid: 253, policy });

  if (Object.keys(values).length === 0) return <p className="py-8 text-center text-sm text-muted-foreground">{t("emptyHint")}</p>;

  return (
    <div className="space-y-4">
      {checks.length > 0 && (
        <ul className="space-y-1 rounded-md border border-border/60 p-2 text-xs">
          {checks.map((c, i) => (
            <li key={i} className={`flex items-start gap-1.5 ${c.level === "warn" ? "text-status-warning" : "text-muted-foreground"}`}>
              {c.level === "warn" ? <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
              {t(`check.${c.key}`, c.params ?? {})}
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-4 xl:grid-cols-2">
        {SAFETY_GROUPS[family].map((g) => {
          const present = g.params.filter((p) => p in values);
          if (present.length === 0) return null;
          return (
            <section key={g.key} className="space-y-2 rounded-md border border-border/60 p-3">
              <h3 className="text-sm font-semibold">{t(`group.${g.key}`)}</h3>
              {present.map((p) => (
                <div key={p} className="grid grid-cols-[1fr_12rem] items-start gap-2 text-xs">
                  <div className="min-w-0">
                    <p className="font-mono">{p}</p>
                    <p className="truncate text-muted-foreground" title={meta?.[p]?.desc}>
                      {meta?.[p]?.display ?? ""}
                    </p>
                  </div>
                  <ParamValueEditor name={p} value={edits[p] ?? values[p]} original={values[p]} meta={meta?.[p]} disabled={disabled} onChange={(v) => setEdit(p, v)} showBits />
                </div>
              ))}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function ComparePanel({
  values,
  compareWith,
  setCompareWith,
}: {
  values: ParamValues;
  compareWith: { label: string; values: ParamValues } | null;
  setCompareWith: (c: { label: string; values: ParamValues } | null) => void;
}) {
  const t = useTranslations("Gcs.params");
  const snapshots = useParamStore((s) => s.snapshots);
  const vehicleId = useParamStore((s) => s.vehicleId);
  const setEdits = useParamStore((s) => s.setEdits);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const diff = useMemo(() => (compareWith ? diffParams(values, compareWith.values) : []), [values, compareWith]);
  const applicable = diff.filter((d) => d.other !== null && d.current !== null);
  useEffect(() => setPicked(new Set(applicable.map((d) => d.name))), [compareWith]); // eslint-disable-line react-hooks/exhaustive-deps

  async function pickSnapshot(at: string) {
    if (!vehicleId) return;
    setLoading(true);
    const res = await fetch(`/api/control-center/vehicles/${vehicleId}/params/${at}`).then((r) => (r.ok ? r.json() : null));
    setLoading(false);
    if (res?.snapshot) setCompareWith({ label: when(Number(at)), values: valuesOf(res.snapshot.params) });
  }

  return (
    <div className="space-y-3 text-xs">
      <p className="text-muted-foreground">{t("compareHint")}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Select onValueChange={(v) => void pickSnapshot(v)}>
          <SelectTrigger className="h-8 w-64 text-xs">
            <SelectValue placeholder={t("compareSnapshot")} />
          </SelectTrigger>
          <SelectContent>
            {snapshots.map((sn) => (
              <SelectItem key={sn.capturedAt} value={String(sn.capturedAt)} className="text-xs">
                {when(sn.capturedAt)} · {sn.count}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {loading && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
        {compareWith && <span className="text-muted-foreground">{t("comparing", { label: compareWith.label })}</span>}
      </div>
      {compareWith && (
        <>
          <p>{t("diffCount", { n: diff.length })}</p>
          <ul className="divide-y divide-border/50 rounded-md border border-border/60 font-mono">
            {diff.map((d) => {
              const canApply = d.other !== null && d.current !== null;
              return (
                <li key={d.name} className="flex items-center gap-2 px-2 py-1">
                  <Checkbox
                    aria-label={d.name}
                    disabled={!canApply}
                    checked={picked.has(d.name)}
                    onCheckedChange={(c) =>
                      setPicked((p) => {
                        const next = new Set(p);
                        if (c) next.add(d.name);
                        else next.delete(d.name);
                        return next;
                      })
                    }
                  />
                  <span className="flex-1 truncate">{d.name}</span>
                  <span className="tabular-nums text-muted-foreground">{d.current === null ? t("missingHere") : formatValue(d.current)}</span>
                  <span>→</span>
                  <span className="tabular-nums">{d.other === null ? t("missingThere") : formatValue(d.other)}</span>
                </li>
              );
            })}
          </ul>
          <Button
            size="sm"
            className="gap-1.5"
            disabled={picked.size === 0}
            onClick={() => {
              setEdits(Object.fromEntries([...picked].map((n) => [n, compareWith.values[n]])));
              toast.success(t("applied", { n: picked.size }));
            }}
          >
            <Download className="h-3.5 w-3.5" /> {t("apply", { n: picked.size })}
          </Button>
        </>
      )}
    </div>
  );
}
