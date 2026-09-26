"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Gamepad2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import type { VehicleStateV2 } from "@/lib/control-center/vehicles/types";
import { useGcsStore } from "@/store/useGcsStore";

const SEND_MS = 100;
const DEADZONE = 0.08;
const MAX_YAW_RATE = 1.2; // rad/s

/**
 * Drive a rover from the page: an on-screen stick, or a gamepad's left stick
 * (Gamepad API). Commands stream at 10 Hz over the direct link only and stop
 * the moment the stick is released; the companion adds a 300 ms deadman and
 * ArduPilot its own 3 s timeout. Needs GUIDED and an armed vehicle.
 */
export function RoverDrivePad({ state, canCommand, directOpen }: { state: VehicleStateV2 | null; canCommand: boolean; directOpen: boolean }) {
  const t = useTranslations("Gcs.drive");
  const drive = useGcsStore((s) => s.drive);
  const send = useGcsStore((s) => s.send);
  const padRef = useRef<HTMLDivElement>(null);
  const stick = useRef({ x: 0, y: 0, active: false, source: "none" as "none" | "touch" | "gamepad" });
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const [maxSpeed, setMaxSpeed] = useState(1.0);
  const [gamepad, setGamepad] = useState<string | null>(null);
  const maxSpeedRef = useRef(maxSpeed);
  maxSpeedRef.current = maxSpeed;

  const guided = state?.mode === "GUIDED";
  const armed = state?.armed === true;
  const ready = canCommand && directOpen && guided && armed;
  const readyRef = useRef(ready);
  readyRef.current = ready;

  // Stream while the stick is held, and one zero on release.
  useEffect(() => {
    let wasActive = false;
    const id = setInterval(() => {
      const s = stick.current;
      if (!readyRef.current) {
        wasActive = false;
        return;
      }
      if (s.active) {
        const vx = -s.y * maxSpeedRef.current;
        const yr = s.x * MAX_YAW_RATE;
        drive(Math.abs(s.y) < DEADZONE ? 0 : vx, Math.abs(s.x) < DEADZONE ? 0 : yr);
        wasActive = true;
      } else if (wasActive) {
        drive(0, 0);
        wasActive = false;
      }
    }, SEND_MS);
    return () => clearInterval(id);
  }, [drive]);

  // Gamepad: left stick; releasing it (inside the deadzone) counts as letting go.
  useEffect(() => {
    let raf = 0;
    const poll = () => {
      const pads = navigator.getGamepads?.() ?? [];
      const pad = pads.find((p) => p && p.connected);
      if (pad) {
        const x = pad.axes[0] ?? 0;
        const y = pad.axes[1] ?? 0;
        const moved = Math.abs(x) > DEADZONE || Math.abs(y) > DEADZONE;
        if (stick.current.source !== "touch") {
          stick.current = { x, y, active: moved, source: moved ? "gamepad" : "none" };
          setKnob({ x, y });
        }
        setGamepad((g) => (g === pad.id ? g : pad.id));
      } else {
        setGamepad(null);
      }
      raf = requestAnimationFrame(poll);
    };
    raf = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(raf);
  }, []);

  function update(e: React.PointerEvent) {
    const r = padRef.current!.getBoundingClientRect();
    let x = ((e.clientX - r.left) / r.width) * 2 - 1;
    let y = ((e.clientY - r.top) / r.height) * 2 - 1;
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    stick.current = { x, y, active: true, source: "touch" };
    setKnob({ x, y });
  }
  function release() {
    stick.current = { x: 0, y: 0, active: false, source: "none" };
    setKnob({ x: 0, y: 0 });
  }

  return (
    <div className="space-y-3 text-sm">
      <ul className="space-y-0.5 text-xs">
        <Req ok={directOpen} label={t("reqDirect")} />
        <Req ok={guided} label={t("reqGuided")} />
        <Req ok={armed} label={t("reqArmed")} />
      </ul>
      {!guided && (
        <Button size="sm" variant="secondary" disabled={!canCommand} onClick={() => void send({ type: "set_mode", mode: "GUIDED" })}>
          {t("enterGuided")}
        </Button>
      )}
      <div className="flex items-center gap-4">
        <div
          ref={padRef}
          onPointerDown={(e) => {
            if (!ready) return;
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
            update(e);
          }}
          onPointerMove={(e) => stick.current.source === "touch" && update(e)}
          onPointerUp={release}
          onPointerCancel={release}
          className={`relative h-40 w-40 shrink-0 touch-none rounded-full border-2 ${ready ? "border-primary/60 bg-primary/5" : "border-border bg-muted/30 opacity-60"}`}
          role="application"
          aria-label={t("pad")}
        >
          <div className="absolute left-1/2 top-0 h-full w-px bg-border" />
          <div className="absolute left-0 top-1/2 h-px w-full bg-border" />
          <div
            className="absolute h-12 w-12 rounded-full bg-primary shadow-lg"
            style={{ left: `calc(${(knob.x + 1) * 50}% - 24px)`, top: `calc(${(knob.y + 1) * 50}% - 24px)` }}
          />
        </div>
        <div className="flex-1 space-y-2">
          <label className="text-xs text-muted-foreground">
            {t("maxSpeed")}: <span className="tabular-nums text-foreground">{maxSpeed.toFixed(1)} m/s</span>
          </label>
          <Slider min={0.2} max={3} step={0.1} value={[maxSpeed]} onValueChange={(v) => setMaxSpeed(v[0])} />
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Gamepad2 className="h-3.5 w-3.5" /> {gamepad ? t("gamepadOn", { name: gamepad.slice(0, 32) }) : t("gamepadOff")}
          </p>
          <p className="text-xs text-muted-foreground">{t("hint")}</p>
        </div>
      </div>
    </div>
  );
}

function Req({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className={ok ? "text-status-online" : "text-muted-foreground"}>
      {ok ? "✓" : "○"} {label}
    </li>
  );
}
