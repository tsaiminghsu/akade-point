import { beforeEach, describe, expect, it } from "vitest";
import { useControlCenterStore } from "./useControlCenterStore";

function seedOneWidget() {
  useControlCenterStore.getState().loadWidgets([
    {
      id: "w1",
      type: "rectangle",
      x: 100,
      y: 100,
      width: 40,
      height: 40,
      rotation: 0,
      opacity: 1,
      zIndex: 0,
      locked: false,
      hidden: false,
      layerGroup: "zones",
      name: "Rect",
      fill: "#000",
      stroke: "#000",
      strokeWidth: 1,
    },
  ]);
}

describe("setWidgetPositions", () => {
  beforeEach(() => {
    seedOneWidget();
  });

  it("sets an absolute position rather than accumulating", () => {
    const store = useControlCenterStore.getState();
    store.setWidgetPositions({ w1: { x: 150, y: 120 } });
    const w = useControlCenterStore.getState().widgets[0];
    expect(w.x).toBe(150);
    expect(w.y).toBe(120);
  });

  it("does not compound across repeated calls during one drag gesture", () => {
    // Simulates several pointermove events during a single drag, each
    // supplying the ABSOLUTE position for the widget (start + total delta
    // since mousedown) — exactly how useCanvasInteractions.ts's drag branch
    // calls this action. If this ever regresses to relative-delta semantics
    // (the original bug), the final position would overshoot far past 180.
    const start = { x: 100, y: 100 };
    const store = useControlCenterStore.getState();
    const cursorDeltasSinceStart = [
      { dx: 10, dy: 0 },
      { dx: 25, dy: 0 },
      { dx: 40, dy: 0 },
      { dx: 60, dy: 0 },
      { dx: 80, dy: 0 },
    ];
    for (const d of cursorDeltasSinceStart) {
      store.setWidgetPositions({ w1: { x: start.x + d.dx, y: start.y + d.dy } });
    }
    const w = useControlCenterStore.getState().widgets[0];
    expect(w.x).toBe(180); // start.x(100) + final total delta(80), NOT compounded
    expect(w.y).toBe(100);
  });
});
