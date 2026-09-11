'use client';

/**
 * Minecraft Web Edition — Phase 1
 * Shared hooks.
 */

import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';

/**
 * Tracks currently-held keyboard keys by `KeyboardEvent.code`.
 * Returns a stable ref to a Set — read it inside the frame loop.
 */
export function useKeyboard(): MutableRefObject<Set<string>> {
  const keysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const keys = keysRef.current;
    const down = (e: KeyboardEvent) => keys.add(e.code);
    const up = (e: KeyboardEvent) => keys.delete(e.code);
    const clear = () => keys.clear();

    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clear);
      keys.clear();
    };
  }, []);

  return keysRef;
}
