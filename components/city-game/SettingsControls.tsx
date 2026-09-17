'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Settings rows for the pause menu. Styling matches the rest of the game's
 * overlays: inline styles, monospace, dark translucent panels.
 */

const ACCENT = '#00e5ff';
const LABEL = 'rgba(255,255,255,0.82)';
const MUTED = 'rgba(255,255,255,0.35)';
const LINE = 'rgba(255,255,255,0.08)';

/** Slider edits are debounced this long before they reach the renderer. */
const SLIDER_DEBOUNCE_MS = 250;

interface RowProps {
  label: string;
  hint?: string;
  children: React.ReactNode;
  disabled?: boolean;
}

export function SettingsRow({ label, hint, children, disabled }: RowProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        padding: '10px 0',
        borderBottom: `1px solid ${LINE}`,
        opacity: disabled ? 0.4 : 1,
        pointerEvents: disabled ? 'none' : undefined,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, color: LABEL }}>{label}</div>
        {hint && (
          <div style={{ fontSize: 10, color: MUTED, marginTop: 2, lineHeight: 1.4 }}>{hint}</div>
        )}
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}

interface ToggleProps {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}

export function ToggleRow({ label, hint, value, onChange, disabled }: ToggleProps) {
  return (
    <SettingsRow label={label} hint={hint} disabled={disabled}>
      <button
        role="switch"
        aria-checked={value}
        aria-label={label}
        onClick={() => onChange(!value)}
        style={{
          width: 46,
          height: 26,
          minHeight: 26,
          borderRadius: 13,
          border: `1px solid ${value ? ACCENT : 'rgba(255,255,255,0.18)'}`,
          background: value ? 'rgba(0,229,255,0.18)' : 'rgba(255,255,255,0.05)',
          position: 'relative',
          cursor: 'pointer',
          transition: 'background 120ms, border-color 120ms',
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 3,
            left: value ? 23 : 3,
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: value ? ACCENT : 'rgba(255,255,255,0.45)',
            transition: 'left 120ms',
          }}
        />
      </button>
    </SettingsRow>
  );
}

interface Option<T> {
  value: T;
  label: string;
}

interface SegmentedProps<T extends string | number> {
  value: T;
  options: readonly Option<T>[];
  onChange: (v: T) => void;
  isMobile?: boolean;
}

export function SegmentedControl<T extends string | number>({
  value, options, onChange, isMobile,
}: SegmentedProps<T>) {
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={String(opt.value)}
            onClick={() => onChange(opt.value)}
            style={{
              padding: isMobile ? '8px 10px' : '5px 10px',
              minHeight: isMobile ? 36 : undefined,
              fontSize: 11,
              fontFamily: 'monospace',
              borderRadius: 7,
              cursor: 'pointer',
              color: active ? '#06131a' : 'rgba(255,255,255,0.6)',
              background: active ? ACCENT : 'rgba(255,255,255,0.06)',
              border: `1px solid ${active ? ACCENT : 'rgba(255,255,255,0.12)'}`,
              fontWeight: active ? 700 : 400,
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

interface SegmentedRowProps<T extends string | number> extends SegmentedProps<T> {
  label: string;
  hint?: string;
  disabled?: boolean;
}

export function SegmentedRow<T extends string | number>({
  label, hint, disabled, ...rest
}: SegmentedRowProps<T>) {
  return (
    <SettingsRow label={label} hint={hint} disabled={disabled}>
      <SegmentedControl {...rest} />
    </SettingsRow>
  );
}

interface SliderProps {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  disabled?: boolean;
}

/**
 * Drags update the readout immediately but only reach the renderer after a
 * pause — changing shadow map size or a post-processing pass recompiles
 * shaders, which would stutter badly on every intermediate value.
 */
export function SliderRow({
  label, hint, value, min, max, step, onChange, format, disabled,
}: SliderProps) {
  const [local, setLocal] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef(onChange);
  latest.current = onChange;

  // Follow external changes (preset switch, reset) unless mid-drag.
  useEffect(() => {
    if (timer.current === undefined) setLocal(value);
  }, [value]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const handle = useCallback((next: number) => {
    setLocal(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = undefined;
      latest.current(next);
    }, SLIDER_DEBOUNCE_MS);
  }, []);

  return (
    <SettingsRow label={label} hint={hint} disabled={disabled}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <input
          type="range"
          aria-label={label}
          min={min}
          max={max}
          step={step}
          value={local}
          onChange={(e) => handle(parseFloat(e.target.value))}
          style={{ width: 120, accentColor: ACCENT, cursor: 'pointer' }}
        />
        <span
          style={{
            fontSize: 11, color: LABEL, minWidth: 44, textAlign: 'right',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {format ? format(local) : local}
        </span>
      </div>
    </SettingsRow>
  );
}
