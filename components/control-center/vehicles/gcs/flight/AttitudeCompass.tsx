"use client";

import { useEffect, useRef } from "react";

import { homeVector, ringAngle } from "@/lib/control-center/vehicles/gcs/flyView";
import type { VehicleStateV2 } from "@/lib/control-center/vehicles/types";

const SKY = "#3b7ec8";
const GROUND = "#8a5a2b";
const FG = "#ffffff";
const ACCENT = "#ffb000";
const HOME = "#3ddc84";
const NORTH = "#ff5a5a";

const rad = (d: number) => (d * Math.PI) / 180;

/**
 * QGroundControl's instrument: an attitude ball inside a heading-up compass
 * ring, with the heading in a box underneath and home marked on the ring.
 * Sized by its container (a square); nothing is drawn as 0 when unknown.
 */
export function AttitudeCompass({ state, stale, label }: { state: VehicleStateV2 | null; stale: boolean; label: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sizeRef = useRef({ s: 0, dpr: 1 });
  const propsRef = useRef({ state, stale });
  propsRef.current = { state, stale };

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const s = Math.min(wrap.clientWidth, wrap.clientHeight);
      sizeRef.current = { s, dpr };
      canvas.width = Math.round(s * dpr);
      canvas.height = Math.round(s * dpr);
      canvas.style.width = `${s}px`;
      canvas.style.height = `${s}px`;
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
    const ctx = canvas?.getContext("2d");
    const { s, dpr } = sizeRef.current;
    if (!canvas || !ctx || s === 0) return;
    const { state: st, stale: isStale } = propsRef.current;
    const live = st && !isStale && st.fc.ok ? st : null;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, s, s);

    const c = s / 2;
    const R = c - 1;
    const ring = Math.max(14, s * 0.15);
    const r = R - ring;
    const font = (px: number, bold = false) => `${bold ? "600 " : ""}${px}px ui-sans-serif, system-ui, sans-serif`;

    // Dial background.
    ctx.fillStyle = "rgba(10,12,16,0.82)";
    ctx.beginPath();
    ctx.arc(c, c, R, 0, Math.PI * 2);
    ctx.fill();

    // --- attitude ball ---------------------------------------------------
    const att = live?.att ?? null;
    ctx.save();
    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
    ctx.clip();
    if (att) {
      const pxPerDeg = r / 35;
      ctx.translate(c, c);
      ctx.rotate(rad(-att.r));
      const y0 = att.p * pxPerDeg;
      ctx.fillStyle = SKY;
      ctx.fillRect(-2 * r, -3 * r + y0, 4 * r, 3 * r);
      ctx.fillStyle = GROUND;
      ctx.fillRect(-2 * r, y0, 4 * r, 3 * r);
      ctx.strokeStyle = FG;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-2 * r, y0);
      ctx.lineTo(2 * r, y0);
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.fillStyle = FG;
      ctx.font = font(Math.max(8, s * 0.055));
      ctx.textBaseline = "middle";
      for (const p of [-20, -10, 10, 20]) {
        const y = y0 - p * pxPerDeg;
        const half = r * (Math.abs(p) === 20 ? 0.3 : 0.18);
        ctx.beginPath();
        ctx.moveTo(-half, y);
        ctx.lineTo(half, y);
        ctx.stroke();
        if (s >= 110) {
          ctx.textAlign = "left";
          ctx.fillText(String(Math.abs(p)), half + 3, y);
        }
      }
    } else {
      ctx.fillStyle = "#2a2f38";
      ctx.fillRect(0, 0, s, s);
    }
    ctx.restore();

    // Roll scale (fixed) and pointer (turns with the horizon).
    ctx.strokeStyle = FG;
    ctx.lineWidth = 1.25;
    for (const a of [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60]) {
      const t = rad(a - 90);
      const len = a % 30 === 0 ? r * 0.12 : r * 0.07;
      ctx.beginPath();
      ctx.moveTo(c + Math.cos(t) * r, c + Math.sin(t) * r);
      ctx.lineTo(c + Math.cos(t) * (r - len), c + Math.sin(t) * (r - len));
      ctx.stroke();
    }
    if (att) {
      const t = rad(-att.r - 90);
      const tip = r - r * 0.13;
      ctx.save();
      ctx.translate(c + Math.cos(t) * tip, c + Math.sin(t) * tip);
      ctx.rotate(t + Math.PI / 2);
      ctx.fillStyle = ACCENT;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-r * 0.07, r * 0.12);
      ctx.lineTo(r * 0.07, r * 0.12);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Aircraft symbol.
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = Math.max(2, s * 0.02);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(c - r * 0.55, c);
    ctx.lineTo(c - r * 0.2, c);
    ctx.lineTo(c - r * 0.1, c + r * 0.1);
    ctx.moveTo(c + r * 0.55, c);
    ctx.lineTo(c + r * 0.2, c);
    ctx.lineTo(c + r * 0.1, c + r * 0.1);
    ctx.stroke();
    ctx.fillStyle = ACCENT;
    ctx.beginPath();
    ctx.arc(c, c, Math.max(2, s * 0.018), 0, Math.PI * 2);
    ctx.fill();

    // --- compass ring (heading up) ----------------------------------------
    const hdg = live ? live.hdg ?? live.att?.y ?? null : null;
    const onRing = (bearing: number, rr: number) => {
      const t = rad(ringAngle(bearing, hdg ?? 0) - 90);
      return { x: c + Math.cos(t) * rr, y: c + Math.sin(t) * rr };
    };
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
    ctx.stroke();
    if (hdg !== null) {
      ctx.strokeStyle = FG;
      for (let b = 0; b < 360; b += 10) {
        const major = b % 30 === 0;
        const a = onRing(b, R - 1);
        const z = onRing(b, R - (major ? ring * 0.32 : ring * 0.18));
        ctx.lineWidth = major ? 1.5 : 1;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(z.x, z.y);
        ctx.stroke();
      }
      ctx.font = font(Math.max(9, ring * 0.52), true);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const [b, txt] of [
        [0, "N"],
        [90, "E"],
        [180, "S"],
        [270, "W"],
      ] as const) {
        const p = onRing(b, R - ring * 0.62);
        ctx.fillStyle = b === 0 ? NORTH : FG;
        ctx.fillText(txt, p.x, p.y);
      }
      const home = homeVector(live);
      if (home) {
        const p = onRing(home.bearing, R - ring * 0.5);
        const hr = Math.max(6, ring * 0.36);
        ctx.fillStyle = HOME;
        ctx.beginPath();
        ctx.arc(p.x, p.y, hr, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#06240f";
        ctx.font = font(hr * 1.2, true);
        ctx.fillText("H", p.x, p.y + 0.5);
      }
    }

    // Lubber line: fixed pointer at the top.
    ctx.fillStyle = FG;
    ctx.beginPath();
    ctx.moveTo(c, ring * 0.55);
    ctx.lineTo(c - ring * 0.3, 0.5);
    ctx.lineTo(c + ring * 0.3, 0.5);
    ctx.closePath();
    ctx.fill();

    // Heading readout under the ball.
    const text = hdg === null ? "—" : `${Math.round(hdg) % 360}°`;
    ctx.font = font(Math.max(10, s * 0.085), true);
    const tw = ctx.measureText(text).width + s * 0.06;
    const th = Math.max(14, s * 0.12);
    const by = c + r * 0.5;
    ctx.fillStyle = "rgba(0,0,0,0.8)";
    ctx.fillRect(c - tw / 2, by, tw, th);
    ctx.fillStyle = FG;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, c, by + th / 2 + 0.5);

    if (!live) {
      ctx.fillStyle = "rgba(20,20,20,0.45)";
      ctx.beginPath();
      ctx.arc(c, c, R, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  return (
    <div ref={wrapRef} className="flex h-full w-full items-center justify-center">
      <canvas ref={canvasRef} className="block" role="img" aria-label={label} />
    </div>
  );
}
