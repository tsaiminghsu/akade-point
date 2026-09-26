"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { checkValue, formatValue, type ParamMeta } from "@/lib/control-center/vehicles/params/params";
import { cn } from "@/lib/utils";

/**
 * Edits one parameter the way its metadata suggests: a list for enumerated
 * values, checkboxes for bitmasks, a number field otherwise. Range problems
 * are shown, not blocked (the autopilot has the final say).
 */
export function ParamValueEditor({
  name,
  value,
  original,
  meta,
  disabled,
  onChange,
  showBits = false,
}: {
  name: string;
  value: number | undefined;
  original: number | undefined;
  meta?: ParamMeta;
  disabled?: boolean;
  onChange: (v: number | null) => void;
  showBits?: boolean;
}) {
  const t = useTranslations("Gcs.params");
  const [text, setText] = useState(value === undefined ? "" : formatValue(value));
  useEffect(() => setText(value === undefined ? "" : formatValue(value)), [value]);

  const changed = value !== undefined && original !== undefined && Math.fround(value) !== Math.fround(original);
  const problem = value !== undefined ? checkValue(meta, value) : null;

  if (meta?.values && (value === undefined || String(value) in meta.values)) {
    return (
      <div className="min-w-0">
        <Select value={value === undefined ? undefined : String(value)} disabled={disabled || value === undefined} onValueChange={(v) => onChange(Number(v))}>
          <SelectTrigger className={cn("h-7 text-xs", changed && "border-status-warning")} aria-label={name}>
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(meta.values).map(([k, label]) => (
              <SelectItem key={k} value={k} className="text-xs">
                {k}: {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-1">
      <div className="flex items-center gap-1">
        <Input
          className={cn("h-7 px-1.5 text-xs tabular-nums", changed && "border-status-warning", problem && "border-status-alarm")}
          inputMode="decimal"
          disabled={disabled || value === undefined}
          value={text}
          aria-label={name}
          onChange={(e) => {
            setText(e.target.value);
            const n = Number(e.target.value);
            if (e.target.value.trim() !== "" && Number.isFinite(n)) onChange(n);
          }}
          onBlur={() => setText(value === undefined ? "" : formatValue(value))}
        />
        {meta?.units && <span className="shrink-0 text-[10px] text-muted-foreground">{meta.units}</span>}
      </div>
      {problem && <p className="text-[10px] text-status-alarm">{t(`problem_${problem}`, { lo: meta?.range?.[0] ?? "", hi: meta?.range?.[1] ?? "" })}</p>}
      {showBits && meta?.bitmask && value !== undefined && (
        <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-2">
          {Object.entries(meta.bitmask).map(([bit, label]) => {
            const mask = 1 << Number(bit);
            const on = (Math.round(value) & mask) !== 0;
            return (
              <label key={bit} className="flex items-center gap-1.5 text-[11px]">
                <Checkbox aria-label={label} checked={on} disabled={disabled} onCheckedChange={(c) => onChange(c ? Math.round(value) | mask : Math.round(value) & ~mask)} />
                {label}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
