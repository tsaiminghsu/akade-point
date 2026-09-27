import { getWidgetAABB } from "./geometry";
import type { Widget } from "./types";

export type AlignEdge = "left" | "center-h" | "right" | "top" | "center-v" | "bottom";

/** Returns a map of widgetId -> {x,y} deltas to apply so the selection aligns
 * to the chosen edge, using each widget's rotated AABB (matches what the
 * user visually sees, even for rotated shapes). */
export function computeAlignDeltas(widgets: Widget[], edge: AlignEdge): Record<string, { dx: number; dy: number }> {
  if (widgets.length < 2) return {};
  const boxes = widgets.map((w) => ({ widget: w, box: getWidgetAABB(w) }));

  let target: number;
  switch (edge) {
    case "left":
      target = Math.min(...boxes.map((b) => b.box.minX));
      break;
    case "right":
      target = Math.max(...boxes.map((b) => b.box.maxX));
      break;
    case "center-h":
      target =
        (Math.min(...boxes.map((b) => b.box.minX)) + Math.max(...boxes.map((b) => b.box.maxX))) / 2;
      break;
    case "top":
      target = Math.min(...boxes.map((b) => b.box.minY));
      break;
    case "bottom":
      target = Math.max(...boxes.map((b) => b.box.maxY));
      break;
    case "center-v":
      target =
        (Math.min(...boxes.map((b) => b.box.minY)) + Math.max(...boxes.map((b) => b.box.maxY))) / 2;
      break;
  }

  const deltas: Record<string, { dx: number; dy: number }> = {};
  for (const { widget, box } of boxes) {
    let dx = 0;
    let dy = 0;
    if (edge === "left") dx = target - box.minX;
    else if (edge === "right") dx = target - box.maxX;
    else if (edge === "center-h") dx = target - (box.minX + box.maxX) / 2;
    else if (edge === "top") dy = target - box.minY;
    else if (edge === "bottom") dy = target - box.maxY;
    else if (edge === "center-v") dy = target - (box.minY + box.maxY) / 2;
    deltas[widget.id] = { dx, dy };
  }
  return deltas;
}

export type DistributeAxis = "horizontal" | "vertical";

/** Evenly spaces 3+ widgets between the two extremes along an axis, by
 * their AABB centers, keeping the two outermost widgets fixed. */
export function computeDistributeDeltas(
  widgets: Widget[],
  axis: DistributeAxis
): Record<string, { dx: number; dy: number }> {
  if (widgets.length < 3) return {};
  const boxes = widgets.map((w) => ({
    widget: w,
    box: getWidgetAABB(w),
  }));

  const withCenter = boxes.map((b) => ({
    ...b,
    center: axis === "horizontal" ? (b.box.minX + b.box.maxX) / 2 : (b.box.minY + b.box.maxY) / 2,
  }));
  withCenter.sort((a, b) => a.center - b.center);

  const first = withCenter[0];
  const last = withCenter[withCenter.length - 1];
  const span = last.center - first.center;
  const step = span / (withCenter.length - 1);

  const deltas: Record<string, { dx: number; dy: number }> = {};
  withCenter.forEach((entry, i) => {
    const targetCenter = first.center + step * i;
    const delta = targetCenter - entry.center;
    deltas[entry.widget.id] = axis === "horizontal" ? { dx: delta, dy: 0 } : { dx: 0, dy: delta };
  });
  return deltas;
}
