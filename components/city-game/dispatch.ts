/**
 * What each wanted level sends after the player, GTA III style.
 *
 *   1★ one patrol car
 *   2★ more patrol cars, roadblocks
 *   3★ + a police helicopter
 *   4★ SWAT vans, and the helicopter's gunner opens fire
 *   5★ more SWAT, a second helicopter, spike strips
 *   6★ the army: trucks and tanks
 *
 * Pure data: the engine feeds the result to the police, helicopter and
 * roadblock systems.
 */

export interface GroundCounts {
  police: number;
  swat: number;
  army: number;
  tanks: number;
}

export interface Dispatch extends GroundCounts {
  helis: number;
  /** The helicopter crew shoots at the player. */
  heliGunner: boolean;
  roadblocks: boolean;
  spikeStrips: boolean;
}

const NONE: Dispatch = {
  police: 0, swat: 0, army: 0, tanks: 0,
  helis: 0, heliGunner: false, roadblocks: false, spikeStrips: false,
};

const TABLE: Dispatch[] = [
  NONE,
  { ...NONE, police: 1 },
  { ...NONE, police: 3, roadblocks: true },
  { ...NONE, police: 3, helis: 1, roadblocks: true },
  { ...NONE, police: 2, swat: 2, helis: 1, heliGunner: true, roadblocks: true },
  { ...NONE, police: 2, swat: 3, helis: 2, heliGunner: true, roadblocks: true, spikeStrips: true },
  { ...NONE, swat: 2, army: 2, tanks: 2, helis: 2, heliGunner: true, roadblocks: true, spikeStrips: true },
];

/**
 * The response for a star level, trimmed to the ground-unit budget.
 *
 * Over budget, the weakest units go first (patrol cars, then SWAT, then army
 * trucks), so a six-star chase on a slow device still meets tanks.
 */
export function dispatchFor(stars: number, maxGround = Infinity, maxHelis = Infinity): Dispatch {
  const d = { ...TABLE[Math.max(0, Math.min(TABLE.length - 1, Math.round(stars)))] };
  let excess = d.police + d.swat + d.army + d.tanks - Math.max(0, maxGround);
  for (const key of ['police', 'swat', 'army', 'tanks'] as const) {
    if (excess <= 0) break;
    const cut = Math.min(d[key], excess);
    d[key] -= cut;
    excess -= cut;
  }
  d.helis = Math.min(d.helis, Math.max(0, maxHelis));
  return d;
}

export function groundTotal(c: GroundCounts): number {
  return c.police + c.swat + c.army + c.tanks;
}
