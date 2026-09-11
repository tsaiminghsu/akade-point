import { describe, expect, it, vi } from "vitest";

import { createFrameCoalescer } from "./frameCoalescer";

/** Fake requestAnimationFrame: callbacks run only when the test says so. */
function fakeClock() {
  const scheduled = new Map<number, () => void>();
  let nextHandle = 1;
  return {
    raf: (cb: () => void) => {
      const handle = nextHandle++;
      scheduled.set(handle, cb);
      return handle;
    },
    caf: (handle: number) => {
      scheduled.delete(handle);
    },
    tick() {
      const due = [...scheduled.values()];
      scheduled.clear();
      for (const cb of due) cb();
    },
    get pending() {
      return scheduled.size;
    },
  };
}

describe("createFrameCoalescer", () => {
  it("applies only the newest value once per frame", () => {
    const clock = fakeClock();
    const apply = vi.fn();
    const c = createFrameCoalescer<number>(apply, clock.raf, clock.caf);

    c.push(1);
    c.push(2);
    c.push(3);
    expect(apply).not.toHaveBeenCalled();
    expect(clock.pending).toBe(1);

    clock.tick();
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith(3);
  });

  it("flush applies the pending value immediately and cancels the frame", () => {
    const clock = fakeClock();
    const apply = vi.fn();
    const c = createFrameCoalescer<string>(apply, clock.raf, clock.caf);

    c.push("a");
    c.flush();
    expect(apply).toHaveBeenCalledWith("a");
    expect(clock.pending).toBe(0);

    clock.tick();
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it("flush with nothing pending does nothing", () => {
    const clock = fakeClock();
    const apply = vi.fn();
    createFrameCoalescer<number>(apply, clock.raf, clock.caf).flush();
    expect(apply).not.toHaveBeenCalled();
  });

  it("cancel drops the pending value", () => {
    const clock = fakeClock();
    const apply = vi.fn();
    const c = createFrameCoalescer<number>(apply, clock.raf, clock.caf);

    c.push(1);
    c.cancel();
    clock.tick();
    expect(apply).not.toHaveBeenCalled();
  });

  it("schedules a fresh frame after a flush", () => {
    const clock = fakeClock();
    const apply = vi.fn();
    const c = createFrameCoalescer<number>(apply, clock.raf, clock.caf);

    c.push(1);
    c.flush();
    c.push(2);
    clock.tick();
    expect(apply.mock.calls).toEqual([[1], [2]]);
  });
});
