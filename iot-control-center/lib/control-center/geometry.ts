import type { Point, ResizeHandle, Viewport, Widget } from "./types";

/**
 * All screen <-> canvas <-> widget-local coordinate math lives in this one
 * module. Every pan/zoom/drag/resize/rotate/marquee/minimap interaction must
 * go through these functions — ad hoc inline math is how Figma/tldraw-class
 * editors accumulate coordinate-space bugs.
 *
 * Convention: screenPoint = canvasPoint * zoom + pan (viewport.x/y is the pan
 * in screen px). Widget x/y is the CENTER of the widget in canvas space,
 * which keeps rotation math anchor-free.
 */

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function rotateVector(x: number, y: number, deg: number): Point {
  if (deg === 0) return { x, y };
  const rad = degToRad(deg);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { x: x * cos - y * sin, y: x * sin + y * cos };
}

export function screenToCanvas(screen: Point, viewport: Viewport): Point {
  return {
    x: (screen.x - viewport.x) / viewport.zoom,
    y: (screen.y - viewport.y) / viewport.zoom,
  };
}

export function canvasToScreen(canvas: Point, viewport: Viewport): Point {
  return {
    x: canvas.x * viewport.zoom + viewport.x,
    y: canvas.y * viewport.zoom + viewport.y,
  };
}

export function snapValue(value: number, gridSize: number): number {
  if (gridSize <= 0) return value;
  return Math.round(value / gridSize) * gridSize;
}

export function snapPoint(point: Point, gridSize: number): Point {
  return { x: snapValue(point.x, gridSize), y: snapValue(point.y, gridSize) };
}

/** The 4 corners of a widget's bounding box in canvas space, rotation applied. */
export function getRotatedCorners(widget: Pick<Widget, "x" | "y" | "width" | "height" | "rotation">): Point[] {
  const hw = widget.width / 2;
  const hh = widget.height / 2;
  const localCorners: Point[] = [
    { x: -hw, y: -hh },
    { x: hw, y: -hh },
    { x: hw, y: hh },
    { x: -hw, y: hh },
  ];
  return localCorners.map((c) => {
    const r = rotateVector(c.x, c.y, widget.rotation);
    return { x: widget.x + r.x, y: widget.y + r.y };
  });
}

export interface AABB {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function pointsToAABB(points: Point[]): AABB {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

/** Widget's AABB in canvas space (post-rotation) — used for marquee-select
 * hit testing and content-bounds computation. Intentionally the rotated
 * bounding box, not exact polygon intersection (matches Figma's own
 * behaviour, slightly over-inclusive for rotated shapes near the marquee edge). */
export function getWidgetAABB(widget: Pick<Widget, "x" | "y" | "width" | "height" | "rotation">): AABB {
  return pointsToAABB(getRotatedCorners(widget));
}

export function aabbIntersects(a: AABB, b: AABB): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

export function computeContentBounds(widgets: Widget[]): AABB {
  if (widgets.length === 0) {
    return { minX: 0, minY: 0, maxX: 1000, maxY: 1000 };
  }
  const boxes = widgets.map((w) => getWidgetAABB(w));
  return {
    minX: Math.min(...boxes.map((b) => b.minX)),
    minY: Math.min(...boxes.map((b) => b.minY)),
    maxX: Math.max(...boxes.map((b) => b.maxX)),
    maxY: Math.max(...boxes.map((b) => b.maxY)),
  };
}

const HANDLE_ANCHOR_SIGN: Record<ResizeHandle, { ax: number; ay: number }> = {
  n: { ax: 0, ay: 1 },
  s: { ax: 0, ay: -1 },
  e: { ax: -1, ay: 0 },
  w: { ax: 1, ay: 0 },
  ne: { ax: -1, ay: 1 },
  nw: { ax: 1, ay: 1 },
  se: { ax: -1, ay: -1 },
  sw: { ax: 1, ay: -1 },
};

export interface ResizeResult {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Resize a (possibly rotated) widget by dragging `handle` so the pointer
 * ends at `pointerCanvas`. The opposite corner/edge stays visually fixed.
 * All math happens in the widget's local (unrotated) frame; see module doc.
 */
export function resizeFromHandle(
  widget: Pick<Widget, "x" | "y" | "width" | "height" | "rotation">,
  handle: ResizeHandle,
  pointerCanvas: Point,
  minSize = 16
): ResizeResult {
  const { ax, ay } = HANDLE_ANCHOR_SIGN[handle];
  const anchorOffsetLocal = { x: (ax * widget.width) / 2, y: (ay * widget.height) / 2 };
  const anchorOffsetCanvas = rotateVector(anchorOffsetLocal.x, anchorOffsetLocal.y, widget.rotation);
  const anchorCanvas = { x: widget.x + anchorOffsetCanvas.x, y: widget.y + anchorOffsetCanvas.y };

  const offsetCanvas = { x: pointerCanvas.x - anchorCanvas.x, y: pointerCanvas.y - anchorCanvas.y };
  const offsetLocal = rotateVector(offsetCanvas.x, offsetCanvas.y, -widget.rotation);

  const growX = -ax;
  const growY = -ay;

  const newWidth = ax !== 0 ? Math.max(minSize, growX * offsetLocal.x) : widget.width;
  const newHeight = ay !== 0 ? Math.max(minSize, growY * offsetLocal.y) : widget.height;

  const centerOffsetFromAnchorLocal = { x: (-ax * newWidth) / 2, y: (-ay * newHeight) / 2 };
  const centerOffsetFromAnchorCanvas = rotateVector(
    centerOffsetFromAnchorLocal.x,
    centerOffsetFromAnchorLocal.y,
    widget.rotation
  );

  return {
    x: anchorCanvas.x + centerOffsetFromAnchorCanvas.x,
    y: anchorCanvas.y + centerOffsetFromAnchorCanvas.y,
    width: newWidth,
    height: newHeight,
  };
}

/** Angle in degrees from a widget's center to a canvas-space point. */
export function angleFromCenter(center: Point, point: Point): number {
  return (Math.atan2(point.y - center.y, point.x - center.x) * 180) / Math.PI;
}

const MINIMAP_PADDING = 40;

export interface MinimapProjection {
  scale: number;
  offsetX: number;
  offsetY: number;
  contentBounds: AABB;
}

export function computeMinimapProjection(
  contentBounds: AABB,
  minimapWidth: number,
  minimapHeight: number
): MinimapProjection {
  const contentWidth = Math.max(1, contentBounds.maxX - contentBounds.minX);
  const contentHeight = Math.max(1, contentBounds.maxY - contentBounds.minY);
  const availW = minimapWidth - MINIMAP_PADDING * 2;
  const availH = minimapHeight - MINIMAP_PADDING * 2;
  const scale = Math.min(availW / contentWidth, availH / contentHeight);
  const offsetX = MINIMAP_PADDING + (availW - contentWidth * scale) / 2 - contentBounds.minX * scale;
  const offsetY = MINIMAP_PADDING + (availH - contentHeight * scale) / 2 - contentBounds.minY * scale;
  return { scale, offsetX, offsetY, contentBounds };
}

export function worldToMinimap(point: Point, proj: MinimapProjection): Point {
  return { x: point.x * proj.scale + proj.offsetX, y: point.y * proj.scale + proj.offsetY };
}

export function minimapToWorld(point: Point, proj: MinimapProjection): Point {
  return { x: (point.x - proj.offsetX) / proj.scale, y: (point.y - proj.offsetY) / proj.scale };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
