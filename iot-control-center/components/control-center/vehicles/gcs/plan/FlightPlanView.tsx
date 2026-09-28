"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  CheckCircle2,
  Download,
  FileDown,
  FileUp,
  History,
  Home,
  MapPinPlus,
  Orbit,
  Save,
  ScanLine,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfirmDialog } from "@/components/control-center/shared/ConfirmDialog";
import { bearingDeg, formatDistance } from "@/lib/control-center/vehicles/gcs/geo";
import { MISSION_TYPE, type PlanKind, type VehicleFamily } from "@/lib/control-center/vehicles/plan/mavCmdMeta";
import { isEmpty as noFeatures, kmlFromKmz, parseKml } from "@/lib/control-center/vehicles/plan/geoImport";
import { missionStats, polygonsFromGeoJson, resumeFrom, validateFence, validateMission, type PlanIssue } from "@/lib/control-center/vehicles/plan/missionTools";
import { blankItem, diffItems, newKey } from "@/lib/control-center/vehicles/plan/planModel";
import { parseWaypointsFile, serializeWaypointsFile } from "@/lib/control-center/vehicles/waypoints";
import type { MissionItem, Vehicle } from "@/lib/control-center/vehicles/types";
import { useGcsStore } from "@/store/useGcsStore";
import { usePlanStore } from "@/store/usePlanStore";
import { useVehiclesStore } from "@/store/useVehiclesStore";
import { GcsMap } from "../map/GcsMap";
import { FencePanel, RallyPanel } from "./FencePanel";
import { ItemTable } from "./ItemTable";
import { PlanOverlay } from "./PlanOverlay";
import { OrbitDialog } from "./OrbitDialog";
import { SurveyDialog } from "./SurveyDialog";

const TRANSFER_TIMEOUT_MS = 150_000;

function kindOfItems(items: MissionItem[]): PlanKind {
  if (items.length > 0 && items.every((i) => i.cmd >= 5000 && i.cmd <= 5004)) return "fence";
  if (items.length > 0 && items.every((i) => i.cmd === 5100)) return "rally";
  return "mission";
}

