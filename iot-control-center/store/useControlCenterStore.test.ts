import { beforeEach, describe, expect, it } from "vitest";
import { defaultWidgetPartial, useControlCenterStore } from "./useControlCenterStore";

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

function rect(id: string, layerGroup: "zones" | "machines" | "background", zIndex: number) {
  return {
    id,
    type: "rectangle" as const,
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    rotation: 0,
    opacity: 1,
    zIndex,
    locked: false,
    hidden: false,
    layerGroup,
    name: id,
    fill: "#000",
    stroke: "#000",
    strokeWidth: 1,
  };
}

describe("selection updates", () => {
  beforeEach(() => {
    seedOneWidget();
  });

  it("ignores a setSelection with an unchanged id list", () => {
    const store = useControlCenterStore.getState();
    store.setSelection(["w1"]);
    const before = useControlCenterStore.getState().selection;

    // A marquee drag recomputes the same hit list on every frame; re-notifying
    // would re-render one context-menu wrapper per widget.
    store.setSelection(["w1"]);
    expect(useControlCenterStore.getState().selection).toBe(before);
  });

  it("still notifies when the order changes, since order is meaningful", () => {
    const store = useControlCenterStore.getState();
    store.setSelection(["a", "b"]);
    const before = useControlCenterStore.getState().selection;
    store.setSelection(["b", "a"]);
    expect(useControlCenterStore.getState().selection).not.toBe(before);
  });

  it("ignores clearSelection when nothing is selected", () => {
    const store = useControlCenterStore.getState();
    store.clearSelection();
    const before = useControlCenterStore.getState().selection;
    store.clearSelection();
    expect(useControlCenterStore.getState().selection).toBe(before);
  });
});

describe("z-index layer bands", () => {
  it("keeps an added widget inside its own band instead of on top of everything", () => {
    useControlCenterStore.getState().loadWidgets([rect("z", "zones", 1000), rect("m", "machines", 3000)]);
    // "rectangle" defaults into the zones band, below machines (WIDGET_DEFAULT_LAYER).
    const newId = useControlCenterStore.getState().addWidget(defaultWidgetPartial("rectangle", 0, 0));

    const added = useControlCenterStore.getState().widgets.find((w) => w.id === newId);
    const machine = useControlCenterStore.getState().widgets.find((w) => w.id === "m");
    expect(added).toBeDefined();
    expect(machine).toBeDefined();
    // A zone widget must never paint over a machine.
    expect(added!.zIndex).toBeLessThan(machine!.zIndex);
  });

  it("bringToFront reorders within the band, not across bands", () => {
    useControlCenterStore.getState().loadWidgets([
      rect("bg", "background", 0),
      rect("m1", "machines", 3000),
      rect("m2", "machines", 3001),
    ]);
    useControlCenterStore.getState().bringToFront(["bg"]);

    const byId = new Map(useControlCenterStore.getState().widgets.map((w) => [w.id, w.zIndex]));
    expect(byId.get("bg")!).toBeLessThan(byId.get("m1")!);
    expect(byId.get("bg")!).toBeLessThan(byId.get("m2")!);
  });

  it("bringToFront puts the widget in front of its own band's siblings", () => {
    useControlCenterStore.getState().loadWidgets([rect("m1", "machines", 3000), rect("m2", "machines", 3001)]);
    useControlCenterStore.getState().bringToFront(["m1"]);

    const byId = new Map(useControlCenterStore.getState().widgets.map((w) => [w.id, w.zIndex]));
    expect(byId.get("m1")!).toBeGreaterThan(byId.get("m2")!);
  });
});

describe("dirty tracking across undo/redo", () => {
  beforeEach(() => {
    seedOneWidget();
  });

  it("a freshly loaded layout is clean", () => {
    expect(useControlCenterStore.getState().isDirty).toBe(false);
  });

  it("undo after a save marks the editor dirty again", () => {
    const store = useControlCenterStore.getState();
    store.setWidgetPositions({ w1: { x: 150, y: 100 } });
    store.commit();
    store.save();
    expect(useControlCenterStore.getState().isDirty).toBe(false);

    useControlCenterStore.getState().undo();
    // The canvas no longer matches what the server holds, so Save must be live.
    expect(useControlCenterStore.getState().isDirty).toBe(true);

    useControlCenterStore.getState().redo();
    expect(useControlCenterStore.getState().isDirty).toBe(false);
  });

  it("save folds an uncommitted edit into history first", () => {
    const store = useControlCenterStore.getState();
    store.updateWidget("w1", { name: "renamed" });
    store.save();

    expect(useControlCenterStore.getState().history).toHaveLength(2);
    expect(useControlCenterStore.getState().isDirty).toBe(false);
    useControlCenterStore.getState().undo();
    expect(useControlCenterStore.getState().isDirty).toBe(true);
  });

  it("commit with nothing changed neither grows history nor drops the redo branch", () => {
    const store = useControlCenterStore.getState();
    store.setWidgetPositions({ w1: { x: 150, y: 100 } });
    store.commit();
    const historyLength = useControlCenterStore.getState().history.length;

    useControlCenterStore.getState().undo();
    useControlCenterStore.getState().commit();

    expect(useControlCenterStore.getState().history).toHaveLength(historyLength);
    expect(useControlCenterStore.getState().canRedo()).toBe(true);
  });

  it("stays dirty when the saved state is stranded on a discarded redo branch", () => {
    const store = useControlCenterStore.getState();
    store.setWidgetPositions({ w1: { x: 150, y: 100 } });
    store.commit();
    store.save();

    useControlCenterStore.getState().undo();
    useControlCenterStore.getState().setWidgetPositions({ w1: { x: 400, y: 100 } });
    useControlCenterStore.getState().commit(); // discards the branch holding the save
    useControlCenterStore.getState().undo();

    expect(useControlCenterStore.getState().isDirty).toBe(true);
  });

  it("discard returns to the saved layout and is clean", () => {
    const store = useControlCenterStore.getState();
    store.setWidgetPositions({ w1: { x: 150, y: 100 } });
    store.commit();
    store.save();
    useControlCenterStore.getState().setWidgetPositions({ w1: { x: 999, y: 100 } });
    useControlCenterStore.getState().commit();

    useControlCenterStore.getState().discard();
    expect(useControlCenterStore.getState().widgets[0].x).toBe(150);
    expect(useControlCenterStore.getState().isDirty).toBe(false);
  });
});
