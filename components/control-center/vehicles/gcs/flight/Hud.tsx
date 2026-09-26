"use client";

import { useEffect, useRef } from "react";

import { headingTicks, horizon, pitchRungs, tapeTicks } from "@/lib/control-center/vehicles/gcs/hud";
import type { VehicleStateV2 } from "@/lib/control-center/vehicles/types";

export interface HudLabels {
  linkLost: string;
  noData: string;
  noAttitude: string;
  armed: string;
  disarmed: string;
  fcLost: string;
}

interface HudProps {
  state: VehicleStateV2 | null;
  stale: boolean;
  /** true once any state has ever arrived */
  everReceived: boolean;
  labels: HudLabels;
  className?: string;
}

const SKY_TOP = "#1d4f91";
const SKY_BOTTOM = "#4a8fd4";
const GROUND_TOP = "#7a5230";
const GROUND_BOTTOM = "#4a3018";
const FG = "#ffffff";
const ACCENT = "#ffd400";
const WARN = "#ff4d4d";
const OK = "#3ddc84";

function fmt(v: number | null | undefined, digits = 0): string {
  return v === null || v === undefined ? "—" : v.toFixed(digits);
}

/**
 * Artificial horizon in the Mission Planner layout: pitch ladder and roll arc
 * in the middle, groundspeed tape on the left, altitude and climb rate on the
 * right, heading tape along the bottom, mode and arming state in the corners.
 * Missing values are drawn as "—"; stale data is greyed out under LINK LOST.
 */
