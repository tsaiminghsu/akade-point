"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Download, Pencil, Plus, Trash2, Upload, UploadCloud } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/control-center/shared/EmptyState";
import { ConfirmDialog } from "@/components/control-center/shared/ConfirmDialog";
import { MissionEditorDialog } from "./MissionEditorDialog";
import { parseWaypointsFile, serializeWaypointsFile } from "@/lib/control-center/vehicles/waypoints";
import type { MissionItem, VehicleMission } from "@/lib/control-center/vehicles/types";
import { useVehiclesStore } from "@/store/useVehiclesStore";

export function MissionList({ vehicleId }: { vehicleId: string }) {
  const t = useTranslations("VehicleMissions");
  const tCommon = useTranslations("Common");
  const missions = useVehiclesStore((s) => s.missionsByVehicle[vehicleId] ?? []);
  const fetchMissions = useVehiclesStore((s) => s.fetchMissions);
  const deleteMission = useVehiclesStore((s) => s.deleteMission);
  const issueCommand = useVehiclesStore((s) => s.issueCommand);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<VehicleMission | undefined>(undefined);
  const [seed, setSeed] = useState<{ items: MissionItem[]; name: string } | undefined>(undefined);
  const [deleting, setDeleting] = useState<VehicleMission | undefined>(undefined);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void fetchMissions(vehicleId);
  }, [vehicleId, fetchMissions]);

  function openNew() {
    setEditing(undefined);
    setSeed(undefined);
    setEditorOpen(true);
  }
  function openEdit(m: VehicleMission) {
    setEditing(m);
    setSeed(undefined);
    setEditorOpen(true);
  }

  async function onImportFile(file: File) {
    const text = await file.text();
    const res = parseWaypointsFile(text);
    if (!res.ok) {
      toast.error(t("importError", { error: res.error, line: res.line }));
      return;
    }
    setEditing(undefined);
    setSeed({ items: res.items, name: file.name.replace(/\.waypoints$/i, "") });
    setEditorOpen(true);
    toast.success(t("importedToast", { count: res.items.length }));
  }

  function exportMission(m: VehicleMission) {
    const blob = new Blob([serializeWaypointsFile(m.items)], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${m.name}.waypoints`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function uploadToVehicle(m: VehicleMission) {
    const cmd = await issueCommand(vehicleId, { type: "mission_upload", missionId: m.id });
    if (cmd) toast.success(t("uploadToast"));
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" className="gap-1.5" onClick={openNew}>
          <Plus className="h-3.5 w-3.5" /> {t("newMission")}
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => fileRef.current?.click()}>
          <Upload className="h-3.5 w-3.5" /> {t("import")}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".waypoints,text/plain"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onImportFile(f);
            e.target.value = "";
          }}
        />
      </div>

      {missions.length === 0 ? (
        <EmptyState title={t("empty")} />
      ) : (
        <ul className="space-y-1.5">
          {missions.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{m.name}</p>
                <p className="text-xs text-muted-foreground">
                  {m.items.length} · {m.source}
                </p>
              </div>
              <div className="flex shrink-0 gap-0.5">
                <Button size="icon-sm" variant="ghost" aria-label={t("uploadToVehicle")} onClick={() => uploadToVehicle(m)}>
                  <UploadCloud className="h-3.5 w-3.5" />
                </Button>
                <Button size="icon-sm" variant="ghost" aria-label={t("export")} onClick={() => exportMission(m)}>
                  <Download className="h-3.5 w-3.5" />
                </Button>
                <Button size="icon-sm" variant="ghost" aria-label={tCommon("edit")} onClick={() => openEdit(m)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button size="icon-sm" variant="ghost" className="text-status-alarm" aria-label={t("delete")} onClick={() => setDeleting(m)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <MissionEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        vehicleId={vehicleId}
        mission={editing}
        seedItems={seed?.items}
        seedName={seed?.name}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(undefined)}
        title={deleting?.name ?? ""}
        confirmLabel={tCommon("delete")}
        onConfirm={() => deleting && deleteMission(vehicleId, deleting.id)}
      />
    </div>
  );
}
