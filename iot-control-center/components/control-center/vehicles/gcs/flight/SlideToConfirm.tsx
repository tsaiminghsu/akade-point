"use client";

import { useRef, useState } from "react";
import { ChevronsRight } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Slide-to-confirm (QGroundControl style) for actions a stray click must not
 * trigger, such as arming. Keyboard users can focus the handle and press
 * Enter twice within two seconds.
 */
export function SlideToConfirm({
  label,
  onConfirm,
  disabled,
  tone = "warn",
}: {
  label: string;
  onConfirm: () => void;
  disabled?: boolean;
  tone?: "warn" | "danger";
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [x, setX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startRef = useRef(0);
  const armedKeyRef = useRef(0);
  const HANDLE = 36;

  const max = () => (trackRef.current?.clientWidth ?? 200) - HANDLE - 4;

  function onPointerDown(e: React.PointerEvent) {
    if (disabled) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    startRef.current = e.clientX - x;
    setDragging(true);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragging) return;
    setX(Math.max(0, Math.min(max(), e.clientX - startRef.current)));
  }
  function onPointerUp() {
    if (!dragging) return;
    setDragging(false);
    if (x >= max() * 0.92) onConfirm();
    setX(0);
  }
  function onKeyDown(e: React.KeyboardEvent) {
    if (disabled || (e.key !== "Enter" && e.key !== " ")) return;
    e.preventDefault();
    const now = Date.now();
    if (now - armedKeyRef.current < 2000) {
      armedKeyRef.current = 0;
      onConfirm();
    } else {
      armedKeyRef.current = now;
    }
  }

  return (
    <div
      ref={trackRef}
      className={cn(
        "relative h-10 w-full select-none overflow-hidden rounded-md border text-sm",
        tone === "danger" ? "border-status-alarm/60 bg-status-alarm/10" : "border-status-warning/60 bg-status-warning/10",
        disabled && "opacity-40"
      )}
    >
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center pl-8 font-medium text-foreground/80">{label}</span>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-disabled={disabled}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
        className={cn(
          "absolute top-0.5 flex h-[34px] w-9 touch-none items-center justify-center rounded text-background shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          tone === "danger" ? "bg-status-alarm" : "bg-status-warning",
          dragging ? "" : "transition-[left] duration-200",
          disabled ? "cursor-not-allowed" : "cursor-grab"
        )}
        style={{ left: 2 + x }}
      >
        <ChevronsRight className="h-4 w-4" />
      </div>
    </div>
  );
}
