"use client";

import { useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FRAMES, cmdMeta, commandsFor, type VehicleFamily } from "@/lib/control-center/vehicles/plan/mavCmdMeta";
import type { PlanItem } from "@/lib/control-center/vehicles/plan/planModel";
import type { PlanIssue } from "@/lib/control-center/vehicles/plan/missionTools";
import { cn } from "@/lib/utils";
import { usePlanStore } from "@/store/usePlanStore";

function NumField({ label, value, onChange, step = "any", disabled }: { label: string; value: number; onChange: (v: number) => void; step?: string; disabled?: boolean }) {
  return (
    <label className="flex min-w-0 flex-col gap-0.5 text-[10px] text-muted-foreground">
      <span className="truncate">{label}</span>
      <Input
        type="number"
        step={step}
        disabled={disabled}
        className="h-7 px-1.5 text-xs tabular-nums"
        value={Number.isFinite(value) ? value : ""}
        onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
      />
    </label>
  );
}

/** The mission's items; the selected one expands to edit command, altitude and parameters. */
export function ItemTable({ vehicle, issues, editable }: { vehicle: VehicleFamily; issues: PlanIssue[]; editable: boolean }) {
  const t = useTranslations("Gcs.plan");
  const items = usePlanStore((s) => s.mission.items);
  const selected = usePlanStore((s) => s.selected);
  const select = usePlanStore((s) => s.select);
  const updateItem = usePlanStore((s) => s.updateItem);
  const moveItem = usePlanStore((s) => s.moveItem);
  const removeItem = usePlanStore((s) => s.removeItem);
  const cmds = commandsFor("mission", vehicle);

  if (items.length === 0) return <p className="py-6 text-center text-xs text-muted-foreground">{t("emptyMission")}</p>;

  const issueFor = (n: number) => issues.filter((i) => i.item === n && i.level !== "info");

  return (
    <ol className="space-y-1">
      {items.map((it, i) => {
        const n = i + 1;
        const meta = cmdMeta(it.cmd);
        const isSel = it.key === selected;
        const problems = issueFor(n);
        return (
          <li
            key={it.key}
            className={cn(
              "rounded-md border px-2 py-1.5 text-xs",
              isSel ? "border-primary bg-primary/5" : "border-border/60 hover:border-border",
              problems.some((p) => p.level === "error") && "border-status-alarm/60"
            )}
          >
            <button type="button" className="flex w-full items-center gap-2 text-left" onClick={() => select(isSel ? null : it.key)}>
              <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white", meta?.nav ? "bg-blue-600" : "bg-violet-600")}>{n}</span>
              <span className="min-w-0 flex-1 truncate font-medium text-foreground">{meta ? t(`cmd.${meta.key}`) : `MAV_CMD ${it.cmd}`}</span>
              {meta?.loc && !meta.noAlt && vehicle === "copter" && <span className="tabular-nums text-muted-foreground">{it.alt} m</span>}
              {problems.length > 0 && <span className={problems.some((p) => p.level === "error") ? "text-status-alarm" : "text-status-warning"}>!</span>}
            </button>
            {isSel && (
              <div className="mt-2 space-y-2">
                {problems.map((p, k) => (
                  <p key={k} className={p.level === "error" ? "text-status-alarm" : "text-status-warning"}>
                    {t(`issue.${p.key}`, p.params ?? {})}
                  </p>
                ))}
                <Select value={String(it.cmd)} disabled={!editable} onValueChange={(v) => updateItem(it.key, { cmd: Number(v) })}>
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {cmds.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)} className="text-xs">
                        {t(`cmd.${c.key}`)} <span className="text-muted-foreground">({c.id})</span>
                      </SelectItem>
                    ))}
                    {!meta && <SelectItem value={String(it.cmd)}>MAV_CMD {it.cmd}</SelectItem>}
                  </SelectContent>
                </Select>
                {meta?.loc && (
                  <div className="grid grid-cols-3 gap-1.5">
                    <NumField label={t("lat")} value={it.lat} disabled={!editable} onChange={(v) => updateItem(it.key, { lat: v })} />
                    <NumField label={t("lon")} value={it.lon} disabled={!editable} onChange={(v) => updateItem(it.key, { lon: v })} />
                    {!meta.noAlt && <NumField label={t("altM")} value={it.alt} disabled={!editable} onChange={(v) => updateItem(it.key, { alt: v })} />}
                  </div>
                )}
                {meta?.loc && !meta.noAlt && vehicle === "copter" && (
                  <Select value={String(it.frame)} disabled={!editable} onValueChange={(v) => updateItem(it.key, { frame: Number(v) })}>
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FRAMES.map((f) => (
                        <SelectItem key={f.id} value={String(f.id)} className="text-xs">
                          {t(`frame.${f.key}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {meta && meta.params.some(Boolean) && (
                  <div className="grid grid-cols-2 gap-1.5">
                    {meta.params.map((label, k) =>
                      label ? (
                        <NumField
                          key={k}
                          label={t(`param.${label}`)}
                          value={[it.p1, it.p2, it.p3, it.p4][k]}
                          disabled={!editable}
                          onChange={(v) => updateItem(it.key, { [`p${k + 1}`]: v } as Partial<PlanItem>)}
                        />
                      ) : null
                    )}
                  </div>
                )}
                {editable && (
                  <div className="flex justify-end gap-1">
                    <Button size="icon-sm" variant="ghost" aria-label={t("moveUp")} disabled={i === 0} onClick={() => moveItem(it.key, -1)}>
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon-sm" variant="ghost" aria-label={t("moveDown")} disabled={i === items.length - 1} onClick={() => moveItem(it.key, 1)}>
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon-sm" variant="ghost" className="text-status-alarm" aria-label={t("remove")} onClick={() => removeItem(it.key)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
