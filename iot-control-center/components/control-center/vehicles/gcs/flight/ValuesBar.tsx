"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Settings2 } from "lucide-react";

import { DEFAULT_BAR, barKey, quickValue, type QuickLayout } from "@/lib/control-center/vehicles/gcs/quickFields";
import type { VehicleStateV2 } from "@/lib/control-center/vehicles/types";
import { cn } from "@/lib/utils";
import { LayoutDialog, useStoredLayout } from "./QuickPanel";

const TONE = { bad: "text-red-400", warn: "text-amber-300" } as const;

/**
 * QGroundControl's telemetry values bar: a handful of big numbers floating
 * over the map. The fields are the operator's choice (gear button),
 * remembered per vehicle type in this browser.
 */
export function ValuesBar({ state, stale, family, columns }: { state: VehicleStateV2 | null; stale: boolean; family: "copter" | "rover"; columns: 2 | 3 | 4 }) {
  const t = useTranslations("Gcs.quick");
  const tf = useTranslations("Gcs.flyView");
  const s = stale ? null : state;
  const [layout, save] = useStoredLayout(barKey(family), family, DEFAULT_BAR[family]);
  const [editing, setEditing] = useState<QuickLayout | null>(null);
  const cols = Math.min(columns, layout.fields.length);

  return (
    <div className="relative rounded-lg bg-black/70 py-1.5 pl-2.5 pr-6 text-white shadow-lg backdrop-blur" role="group" aria-label={tf("valuesLabel")}>
      <dl className="grid gap-x-4 gap-y-1" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, auto))` }}>
        {layout.fields.map((key) => {
          const v = quickValue(key, s);
          return (
            <div key={key} className="min-w-0">
              <dt className="break-words text-[10px] leading-tight text-white/70">{t(key)}</dt>
              <dd className={cn("whitespace-nowrap text-base font-semibold leading-tight tabular-nums sm:text-lg", v.tone && TONE[v.tone])}>
                {v.value}
                {v.unit && v.value !== "—" && <span className="ml-0.5 text-[10px] font-normal text-white/70">{v.unit}</span>}
              </dd>
            </div>
          );
        })}
      </dl>
      <button
        type="button"
        onClick={() => setEditing(layout)}
        className="absolute right-1 top-1 rounded p-0.5 text-white/60 hover:bg-white/15 hover:text-white"
        aria-label={tf("valuesCustomize")}
        title={tf("valuesCustomize")}
      >
        <Settings2 className="h-3.5 w-3.5" />
      </button>
      {editing && (
        <LayoutDialog
          family={family}
          layout={editing}
          defaults={DEFAULT_BAR[family]}
          title={tf("valuesCustomize")}
          description={tf("valuesDescription")}
          showColumns={false}
          onChange={setEditing}
          onSave={(next) => {
            save(next);
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
