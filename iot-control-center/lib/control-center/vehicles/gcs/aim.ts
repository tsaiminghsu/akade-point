/**
 * Click-to-aim: turn a click on the video into new gimbal angles. The click is
 * normalised to -1..1 across the frame (x right, y down); with the camera's
 * field of view that is an angular offset from where the gimbal points now.
 * Uses the tangent of the half-FOV so a click near the edge is not overshot.
 */

import { wrap360 } from "./geo";

export interface Fov {
  /** horizontal and vertical field of view, degrees */
  h: number;
  v: number;
}

/** Raspberry Pi Camera Module 3 (standard lens), 16:9 video. */
export const DEFAULT_FOV: Fov = { h: 66, v: 41 };

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export function aimFromClick(nx: number, ny: number, current: { p: number; y: number }, fov: Fov = DEFAULT_FOV): { pitch: number; yaw: number } {
  const dx = deg(Math.atan(nx * Math.tan(rad(fov.h / 2))));
  const dy = deg(Math.atan(ny * Math.tan(rad(fov.v / 2))));
  const pitch = Math.max(-90, Math.min(30, current.p - dy));
  let yaw = wrap360(current.y + dx);
  if (yaw > 180) yaw -= 360;
  return { pitch: Math.round(pitch * 10) / 10, yaw: Math.round(yaw * 10) / 10 };
}
