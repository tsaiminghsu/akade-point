"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, Settings2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DEFAULT_LAYOUT, fieldsFor, layoutKey, parseLayout, quickValue, type QuickLayout, type QuickTone } from "@/lib/control-center/vehicles/gcs/quickFields";
import type { VehicleStateV2 } from "@/lib/control-center/vehicles/types";

function Tile({ label, value, unit, tone }: { label: string; value: string; unit?: string; tone?: QuickTone }) {
  const color = tone === "bad" ? "text-status-alarm" : tone === "warn" ? "text-status-warning" : "text-foreground";
  return (
    <div className="flex min-w-0 flex-col rounded-md border border-border/60 bg-muted/30 px-2.5 py-1.5">
      <span className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={`truncate text-xl font-semibold tabular-nums leading-tight ${color}`}>
        {value}
        {unit && value !== "—" && <span className="ml-0.5 text-xs font-normal text-muted-foreground">{unit}</span>}
      </span>
    </div>
  );
}

const GRID: Record<QuickLayout["columns"], string> = { 2: "grid-cols-2", 3: "grid-cols-2 sm:grid-cols-3", 4: "grid-cols-2 sm:grid-cols-4" };

const LAYOUT_EVENT = "gcs-layout-change";

/**
 * A field layout remembered in this browser under `key`. Every component
 * using the same key sees a save at once (the quick tab and its dialog, the
 * values bar and its dialog).
 */
export function useStoredLayout(key: string, family: "copter" | "rover", fallback: QuickLayout) {
  const [layout, setLayout] = useState<QuickLayout>(fallback);
  useEffect(() => {
    const load = () => {
      try {
        setLayout(parseLayout(localStorage.getItem(key), family, fallback));
      } catch {
        setLayout(fallback);
      }
    };
    load();
    const onChange = (e: Event) => {
      if ((e as CustomEvent<string>).detail === key) load();
    };
    window.addEventListener(LAYOUT_EVENT, onChange);
    return () => window.removeEventListener(LAYOUT_EVENT, onChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, family]);

  function save(next: QuickLayout) {
    setLayout(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      /* private mode: this session only */
    }
    window.dispatchEvent(new CustomEvent(LAYOUT_EVENT, { detail: key }));
  }
  return [layout, save] as const;
}

/**
 * Mission Planner's "Quick" tab: the numbers a pilot glances at, large. The
 * fields, their order and the columns are the operator's choice, remembered
 * per vehicle type in this browser.
 */
export function QuickPanel({ state, stale, family }: { state: VehicleStateV2 | null; stale: boolean; family: "copter" | "rover" }) {
  const t = useTranslations("Gcs.quick");
  const s = stale ? null : state;
  const [layout, saveLayout] = useStoredLayout(layoutKey(family), family, DEFAULT_LAYOUT[family]);
  const [editing, setEditing] = useState<QuickLayout | null>(null);

  function save(next: QuickLayout) {
    saveLayout(next);
    setEditing(null);
  }

  return (
    <div className="space-y-1.5">
      <div className={`grid gap-1.5 ${GRID[layout.columns]}`}>
        {layout.fields.map((key) => {
          const v = quickValue(key, s);
          return <Tile key={key} label={t(key)} value={v.value} unit={v.unit} tone={v.tone} />;
        })}
      </div>
      <div className="flex justify-end">
        <Button size="sm" variant="ghost" className="h-6 gap-1 px-2 text-[11px] text-muted-foreground" onClick={() => setEditing(layout)}>
          <Settings2 className="h-3 w-3" /> {t("customize")}
        </Button>
      </div>
      {editing && (
        <LayoutDialog
          family={family}
          layout={editing}
          defaults={DEFAULT_LAYOUT[family]}
          title={t("customizeTitle")}
          description={t("customizeDescription")}
          onChange={setEditing}
          onSave={save}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

export function LayoutDialog({
  family,
  layout,
  defaults,
  title,
  description,
  showColumns = true,
  onChange,
  onSave,
  onClose,
}: {
  family: "copter" | "rover";
  layout: QuickLayout;
  defaults: QuickLayout;
  title: string;
  description: string;
  showColumns?: boolean;
  onChange: (l: QuickLayout) => void;
  onSave: (l: QuickLayout) => void;
  onClose: () => void;
}) {
  const t = useTranslations("Gcs.quick");
  const available = fieldsFor(family).map((f) => f.key);
  // Chosen fields in their order, then the rest.
  const rows = [...layout.fields, ...available.filter((k) => !layout.fields.includes(k))];

  function toggle(key: string, on: boolean) {
    onChange({ ...layout, fields: on ? [...layout.fields, key] : layout.fields.filter((k) => k !== key) });
  }

  function move(key: string, dir: -1 | 1) {
    const i = layout.fields.indexOf(key);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= layout.fields.length) return;
    const fields = [...layout.fields];
    [fields[i], fields[j]] = [fields[j], fields[i]];
    onChange({ ...layout, fields });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className={showColumns ? "flex items-center gap-2 text-xs" : "hidden"}>
          <span className="text-muted-foreground">{t("columns")}</span>
          {([2, 3, 4] as const).map((c) => (
            <Button key={c} size="sm" variant={layout.columns === c ? "default" : "outline"} className="h-6 px-2 text-xs" onClick={() => onChange({ ...layout, columns: c })}>
              {c}
            </Button>
          ))}
        </div>
        <ul className="max-h-[50vh] divide-y divide-border/50 overflow-y-auto rounded-md border border-border/60 text-sm">
          {rows.map((key) => {
            const on = layout.fields.includes(key);
            const idx = layout.fields.indexOf(key);
            return (
              <li key={key} className="flex items-center gap-2 px-2 py-1.5">
                <Checkbox id={`qf-${key}`} checked={on} onCheckedChange={(v) => toggle(key, v === true)} />
                <label htmlFor={`qf-${key}`} className={`flex-1 text-xs ${on ? "" : "text-muted-foreground"}`}>
                  {t(key)}
                </label>
                {on && (
                  <>
                    <Button size="icon-sm" variant="ghost" className="h-6 w-6" disabled={idx === 0} onClick={() => move(key, -1)} aria-label={t("moveUp", { name: t(key) })}>
                      <ArrowUp className="h-3 w-3" />
                    </Button>
                    <Button size="icon-sm" variant="ghost" className="h-6 w-6" disabled={idx === layout.fields.length - 1} onClick={() => move(key, 1)} aria-label={t("moveDown", { name: t(key) })}>
                      <ArrowDown className="h-3 w-3" />
                    </Button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={() => onChange(defaults)}>
            {t("reset")}
          </Button>
          <Button disabled={layout.fields.length === 0} onClick={() => onSave(layout)}>
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
