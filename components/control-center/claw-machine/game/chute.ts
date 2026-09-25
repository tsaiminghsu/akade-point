// Operator chute setup, split out of clawSim.ts in the Control Center copy so
// server code can sanitize a saved rig without importing the physics engine.
// clawSim.ts re-exports everything here, so the rest of the module is unchanged.

/**
 * What the operator sets on the chute: the opening (width left–right, depth
 * front–back, from the corner) and the 擋板 height around it. A smaller hole
 * (縮洞) or a taller 擋板 makes a prize harder to get in.
 */
export interface ChuteConfig { width: number; depth: number; wallH: number }

/** Adjustment ranges (m). The hole never shrinks below where the gantry can still park over it. */
export const CHUTE_LIMITS = {
  width: { min: 0.12, max: 0.3 },
  depth: { min: 0.12, max: 0.26 },
  wallH: { min: 0, max: 0.3 },
} as const;
export const DEFAULT_CHUTE: ChuteConfig = { width: 0.23, depth: 0.22, wallH: 0.15 };

/** Accept anything (e.g. parsed localStorage) and return a valid chute setup, snapped to whole cm. */
export function sanitizeChute(raw: unknown): ChuteConfig {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const pick = (key: keyof ChuteConfig) => {
    const v = obj[key];
    const n = typeof v === 'number' && Number.isFinite(v) ? v : DEFAULT_CHUTE[key];
    const { min, max } = CHUTE_LIMITS[key];
    return Math.round(Math.min(max, Math.max(min, n)) * 100) / 100;
  };
  return { width: pick('width'), depth: pick('depth'), wallH: pick('wallH') };
}
