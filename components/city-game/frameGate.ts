/**
 * The fps cap, decided once per animation frame.
 *
 * requestAnimationFrame runs at the display's refresh rate (60, 144 …) no
 * matter what the cap says. On the frames the cap rejects, the simulation,
 * the draw and every per-frame job (particles, ground streaming …) must all
 * skip together — separate accumulators drifted apart, and anything left
 * ungated still burned CPU at 144 Hz. GameScene advances the gate from a
 * `useFrame` at priority -2, which runs before every other frame callback;
 * the rest only read `due`.
 */

export interface FrameGate {
  /** True when this animation frame should simulate and draw. */
  due: boolean;
  /** Seconds since the previous due frame: the step to simulate. */
  delta: number;
  /** Feed one animation frame. `cap` 0 means uncapped. */
  advance(rawDelta: number, cap: number): void;
}

export function createFrameGate(): FrameGate {
  // `debt` keeps the remainder between frames, so a 60 cap on a 144 Hz screen
  // averages 60 draws a second instead of rounding every interval up to three
  // refreshes (48 fps).
  let debt = 0;
  let since = 0;
  return {
    due: true,
    delta: 0,
    advance(rawDelta, cap) {
      since += rawDelta;
      if (cap <= 0) {
        this.due = true;
        this.delta = since;
        since = 0;
        debt = 0;
        return;
      }
      const period = 1 / cap;
      debt += rawDelta;
      if (debt < period - 0.001) {
        this.due = false;
        return;
      }
      debt -= period;
      // After a hitch, start over rather than firing back-to-back to catch up.
      if (debt > period) debt = 0;
      this.due = true;
      this.delta = since;
      since = 0;
    },
  };
}

/** The game's one gate. */
export const frameGate = createFrameGate();
