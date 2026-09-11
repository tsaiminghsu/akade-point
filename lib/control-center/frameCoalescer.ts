/**
 * Collapses a burst of updates into one per animation frame.
 *
 * Pointer devices fire `pointermove` faster than the browser paints (a 120 Hz
 * pointer emits roughly twice per frame), and each canvas move event writes to
 * the editor store, which re-renders the canvas and its panels. Coalescing
 * means the store sees at most one write per painted frame while the pointer
 * position stays exact, because the newest event always wins.
 *
 * `raf`/`caf` are injectable so this is testable without a browser.
 */
export function createFrameCoalescer<T>(
  apply: (latest: T) => void,
  raf: (cb: () => void) => number = (cb) => requestAnimationFrame(cb),
  caf: (handle: number) => void = (handle) => cancelAnimationFrame(handle)
): { push: (value: T) => void; flush: () => void; cancel: () => void } {
  let frame: number | null = null;
  let pending: { value: T } | null = null;

  function run() {
    frame = null;
    const next = pending;
    pending = null;
    if (next) apply(next.value);
  }

  return {
    push(value) {
      pending = { value };
      if (frame === null) frame = raf(run);
    },
    /** Applies the newest pending value immediately — used on pointer-up so the
     *  gesture always ends at the exact final position. */
    flush() {
      if (frame !== null) {
        caf(frame);
        frame = null;
      }
      const next = pending;
      pending = null;
      if (next) apply(next.value);
    },
    cancel() {
      if (frame !== null) {
        caf(frame);
        frame = null;
      }
      pending = null;
    },
  };
}
