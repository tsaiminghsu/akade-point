"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check, Circle, Flag, Hexagon, RefreshCw, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { usePlanStore } from "@/store/usePlanStore";
import { useGcsStore } from "@/store/useGcsStore";

const FENCE_PARAMS = ["FENCE_ENABLE", "FENCE_TYPE", "FENCE_ACTION", "FENCE_ALT_MAX", "FENCE_RADIUS", "FENCE_MARGIN"] as const;
type FenceParams = Partial<Record<(typeof FENCE_PARAMS)[number], number>>;

/** FENCE_TYPE bits (ArduPilot). */
const TYPE_BITS = [
  { bit: 1, key: "typeAltMax" },
  { bit: 2, key: "typeCircle" },
  { bit: 4, key: "typePolygon" },
  { bit: 8, key: "typeAltMin" },
] as const;

export function FencePanel({ editable, canCommand, circleRadius, setCircleRadius }: { editable: boolean; canCommand: boolean; circleRadius: number; setCircleRadius: (r: number) => void }) {
  const t = useTranslations("Gcs.plan.fence");
  const fence = usePlanStore((s) => s.fence);
  const draw = usePlanStore((s) => s.draw);
  const drawPoints = usePlanStore((s) => s.drawPoints);
  const setDraw = usePlanStore((s) => s.setDraw);
  const finishPolygon = usePlanStore((s) => s.finishPolygon);
  const updateFence = usePlanStore((s) => s.updateFence);
  const setFenceReturn = usePlanStore((s) => s.setFenceReturn);
  const sendAndWait = useGcsStore((s) => s.sendAndWait);

  const [params, setParams] = useState<FenceParams | null>(null);
  const [edits, setEdits] = useState<FenceParams>({});
  const [busy, setBusy] = useState(false);

  const merged: FenceParams = { ...params, ...edits };
  const polygonsWithoutBit = fence.polygons.length > 0 && merged.FENCE_TYPE !== undefined && (merged.FENCE_TYPE & 4) === 0;

  async function readParams() {
    setBusy(true);
    const res = await sendAndWait({ type: "param_get", names: [...FENCE_PARAMS] }, { timeoutMs: 60_000 });
    setBusy(false);
    const values = (res?.result?.params ?? null) as FenceParams | null;
    if (!values) {
      toast.error(t("readFailed"));
      return;
    }
    setParams(values);
    setEdits({});
  }

  async function writeParams() {
    const changed = Object.fromEntries(Object.entries(edits).filter(([k, v]) => params?.[k as keyof FenceParams] !== v)) as Record<string, number>;
    if (Object.keys(changed).length === 0) return;
    setBusy(true);
    const res = await sendAndWait({ type: "param_set", params: changed }, { timeoutMs: 90_000 });
    setBusy(false);
    if (res?.status === "acked") {
      toast.success(t("written"));
      setParams({ ...params, ...changed });
      setEdits({});
    } else {
      toast.error(t("writeFailed", { msg: res?.msg ?? res?.code ?? "" }));
    }
  }

  const drawingPolygon = draw === "polygonIn" || draw === "polygonOut";
  const drawingCircle = draw === "circleIn" || draw === "circleOut";

  return (
    <div className="space-y-4 text-sm">
      {editable && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-1.5">
            <Button size="sm" variant={draw === "polygonIn" ? "default" : "outline"} className="gap-1.5" onClick={() => setDraw(draw === "polygonIn" ? "none" : "polygonIn")}>
              <Hexagon className="h-3.5 w-3.5 text-green-500" /> {t("drawIn")}
            </Button>
            <Button size="sm" variant={draw === "polygonOut" ? "default" : "outline"} className="gap-1.5" onClick={() => setDraw(draw === "polygonOut" ? "none" : "polygonOut")}>
              <Hexagon className="h-3.5 w-3.5 text-red-500" /> {t("drawOut")}
            </Button>
            <Button size="sm" variant={draw === "circleIn" ? "default" : "outline"} className="gap-1.5" onClick={() => setDraw(draw === "circleIn" ? "none" : "circleIn")}>
              <Circle className="h-3.5 w-3.5 text-green-500" /> {t("circleIn")}
            </Button>
            <Button size="sm" variant={draw === "circleOut" ? "default" : "outline"} className="gap-1.5" onClick={() => setDraw(draw === "circleOut" ? "none" : "circleOut")}>
              <Circle className="h-3.5 w-3.5 text-red-500" /> {t("circleOut")}
            </Button>
          </div>
          <Button size="sm" variant={draw === "fenceReturn" ? "default" : "ghost"} className="w-full gap-1.5" onClick={() => setDraw(draw === "fenceReturn" ? "none" : "fenceReturn")}>
            <Flag className="h-3.5 w-3.5" /> {fence.returnPoint ? t("moveReturn") : t("setReturn")}
          </Button>
          {drawingPolygon && (
            <div className="flex items-center gap-2 rounded-md border border-primary/40 bg-primary/5 p-2 text-xs">
              <span className="flex-1">{t("polygonHint", { n: drawPoints.length })}</span>
              <Button size="sm" className="h-7 gap-1" disabled={drawPoints.length < 3} onClick={() => finishPolygon(draw === "polygonIn")}>
                <Check className="h-3.5 w-3.5" /> {t("finish")}
              </Button>
              <Button size="icon-sm" variant="ghost" aria-label={t("cancel")} onClick={() => setDraw("none")}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
          {drawingCircle && (
            <div className="flex items-center gap-2 rounded-md border border-primary/40 bg-primary/5 p-2 text-xs">
              <span className="flex-1">{t("circleHint")}</span>
              <Input className="h-7 w-20" inputMode="decimal" value={circleRadius} onChange={(e) => setCircleRadius(Number(e.target.value) || 0)} aria-label={t("radius")} />
              <span>m</span>
            </div>
          )}
        </div>
      )}

      <ul className="space-y-1 text-xs">
        {fence.polygons.map((p, i) => (
          <li key={p.key} className="flex items-center gap-2 rounded border border-border/60 px-2 py-1">
            <Hexagon className={`h-3.5 w-3.5 ${p.inclusion ? "text-green-500" : "text-red-500"}`} />
            <span className="flex-1">{t(p.inclusion ? "polygonIn" : "polygonOut", { n: i + 1, v: p.points.length })}</span>
            {editable && (
              <Button size="icon-sm" variant="ghost" className="text-status-alarm" aria-label={t("remove")} onClick={() => updateFence((f) => ({ ...f, polygons: f.polygons.filter((x) => x.key !== p.key) }))}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </li>
        ))}
        {fence.circles.map((c, i) => (
          <li key={c.key} className="flex items-center gap-2 rounded border border-border/60 px-2 py-1">
            <Circle className={`h-3.5 w-3.5 ${c.inclusion ? "text-green-500" : "text-red-500"}`} />
            <span className="flex-1">{t(c.inclusion ? "circleInItem" : "circleOutItem", { n: i + 1 })}</span>
            <Input
              className="h-6 w-16 px-1 text-xs"
              inputMode="decimal"
              disabled={!editable}
              value={c.radius}
              onChange={(e) => updateFence((f) => ({ ...f, circles: f.circles.map((x) => (x.key === c.key ? { ...x, radius: Number(e.target.value) || 0 } : x)) }))}
              aria-label={t("radius")}
            />
            <span>m</span>
            {editable && (
              <Button size="icon-sm" variant="ghost" className="text-status-alarm" aria-label={t("remove")} onClick={() => updateFence((f) => ({ ...f, circles: f.circles.filter((x) => x.key !== c.key) }))}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </li>
        ))}
        {fence.returnPoint && (
          <li className="flex items-center gap-2 rounded border border-border/60 px-2 py-1">
            <Flag className="h-3.5 w-3.5 text-teal-500" />
            <span className="flex-1">{t("returnPoint")}</span>
            {editable && (
              <Button size="icon-sm" variant="ghost" className="text-status-alarm" aria-label={t("remove")} onClick={() => setFenceReturn(null)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </li>
        )}
        {fence.polygons.length === 0 && fence.circles.length === 0 && <li className="text-muted-foreground">{t("empty")}</li>}
      </ul>

      <section className="space-y-2 rounded-md border border-border/60 p-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium">{t("paramsTitle")}</p>
          <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" disabled={!canCommand || busy} onClick={readParams}>
            <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} /> {t("read")}
          </Button>
        </div>
        {!params ? (
          <p className="text-xs text-muted-foreground">{t("paramsHint")}</p>
        ) : (
          <div className="space-y-2 text-xs">
            <label className="flex items-center justify-between">
              {t("enable")}
              <Switch aria-label={t("enable")} checked={(merged.FENCE_ENABLE ?? 0) > 0} onCheckedChange={(v) => setEdits((e) => ({ ...e, FENCE_ENABLE: v ? 1 : 0 }))} />
            </label>
            <div className="grid grid-cols-2 gap-1">
              {TYPE_BITS.map(({ bit, key }) => (
                <label key={bit} className="flex items-center gap-1.5">
                  <Checkbox
                    aria-label={t(key)}
                    checked={((merged.FENCE_TYPE ?? 0) & bit) !== 0}
                    onCheckedChange={(v) => setEdits((e) => ({ ...e, FENCE_TYPE: v ? (merged.FENCE_TYPE ?? 0) | bit : (merged.FENCE_TYPE ?? 0) & ~bit }))}
                  />
                  {t(key)}
                </label>
              ))}
            </div>
            {polygonsWithoutBit && <p className="text-status-alarm">{t("polygonBitMissing")}</p>}
            <div className="grid grid-cols-3 gap-1.5">
              {(["FENCE_ACTION", "FENCE_ALT_MAX", "FENCE_RADIUS"] as const).map((k) => (
                <label key={k} className="flex flex-col gap-0.5 text-[10px] text-muted-foreground">
                  {t(`p_${k}`)}
                  <Input
                    className="h-7 px-1.5 text-xs"
                    inputMode="decimal"
                    value={merged[k] ?? ""}
                    onChange={(e) => setEdits((x) => ({ ...x, [k]: Number(e.target.value) }))}
                  />
                </label>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground">{t("actionHint")}</p>
            <Button size="sm" className="w-full" disabled={!canCommand || busy || Object.keys(edits).length === 0} onClick={writeParams}>
              {t("write")}
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}

export function RallyPanel({ editable }: { editable: boolean }) {
  const t = useTranslations("Gcs.plan.rally");
  const rally = usePlanStore((s) => s.rally);
  const draw = usePlanStore((s) => s.draw);
  const setDraw = usePlanStore((s) => s.setDraw);
  const updateRally = usePlanStore((s) => s.updateRally);
  const removeRally = usePlanStore((s) => s.removeRally);
  return (
    <div className="space-y-3 text-sm">
      {editable && (
        <Button size="sm" variant={draw === "rally" ? "default" : "outline"} className="w-full" onClick={() => setDraw(draw === "rally" ? "none" : "rally")}>
          {draw === "rally" ? t("adding") : t("add")}
        </Button>
      )}
      <p className="text-xs text-muted-foreground">{t("hint")}</p>
      <ul className="space-y-1 text-xs">
        {rally.map((r, i) => (
          <li key={r.key} className="flex items-center gap-2 rounded border border-border/60 px-2 py-1">
            <span className="font-semibold text-amber-600">R{i + 1}</span>
            <span className="flex-1 tabular-nums text-muted-foreground">
              {r.lat.toFixed(6)}, {r.lon.toFixed(6)}
            </span>
            <Input className="h-6 w-16 px-1 text-xs" inputMode="decimal" disabled={!editable} value={r.alt} onChange={(e) => updateRally(r.key, { alt: Number(e.target.value) || 0 })} aria-label={t("alt")} />
            <span>m</span>
            {editable && (
              <Button size="icon-sm" variant="ghost" className="text-status-alarm" aria-label={t("remove")} onClick={() => removeRally(r.key)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </li>
        ))}
        {rally.length === 0 && <li className="text-muted-foreground">{t("empty")}</li>}
      </ul>
    </div>
  );
}