export function Hud({ state, stale, everReceived, labels, className }: HudProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
  const propsRef = useRef({ state, stale, everReceived, labels });
  propsRef.current = { state, stale, everReceived, labels };

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      sizeRef.current = { w, h, dpr };
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      draw();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    resize();
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const id = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(id);
  });

  function draw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { w, h, dpr } = sizeRef.current;
    if (w === 0 || h === 0) return;
    const { state: s, stale: isStale, everReceived: ever, labels: L } = propsRef.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2;
    const pxPerDeg = h / 60; // ±30° of pitch fills the height
    const roll = s?.att?.r ?? 0;
    const pitch = s?.att?.p ?? 0;
    const font = (px: number, bold = false) => `${bold ? "600 " : ""}${px}px ui-monospace, SFMono-Regular, Menlo, monospace`;

    // --- sky / ground ---------------------------------------------------
    const hz = horizon(roll, pitch, cx, cy, pxPerDeg);
    ctx.save();
    ctx.translate(hz.centre.x, hz.centre.y);
    ctx.rotate(hz.angleRad);
    const big = Math.hypot(w, h) * 2;
    const sky = ctx.createLinearGradient(0, -h, 0, 0);
    sky.addColorStop(0, SKY_TOP);
    sky.addColorStop(1, SKY_BOTTOM);
    ctx.fillStyle = sky;
    ctx.fillRect(-big, -big, big * 2, big);
    const ground = ctx.createLinearGradient(0, 0, 0, h);
    ground.addColorStop(0, GROUND_TOP);
    ground.addColorStop(1, GROUND_BOTTOM);
    ctx.fillStyle = ground;
    ctx.fillRect(-big, 0, big * 2, big);
    ctx.strokeStyle = FG;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-big, 0);
    ctx.lineTo(big, 0);
    ctx.stroke();

    // --- pitch ladder (drawn in the rotated, pitch-shifted frame) -------
    if (s?.att) {
      ctx.font = font(10);
      ctx.fillStyle = FG;
      ctx.textBaseline = "middle";
      for (const p of pitchRungs(pitch)) {
        const y = -(p * pxPerDeg);
        const half = Math.abs(p) % 20 === 0 ? w * 0.12 : w * 0.07;
        ctx.lineWidth = 1.5;
        ctx.setLineDash(p < 0 ? [6, 4] : []);
        ctx.beginPath();
        ctx.moveTo(-half, y);
        ctx.lineTo(half, y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.textAlign = "right";
        ctx.fillText(String(Math.abs(p)), -half - 4, y);
        ctx.textAlign = "left";
        ctx.fillText(String(Math.abs(p)), half + 4, y);
      }
    }
    ctx.restore();

    // --- roll arc ---------------------------------------------------------
    const arcR = Math.min(w, h) * 0.38;
    const arcCy = cy;
    ctx.strokeStyle = FG;
    ctx.fillStyle = FG;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, arcCy, arcR, (-150 * Math.PI) / 180, (-30 * Math.PI) / 180);
    ctx.stroke();
    for (const a of [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60]) {
      const t = ((a - 90) * Math.PI) / 180;
      const len = a % 30 === 0 ? 10 : 6;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(t) * arcR, arcCy + Math.sin(t) * arcR);
      ctx.lineTo(cx + Math.cos(t) * (arcR + len), arcCy + Math.sin(t) * (arcR + len));
      ctx.stroke();
    }
    if (s?.att) {
      const t = ((-roll - 90) * Math.PI) / 180;
      const px = cx + Math.cos(t) * (arcR - 2);
      const py = arcCy + Math.sin(t) * (arcR - 2);
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(t + Math.PI / 2);
      ctx.fillStyle = ACCENT;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-6, 10);
      ctx.lineTo(6, 10);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // --- aircraft symbol -------------------------------------------------
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.16, cy);
    ctx.lineTo(cx - w * 0.06, cy);
    ctx.lineTo(cx - w * 0.03, cy + 8);
    ctx.moveTo(cx + w * 0.16, cy);
    ctx.lineTo(cx + w * 0.06, cy);
    ctx.lineTo(cx + w * 0.03, cy + 8);
    ctx.stroke();
    ctx.fillStyle = ACCENT;
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fill();

    // --- side tapes -------------------------------------------------------
    const tapeW = Math.max(46, w * 0.13);
    const tapeH = h * 0.5;
    const tapeTop = cy - tapeH / 2;
    const drawTape = (x: number, value: number | null, pxPerUnit: number, step: number, alignRight: boolean, unit: string) => {
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(x, tapeTop, tapeW, tapeH);
      ctx.beginPath();
      ctx.rect(x, tapeTop, tapeW, tapeH);
      ctx.clip();
      ctx.strokeStyle = FG;
      ctx.fillStyle = FG;
      ctx.font = font(10);
      ctx.textBaseline = "middle";
      if (value !== null) {
        for (const tk of tapeTicks(value, tapeH / 2, pxPerUnit, step)) {
          const y = cy + tk.offset;
          const edge = alignRight ? x : x + tapeW;
          const len = tk.major ? 10 : 5;
          ctx.beginPath();
          ctx.moveTo(edge, y);
          ctx.lineTo(alignRight ? edge + len : edge - len, y);
          ctx.stroke();
          if (tk.major) {
            ctx.textAlign = alignRight ? "left" : "right";
            ctx.fillText(String(Math.round(tk.value)), alignRight ? edge + 13 : edge - 13, y);
          }
        }
      }
      ctx.restore();
      // Readout box.
      ctx.fillStyle = "rgba(0,0,0,0.8)";
      ctx.fillRect(x - 2, cy - 12, tapeW + 4, 24);
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = 1;
      ctx.strokeRect(x - 2, cy - 12, tapeW + 4, 24);
      ctx.fillStyle = FG;
      ctx.font = font(13, true);
      ctx.textAlign = "center";
      ctx.fillText(value === null ? "—" : value.toFixed(1), x + tapeW / 2, cy + 1);
      ctx.font = font(10);
      ctx.fillText(unit, x + tapeW / 2, tapeTop + tapeH + 10);
    };
    drawTape(6, s?.gs ?? null, 12, 1, false, "GS m/s");
    const alt = s?.pos?.rel ?? null;
    drawTape(w - tapeW - 18, alt, 6, 1, true, "ALT m");

    // Vertical speed bar at the far right.
    const vs = s?.vs ?? null;
    const vsX = w - 10;
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(vsX, tapeTop, 6, tapeH);
    if (vs !== null) {
      const clamped = Math.max(-5, Math.min(5, vs));
      const len = (clamped / 5) * (tapeH / 2);
      ctx.fillStyle = clamped >= 0 ? OK : ACCENT;
      ctx.fillRect(vsX, cy - Math.max(len, 0), 6, Math.abs(len));
    }
    ctx.fillStyle = FG;
    ctx.font = font(10);
    ctx.textAlign = "right";
    ctx.fillText(`VS ${fmt(vs, 1)}`, w - 4, tapeTop - 8);

    // --- heading tape ------------------------------------------------------
    const hdg = s?.hdg ?? s?.att?.y ?? null;
    const hTapeH = 22;
    const hTapeY = h - hTapeH - 4;
    const hTapeW = w * 0.56;
    const hTapeX = cx - hTapeW / 2;
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.fillRect(hTapeX, hTapeY, hTapeW, hTapeH);
    ctx.beginPath();
    ctx.rect(hTapeX, hTapeY, hTapeW, hTapeH);
    ctx.clip();
    if (hdg !== null) {
      ctx.strokeStyle = FG;
      ctx.fillStyle = FG;
      ctx.font = font(10);
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      for (const tk of headingTicks(hdg, hTapeW / 2, 3)) {
        const x = cx + tk.offset;
        ctx.beginPath();
        ctx.moveTo(x, hTapeY);
        ctx.lineTo(x, hTapeY + (tk.major ? 7 : 4));
        ctx.stroke();
        if (tk.label) ctx.fillText(tk.label, x, hTapeY + 9);
      }
    }
    ctx.restore();
    ctx.fillStyle = "rgba(0,0,0,0.85)";
    ctx.fillRect(cx - 22, hTapeY - 18, 44, 16);
    ctx.fillStyle = ACCENT;
    ctx.font = font(12, true);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(hdg === null ? "—" : `${Math.round(hdg).toString().padStart(3, "0")}°`, cx, hTapeY - 10);

    // --- corner text --------------------------------------------------------
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.font = font(14, true);
    ctx.fillStyle = FG;
    ctx.fillText(s?.mode ?? "—", 8, 6);
    ctx.textAlign = "right";
    if (s?.armed !== null && s?.armed !== undefined) {
      ctx.fillStyle = s.armed ? WARN : OK;
      ctx.fillText(s.armed ? L.armed : L.disarmed, w - 8, 6);
    }
    ctx.font = font(10);
    ctx.fillStyle = FG;
    ctx.textAlign = "left";
    const bat = s?.bat;
    const batText = bat ? `${fmt(bat.v, 1)}V ${bat.cellV !== null ? `(${bat.cellV.toFixed(2)}/c) ` : ""}${fmt(bat.pct)}%` : "BAT —";
    ctx.fillText(batText, 8, 26);
    const gps = s?.gps;
    ctx.fillText(gps ? `GPS ${gps.fix >= 3 ? "3D" : gps.fix === 2 ? "2D" : "--"} ${fmt(gps.sats)} ${fmt(gps.hdop, 1)}` : "GPS —", 8, 40);
    if (s?.wp && s.wp.dist !== null) {
      ctx.textAlign = "right";
      ctx.fillText(`WP ${s.wp.cur} ${s.wp.dist} m`, w - 8, 26);
    }

    // Pre-arm: show the first failure the way MP does (the Messages tab lists all).
    const firstFail = s?.health?.msgs?.[0];
    if (firstFail && s?.armed === false) {
      ctx.font = font(12, true);
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      const tw = Math.min(w - 20, ctx.measureText(firstFail).width + 16);
      ctx.fillRect(cx - tw / 2, cy + h * 0.14, tw, 20);
      ctx.fillStyle = WARN;
      ctx.fillText(firstFail, cx, cy + h * 0.14 + 4, w - 24);
    }
    if (s && !s.att && !isStale) {
      ctx.font = font(11);
      ctx.textAlign = "center";
      ctx.fillStyle = FG;
      ctx.fillText(L.noAttitude, cx, cy - h * 0.22);
    }

    // --- stale overlay ----------------------------------------------------
    const fcLost = s !== null && s.fc.ok === false;
    if (isStale || !s || fcLost) {
      ctx.fillStyle = "rgba(20,20,20,0.6)";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = WARN;
      ctx.font = font(Math.max(16, Math.min(28, w / 14)), true);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(!ever ? L.noData : fcLost && !isStale ? L.fcLost : L.linkLost, cx, cy);
    }
  }

  return (
    <div ref={wrapRef} className={className ?? "relative h-full w-full overflow-hidden rounded-md bg-black"}>
      <canvas ref={canvasRef} className="block" role="img" aria-label="HUD" />
    </div>
  );
}
