import { describe, expect, it } from "vitest";

import { aimFromClick } from "./aim";

describe("click-to-aim", () => {
  it("keeps the aim for a click in the centre", () => {
    expect(aimFromClick(0, 0, { p: -20, y: 10 })).toEqual({ pitch: -20, yaw: 10 });
  });

  it("turns half the field of view for a click at the edge", () => {
    const fov = { h: 60, v: 40 };
    expect(aimFromClick(1, 0, { p: 0, y: 0 }, fov).yaw).toBeCloseTo(30, 1);
    expect(aimFromClick(-1, 0, { p: 0, y: 0 }, fov).yaw).toBeCloseTo(-30, 1);
    // Clicking low in the frame tilts the camera down.
    expect(aimFromClick(0, 1, { p: 0, y: 0 }, fov).pitch).toBeCloseTo(-20, 1);
  });

  it("clamps pitch to the gimbal's range and wraps yaw", () => {
    expect(aimFromClick(0, 1, { p: -85, y: 0 }).pitch).toBe(-90);
    expect(aimFromClick(0, -1, { p: 25, y: 0 }).pitch).toBe(30);
    expect(aimFromClick(1, 0, { p: 0, y: 170 }).yaw).toBeLessThan(-150);
  });
});
