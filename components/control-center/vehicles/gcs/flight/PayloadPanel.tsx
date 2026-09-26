"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Power, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import type { VehicleStateV2 } from "@/lib/control-center/vehicles/types";
import { useGcsStore } from "@/store/useGcsStore";

const RELAY_RE = /^RELAY(\d+)$/;
const DEFAULT_RELAYS = 4;
const SERVOS = 2;
const PULSE_MS = 500;

/**
 * The ESP32 payload node (or any component publishing NAMED_VALUE_FLOAT):
 * its sensor values, relay switches with a momentary pulse, and servo outputs.
 * Relay state is what the node itself reports back (RELAYn = 0/1), so a
 * switch only flips once the node has acted on the command.
 */
export function PayloadPanel({ state, canCommand }: { state: VehicleStateV2 | null; canCommand: boolean }) {
  const t = useTranslations("Gcs.payload");
  const send = useGcsStore((s) => s.send);
  const nodes = state?.payload ?? [];
  const [comp, setComp] = useState<number | null>(null);
  const node = nodes.find((n) => n.comp === comp) ?? nodes[0] ?? null;
  const [servo, setServo] = useState<number[]>(() => Array(SERVOS).fill(1500));

  const relays = node
    ? Object.entries(node.values)
        .map(([name, v]) => {
          const m = RELAY_RE.exec(name);
          return m ? { index: Number(m[1]), on: v >= 0.5 } : null;
        })
        .filter((r): r is { index: number; on: boolean } => r !== null)
        .sort((a, b) => a.index - b.index)
    : [];
  const relayRows = relays.length > 0 ? relays : Array.from({ length: DEFAULT_RELAYS }, (_, index) => ({ index, on: null as boolean | null }));
  const sensors = node ? Object.entries(node.values).filter(([name]) => !RELAY_RE.test(name)) : [];
  const target = node?.comp;
  const dis = !canCommand;

  return (
    <div className="space-y-4 text-sm">
      {nodes.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {nodes.map((n) => (
            <Button key={n.comp} size="sm" variant={n.comp === node?.comp ? "secondary" : "ghost"} className="h-7 text-xs" onClick={() => setComp(n.comp)}>
              {t("component", { comp: n.comp })}
            </Button>
          ))}
        </div>
      )}

      <section className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">{t("sensors")}</p>
        {sensors.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("noValues")}</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {sensors.map(([name, v]) => (
              <div key={name} className="rounded-md border border-border/60 bg-muted/30 px-2 py-1.5">
                <p className="truncate font-mono text-[10px] text-muted-foreground">{name}</p>
                <p className="text-base font-semibold tabular-nums">{v}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">{t("relays")}</p>
        {relayRows.map((r) => (
          <div key={r.index} className="flex items-center gap-2 rounded-md border border-border/60 px-2 py-1.5">
            <Power className={`h-3.5 w-3.5 ${r.on ? "text-status-online" : "text-muted-foreground"}`} />
            <span className="flex-1 text-xs">{t("relay", { index: r.index })}</span>
            <span className="w-8 text-right text-[10px] text-muted-foreground">{r.on === null ? "—" : r.on ? t("on") : t("off")}</span>
            <Switch
              checked={r.on === true}
              disabled={dis}
              aria-label={t("relay", { index: r.index })}
              onCheckedChange={(on) => void send({ type: "payload_relay", index: r.index, on, comp: target })}
            />
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1 px-2 text-xs"
              disabled={dis}
              title={t("pulseTitle", { ms: PULSE_MS })}
              onClick={() => void send({ type: "payload_pulse", index: r.index, ms: PULSE_MS, comp: target })}
            >
              <Zap className="h-3 w-3" /> {t("pulse")}
            </Button>
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <p className="text-xs font-medium text-muted-foreground">{t("servos")}</p>
        {servo.map((pwm, i) => (
          <div key={i} className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span>{t("servo", { index: i })}</span>
              <span className="tabular-nums text-muted-foreground">{pwm} µs</span>
            </div>
            <Slider
              min={1000}
              max={2000}
              step={10}
              value={[pwm]}
              disabled={dis}
              onValueChange={([v]) => setServo((s) => s.map((x, j) => (j === i ? v : x)))}
              onValueCommit={([v]) => void send({ type: "payload_servo", index: i, pwm: v, comp: target })}
            />
          </div>
        ))}
      </section>

      <p className="text-xs text-muted-foreground">{t("hint")}</p>
    </div>
  );
}