function formatDuration(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.round(s % 60)).padStart(2, "0")}`;
}

/** Mission Planner's Flight Plan screen: mission, geofence and rally points on one map. */
export function FlightPlanView({ vehicle, canCommand }: { vehicle: Vehicle; canCommand: boolean }) {
  const t = useTranslations("Gcs.plan");
  const family: VehicleFamily = vehicle.type === "drone" ? "copter" : "rover";

  const plan = usePlanStore();
  const { kind, draw, drawPoints } = plan;
  const missions = useVehiclesStore((s) => s.missionsByVehicle[vehicle.id]);
  const fetchMissions = useVehiclesStore((s) => s.fetchMissions);
  const createMission = useVehiclesStore((s) => s.createMission);
  const updateMission = useVehiclesStore((s) => s.updateMission);
  const deleteMission = useVehiclesStore((s) => s.deleteMission);
  const gcsState = useGcsStore((s) => s.state);
  const trail = useGcsStore((s) => s.trail);
  const sendAndWait = useGcsStore((s) => s.sendAndWait);
  const viaDirect = useGcsStore((s) => s.viaDirect);

  const [busy, setBusy] = useState<null | "upload" | "download" | "save">(null);
  const [confirmUpload, setConfirmUpload] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [surveyOpen, setSurveyOpen] = useState(false);
  const [resumeOpen, setResumeOpen] = useState(false);
  const [resumeAt, setResumeAt] = useState("");
  const [circleRadius, setCircleRadius] = useState(100);
  const [orbitAt, setOrbitAt] = useState<{ lat: number; lon: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void fetchMissions(vehicle.id);
  }, [vehicle.id, fetchMissions]);

  // A fresh mission starts at the vehicle's home (or current position).
  useEffect(() => {
    const s = usePlanStore.getState();
    const where = gcsState?.home ?? (gcsState?.pos ? { ...gcsState.pos, alt: gcsState.pos.alt - gcsState.pos.rel } : null);
    if (where && s.mission.home.lat === 0 && s.mission.home.lon === 0 && s.recordId.mission === null && s.mission.items.length === 0) {
      s.setHome(where.lat, where.lon, where.alt);
      usePlanStore.setState({ dirty: { ...s.dirty, mission: false } });
    }
  }, [gcsState?.home, gcsState?.pos]);

  const records = useMemo(() => (missions ?? []).filter((m) => (m.kind ?? "mission") === kind), [missions, kind]);
  const recordId = plan.recordId[kind];
  const dirty = plan.dirty[kind];
  const verified = plan.verified[kind];
  const name = plan.name[kind];

  const issues: PlanIssue[] = useMemo(() => {
    if (kind === "mission") return validateMission(plan.mission, family, { fence: plan.fence.polygons.length || plan.fence.circles.length ? plan.fence : null });
    if (kind === "fence") return validateFence(plan.fence);
    return [];
  }, [kind, plan.mission, plan.fence, family]);
  const errors = issues.filter((i) => i.level === "error");
  const stats = useMemo(() => missionStats(plan.mission, family === "copter" ? 5 : 2), [plan.mission, family]);
  const itemCount = kind === "mission" ? plan.mission.items.length : kind === "fence" ? plan.fence.polygons.length + plan.fence.circles.length : plan.rally.length;

  function defaultName(): string {
    return `${t(`kind_${kind}`)} ${new Date().toLocaleString(undefined, { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}`;
  }

  async function save(asNew = false): Promise<string | null> {
    const items = plan.itemsFor(kind);
    if (items.length === 0 || (kind === "mission" && items.length < 2)) {
      toast.error(t("nothingToSave"));
      return null;
    }
    setBusy("save");
    const finalName = name.trim() || defaultName();
    try {
      if (!recordId || asNew) {
        const created = await createMission(vehicle.id, finalName, items, "editor", kind);
        if (!created) return null;
        plan.markSaved(kind, created.id, finalName);
        return created.id;
      }
      const ok = await updateMission(vehicle.id, recordId, { name: finalName, items });
      if (!ok) return null;
      plan.markSaved(kind, recordId, finalName);
      return recordId;
    } finally {
      setBusy(null);
    }
  }

  /** What the vehicle holds now, via the direct link inline or a server round trip. */
  async function downloadItems(): Promise<MissionItem[] | null> {
    const mtype = MISSION_TYPE[kind];
    if (viaDirect()) {
      const res = await sendAndWait({ type: "mission_download", mtype }, { directExtra: { inline: true }, timeoutMs: TRANSFER_TIMEOUT_MS });
      if (res?.status === "acked") return (res.result?.items as MissionItem[]) ?? [];
      if (res?.code === "MISSION_DOWNLOAD_EMPTY") return [];
      return null;
    }
    const before = new Set((useVehiclesStore.getState().missionsByVehicle[vehicle.id] ?? []).map((m) => m.id));
    const res = await sendAndWait({ type: "mission_download", mtype }, { timeoutMs: TRANSFER_TIMEOUT_MS });
    if (res?.code === "MISSION_DOWNLOAD_EMPTY") return [];
    if (res?.status !== "acked") return null;
    await fetchMissions(vehicle.id);
    const fresh = (useVehiclesStore.getState().missionsByVehicle[vehicle.id] ?? []).find((m) => !before.has(m.id) && m.source === "download");
    return fresh?.items ?? null;
  }

  async function upload() {
    setConfirmUpload(false);
    const id = dirty || !recordId ? await save() : recordId;
    if (!id) return;
    const items = plan.itemsFor(kind);
    setBusy("upload");
    try {
      const res = await sendAndWait(
        { type: "mission_upload", missionId: id },
        { directExtra: { items, mtype: MISSION_TYPE[kind] }, timeoutMs: TRANSFER_TIMEOUT_MS }
      );
      if (res?.status !== "acked") {
        toast.error(t("uploadFailed", { code: res?.code ?? "TIMEOUT" }));
        return;
      }
      toast.success(t("uploaded", { n: items.length }));
      // Read it back and compare, like MP's verify after write.
      const got = await downloadItems();
      if (got === null) {
        toast.warning(t("verifySkipped"));
        return;
      }
      const diff = diffItems(items, got, kind);
      plan.setVerified(kind, diff.length === 0 ? "ok" : "mismatch");
      if (diff.length) toast.error(t("verifyMismatch", { items: diff.join(", ") }));
    } finally {
      setBusy(null);
    }
  }

  async function download() {
    if (dirty && !window.confirm(t("discardConfirm"))) return;
    setBusy("download");
    try {
      const items = await downloadItems();
      if (items === null) {
        toast.error(t("downloadFailed"));
        return;
      }
      plan.loadRecord(kind, null, `${t("downloaded")} ${new Date().toLocaleTimeString()}`, items);
      plan.setVerified(kind, "ok");
      toast.success(t("downloadedToast", { n: items.length }));
    } finally {
      setBusy(null);
    }
  }

  function openRecord(id: string) {
    if (dirty && !window.confirm(t("discardConfirm"))) return;
    if (id === "new") {
      plan.newPlan(kind, gcsState?.home ?? undefined);
      return;
    }
    const rec = records.find((r) => r.id === id);
    if (rec) plan.loadRecord(kind, rec.id, rec.name, rec.items);
  }

  async function remove() {
    setConfirmDelete(false);
    if (!recordId) return;
    if (await deleteMission(vehicle.id, recordId)) plan.newPlan(kind);
  }

  function exportFile() {
    const items = plan.itemsFor(kind);
    const blob = new Blob([serializeWaypointsFile(items)], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${(name || defaultName()).replace(/[\\/:*?"<>|]+/g, "_")}${kind === "mission" ? "" : `.${kind}`}.waypoints`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function importKml(file: File) {
    const text = /\.kmz$/i.test(file.name) ? await kmlFromKmz(await file.arrayBuffer()) : await file.text();
    const f = text ? parseKml(text) : null;
    if (!f || noFeatures(f)) {
      toast.error(t("importNoFeatures"));
      return;
    }
    if (kind === "fence") {
      if (f.polygons.length === 0) return void toast.error(t("importNoPolygon"));
      plan.updateFence((fe) => ({ ...fe, polygons: [...fe.polygons, ...f.polygons.map((p) => ({ key: newKey(), inclusion: true, points: p.points }))] }));
      toast.success(t("importedPolygons", { n: f.polygons.length }));
    } else if (kind === "rally") {
      if (f.points.length === 0) return void toast.error(t("importNoPoints"));
      for (const p of f.points) plan.addRally(p.lat, p.lon);
      toast.success(t("importedRally", { n: f.points.length }));
    } else if (f.paths.length > 0 || f.points.length > 0) {
      // Paths and placemarks become waypoints at the plan's default altitude
      // (KML heights are usually clamped to the ground or absolute).
      const alt = family === "rover" ? 0 : plan.defaultAlt;
      const pts = [...f.paths.flatMap((p) => p.points.map(([lat, lon]) => ({ lat, lon }))), ...f.points];
      plan.appendItems(pts.map((p) => blankItem(16, p.lat, p.lon, alt)));
      toast.success(t("importedWaypoints", { n: pts.length }));
    } else {
      plan.setKind("mission");
      usePlanStore.setState({ draw: "survey", drawPoints: f.polygons[0].points });
      setSurveyOpen(true);
    }
  }

  async function importFile(file: File) {
    if (/\.km[lz]$/i.test(file.name)) return importKml(file);
    const text = await file.text();
    if (/\.(geo)?json$/i.test(file.name)) {
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        toast.error(t("importBad"));
        return;
      }
      const polys = polygonsFromGeoJson(json);
      if (polys.length === 0) {
        toast.error(t("importNoPolygon"));
        return;
      }
      if (kind === "fence") {
        plan.updateFence((f) => ({ ...f, polygons: [...f.polygons, ...polys.map((points) => ({ key: newKey(), inclusion: true, points }))] }));
        toast.success(t("importedPolygons", { n: polys.length }));
      } else {
        // Use the first polygon as a survey area.
        plan.setKind("mission");
        usePlanStore.setState({ draw: "survey", drawPoints: polys[0] });
        setSurveyOpen(true);
      }
      return;
    }
    const res = parseWaypointsFile(text);
    if (!res.ok) {
      toast.error(t("importError", { error: res.error, line: res.line }));
      return;
    }
    const k = kindOfItems(res.items);
    plan.setKind(k);
    plan.loadRecord(k, null, file.name.replace(/\.waypoints$/i, ""), res.items);
    toast.success(t("imported", { n: res.items.length }));
  }

  function doResume() {
    const n = Number(resumeAt);
    if (!Number.isInteger(n) || n < 1) return;
    const { doc, droppedJumps } = resumeFrom(plan.mission, n, family);
    const baseName = name || defaultName();
    plan.replaceMission(doc);
    usePlanStore.setState((s) => ({ recordId: { ...s.recordId, mission: null }, name: { ...s.name, mission: t("resumeName", { name: baseName, n }) } }));
    if (droppedJumps) toast.warning(t("resumeDroppedJumps", { n: droppedJumps }));
    setResumeOpen(false);
  }

  function onMapClick(lat: number, lon: number) {
    switch (draw) {
      case "addWp":
        plan.addWaypointAt(lat, lon);
        break;
      case "polygonIn":
      case "polygonOut":
      case "survey":
        plan.addDrawPoint(lat, lon);
        break;
      case "circleIn":
      case "circleOut":
        if (circleRadius > 0) plan.addCircle(draw === "circleIn", lat, lon, circleRadius);
        break;
      case "rally":
        plan.addRally(lat, lon);
        break;
      case "fenceReturn":
        plan.setFenceReturn({ lat, lon });
        break;
      case "orbit":
        plan.clearDraw();
        setOrbitAt({ lat, lon });
        break;
      default:
        plan.select(null);
    }
  }

  const transferring = busy === "upload" || busy === "download";

  return (
    <div className="flex flex-col gap-3 lg:h-full lg:min-h-0 lg:flex-row">
      <div className="flex flex-col gap-3 lg:min-h-0 lg:w-[420px] lg:shrink-0">
        <Tabs value={kind} onValueChange={(v) => plan.setKind(v as PlanKind)}>
          <TabsList className="w-full">
            {(["mission", "fence", "rally"] as const).map((k) => (
              <TabsTrigger key={k} value={k} className="flex-1 text-xs">
                {t(`kind_${k}`)}
                {plan.dirty[k] && <span className="ml-1 h-1.5 w-1.5 rounded-full bg-status-warning" aria-label={t("unsaved")} />}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {/* Stored plans */}
        <div className="space-y-2 rounded-md border border-border/60 p-2">
          <div className="flex gap-2">
            <Select value={recordId ?? "new"} onValueChange={openRecord}>
              <SelectTrigger className="h-8 flex-1 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="new" className="text-xs">
                  {t("newPlan")}
                </SelectItem>
                {records.map((r) => (
                  <SelectItem key={r.id} value={r.id} className="text-xs">
                    {r.name} <span className="text-muted-foreground">· {r.items.length}{r.source === "download" ? ` · ${t("fromVehicle")}` : ""}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="icon-sm" variant="ghost" className="h-8 w-8" aria-label={t("delete")} disabled={!recordId} onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
          <Input className="h-8 text-xs" placeholder={t("namePlaceholder")} value={name} onChange={(e) => plan.setName(kind, e.target.value)} />
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" className="h-7 gap-1 text-xs" disabled={busy !== null || !dirty} onClick={() => void save()}>
              <Save className="h-3.5 w-3.5" /> {t("save")}
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy !== null || itemCount === 0} onClick={() => void save(true)}>
              {t("saveAs")}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => fileRef.current?.click()}>
              <FileUp className="h-3.5 w-3.5" /> {t("import")}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" disabled={itemCount === 0} onClick={exportFile}>
              <FileDown className="h-3.5 w-3.5" /> {t("export")}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".waypoints,.txt,.geojson,.json,.kml,.kmz"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importFile(f);
                e.target.value = "";
              }}
            />
          </div>
        </div>

        {/* Vehicle transfer */}
        <div className="flex items-center gap-2">
          <Button size="sm" className="flex-1 gap-1.5" disabled={!canCommand || transferring || itemCount === 0 || errors.length > 0} onClick={() => setConfirmUpload(true)}>
            <Upload className={`h-3.5 w-3.5 ${busy === "upload" ? "animate-pulse" : ""}`} /> {busy === "upload" ? t("uploading") : t("upload")}
          </Button>
          <Button size="sm" variant="secondary" className="flex-1 gap-1.5" disabled={!canCommand || transferring} onClick={() => void download()}>
            <Download className={`h-3.5 w-3.5 ${busy === "download" ? "animate-pulse" : ""}`} /> {busy === "download" ? t("downloading") : t("download")}
          </Button>
          {verified === "ok" && <CheckCircle2 className="h-4 w-4 shrink-0 text-status-online" aria-label={t("verifiedOk")} />}
          {verified === "mismatch" && <XCircle className="h-4 w-4 shrink-0 text-status-alarm" aria-label={t("verifiedBad")} />}
        </div>
        {!canCommand && <p className="text-xs text-muted-foreground">{t("needControl")}</p>}

        {kind === "mission" && (
          <>
            <div className="grid grid-cols-4 gap-1.5 rounded-md bg-muted/30 p-2 text-center text-[11px] tabular-nums">
              <span>
                <b className="block text-sm">{formatDistance(stats.distance)}</b>
                {t("statDistance")}
              </span>
              <span>
                <b className="block text-sm">{formatDuration(stats.duration)}</b>
                {t("statTime")}
              </span>
              <span>
                <b className="block text-sm">{family === "copter" ? `${stats.maxAlt} m` : "—"}</b>
                {t("statMaxAlt")}
              </span>
              <span>
                <b className="block text-sm">{formatDistance(stats.maxFromHome)}</b>
                {t("statFar")}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Button size="sm" variant={draw === "addWp" ? "default" : "outline"} className="h-7 gap-1 text-xs" onClick={() => plan.setDraw(draw === "addWp" ? "none" : "addWp")}>
                <MapPinPlus className="h-3.5 w-3.5" /> {draw === "addWp" ? t("adding") : t("addWp")}
              </Button>
              <Button size="sm" variant={draw === "survey" ? "default" : "outline"} className="h-7 gap-1 text-xs" onClick={() => plan.setDraw(draw === "survey" ? "none" : "survey")}>
                <ScanLine className="h-3.5 w-3.5" /> {t("surveyTool")}
              </Button>
              <Button size="sm" variant={draw === "orbit" ? "default" : "outline"} className="h-7 gap-1 text-xs" onClick={() => plan.setDraw(draw === "orbit" ? "none" : "orbit")}>
                <Orbit className="h-3.5 w-3.5" /> {t("orbitTool")}
              </Button>
              <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" disabled={plan.mission.items.length === 0} onClick={() => setResumeOpen(true)}>
                <History className="h-3.5 w-3.5" /> {t("resume")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1 text-xs"
                disabled={!gcsState?.pos}
                onClick={() => gcsState?.pos && plan.setHome(gcsState.pos.lat, gcsState.pos.lon, gcsState.home?.alt ?? gcsState.pos.alt - gcsState.pos.rel)}
              >
                <Home className="h-3.5 w-3.5" /> {t("homeHere")}
              </Button>
              <label className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground">
                {t("defaultAlt")}
                <Input
                  className="h-7 w-14 px-1 text-xs"
                  inputMode="decimal"
                  value={plan.defaultAlt}
                  onChange={(e) => plan.setDefaults(Number(e.target.value) || 0, plan.defaultFrame)}
                />
              </label>
            </div>
            {draw === "survey" && (
              <div className="flex items-center gap-2 rounded-md border border-sky-500/40 bg-sky-500/5 p-2 text-xs">
                <span className="flex-1">{t("surveyHint", { n: drawPoints.length })}</span>
                <Button size="sm" className="h-7" disabled={drawPoints.length < 3} onClick={() => setSurveyOpen(true)}>
                  {t("surveyNext")}
                </Button>
              </div>
            )}
            {draw === "addWp" && <p className="text-xs text-primary">{t("addHint")}</p>}
            {draw === "orbit" && <p className="text-xs text-primary">{t("orbitHint")}</p>}
          </>
        )}

        {issues.length > 0 && (
          <ul className="max-h-24 space-y-0.5 overflow-y-auto text-xs">
            {issues.map((i, k) => (
              <li key={k} className={i.level === "error" ? "text-status-alarm" : i.level === "warn" ? "text-status-warning" : "text-muted-foreground"}>
                {i.item ? `#${i.item} ` : ""}
                {t(`issue.${i.key}`, i.params ?? {})}
              </li>
            ))}
          </ul>
        )}

        <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
          {kind === "mission" && <ItemTable vehicle={family} issues={issues} editable />}
          {kind === "fence" && <FencePanel editable canCommand={canCommand} circleRadius={circleRadius} setCircleRadius={setCircleRadius} />}
          {kind === "rally" && <RallyPanel editable />}
        </div>
      </div>

      <div className="h-[60vh] min-h-[360px] lg:h-auto lg:flex-1">
        <GcsMap
          state={gcsState}
          trail={trail}
          target={null}
          canCommand={false}
          contextMenu={false}
          follow={false}
          onMapClick={onMapClick}
          cursor={draw !== "none" ? "crosshair" : undefined}
          vehicleLabel={vehicle.name}
        >
          <PlanOverlay editable />
        </GcsMap>
      </div>

      <ConfirmDialog
        open={confirmUpload}
        onOpenChange={setConfirmUpload}
        title={t("uploadTitle", { kind: t(`kind_${kind}`) })}
        description={t("uploadDescription", { n: itemCount, via: viaDirect() ? t("viaDirect") : t("viaCloud") })}
        destructive={false}
        onConfirm={() => void upload()}
      />
      <ConfirmDialog open={confirmDelete} onOpenChange={setConfirmDelete} title={t("deleteTitle", { name })} onConfirm={() => void remove()} />
      <SurveyDialog open={surveyOpen} onOpenChange={setSurveyOpen} vehicle={family} />
      <OrbitDialog
        centre={orbitAt}
        onClose={() => setOrbitAt(null)}
        vehicle={family}
        startBearing={orbitAt && gcsState?.pos ? bearingDeg(orbitAt.lat, orbitAt.lon, gcsState.pos.lat, gcsState.pos.lon) : null}
      />
      <Dialog open={resumeOpen} onOpenChange={setResumeOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("resumeTitle")}</DialogTitle>
            <DialogDescription>{family === "copter" ? t("resumeCopter") : t("resumeRover")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <Label htmlFor="resume-at">{t("resumeAt", { max: plan.mission.items.length })}</Label>
            <Input id="resume-at" inputMode="numeric" value={resumeAt} onChange={(e) => setResumeAt(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setResumeOpen(false)}>
              {t("cancel")}
            </Button>
            <Button disabled={!(Number(resumeAt) >= 1 && Number(resumeAt) <= plan.mission.items.length)} onClick={doResume}>
              {t("resumeCreate")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
