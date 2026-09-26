'use client';
import { useRef, useState } from 'react';

export interface StickDir { x: -1 | 0 | 1; z: -1 | 0 | 1 }

const RADIUS = 44;
const DEAD = 0.35;

/**
 * Ball-top arcade stick. Output is digital like the real thing's microswitches:
 * each axis is -1/0/1. Pushing up means "away from the player" (-z).
 */
export default function Joystick({ onChange }: { onChange: (d: StickDir) => void }) {
  const base = useRef<HTMLDivElement>(null);
  const last = useRef<StickDir>({ x: 0, z: 0 });
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  const emit = (d: StickDir) => {
    if (d.x !== last.current.x || d.z !== last.current.z) {
      last.current = d;
      onChange(d);
    }
  };

  const track = (e: React.PointerEvent) => {
    const el = base.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    let dx = (e.clientX - (rect.left + rect.width / 2)) / RADIUS;
    let dy = (e.clientY - (rect.top + rect.height / 2)) / RADIUS;
    const m = Math.hypot(dx, dy);
    if (m > 1) { dx /= m; dy /= m; }
    setKnob({ x: dx * RADIUS * 0.6, y: dy * RADIUS * 0.6 });
    const ax = (v: number): -1 | 0 | 1 => (v > DEAD ? 1 : v < -DEAD ? -1 : 0);
    emit({ x: ax(dx), z: ax(dy) });
  };

  const release = () => {
    setKnob({ x: 0, y: 0 });
    emit({ x: 0, z: 0 });
  };

  return (
    <div
      ref={base}
      role="application"
      aria-label="搖桿"
      className="relative h-28 w-28 shrink-0 touch-none select-none rounded-full border-4 border-slate-700 bg-gradient-to-b from-slate-800 to-slate-950 shadow-[inset_0_4px_12px_rgba(0,0,0,0.8)]"
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); track(e); }}
      onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) track(e); }}
      onPointerUp={release}
      onPointerCancel={release}
    >
      {/* gate marks */}
      {['top-1 left-1/2 -translate-x-1/2', 'bottom-1 left-1/2 -translate-x-1/2', 'left-1 top-1/2 -translate-y-1/2', 'right-1 top-1/2 -translate-y-1/2'].map((pos) => (
        <span key={pos} className={`absolute ${pos} h-1.5 w-1.5 rounded-full bg-slate-600`} />
      ))}
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-12 w-12 rounded-full bg-[radial-gradient(circle_at_35%_30%,#fca5a5,#dc2626_55%,#7f1d1d)] shadow-[0_6px_10px_rgba(0,0,0,0.6)]"
        style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }}
      />
    </div>
  );
}
