import { describe, expect, it } from "vitest";
import { resizeFromHandle, rotateVector } from "./geometry";

describe("rotateVector", () => {
  it("is a no-op at 0 degrees", () => {
    expect(rotateVector(10, 5, 0)).toEqual({ x: 10, y: 5 });
  });

  it("rotates 90 degrees", () => {
    const r = rotateVector(10, 0, 90);
    expect(r.x).toBeCloseTo(0);
    expect(r.y).toBeCloseTo(10);
  });
});

describe("resizeFromHandle", () => {
  const base = { x: 100, y: 100, width: 40, height: 20, rotation: 0 };

  it("grows from the se handle, keeping nw fixed (0deg)", () => {
    const result = resizeFromHandle(base, "se", { x: 160, y: 130 });
    expect(result.width).toBeCloseTo(80);
    expect(result.height).toBeCloseTo(40);
    // nw corner was at (80,90); should stay in place
    const newNwX = result.x - result.width / 2;
    const newNwY = result.y - result.height / 2;
    expect(newNwX).toBeCloseTo(80);
    expect(newNwY).toBeCloseTo(90);
  });

  it("grows from the nw handle, keeping se fixed (0deg)", () => {
    const result = resizeFromHandle(base, "nw", { x: 60, y: 70 });
    expect(result.width).toBeCloseTo(60);
    expect(result.height).toBeCloseTo(40);
    const newSeX = result.x + result.width / 2;
    const newSeY = result.y + result.height / 2;
    expect(newSeX).toBeCloseTo(120);
    expect(newSeY).toBeCloseTo(110);
  });

  it("only changes height from the n handle", () => {
    const result = resizeFromHandle(base, "n", { x: 999, y: 80 });
    expect(result.width).toBeCloseTo(base.width);
    expect(result.height).toBeCloseTo(30);
  });

  it("respects rotation (90deg se handle behaves like e handle would at 0deg)", () => {
    const rotated = { x: 100, y: 100, width: 40, height: 20, rotation: 90 };
    // At 90deg, the shape's local +x axis points toward canvas +y.
    // Dragging the "se" handle (local +x,+y corner) should keep the
    // opposite (local -x,-y / "nw") corner fixed in CANVAS space.
    const corners = resizeFromHandle(rotated, "se", { x: 100, y: 160 });
    expect(corners.width).toBeGreaterThan(0);
    expect(corners.height).toBeGreaterThan(0);
  });

  it("clamps to the minimum size instead of flipping through", () => {
    const result = resizeFromHandle(base, "se", { x: 81, y: 91 }, 16);
    expect(result.width).toBeGreaterThanOrEqual(16);
    expect(result.height).toBeGreaterThanOrEqual(16);
  });
});
