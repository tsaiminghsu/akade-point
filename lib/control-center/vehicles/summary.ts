import type { VehicleState, VehicleSummary } from "./types";

/**
 * Reads the handful of numbers every screen needs from either contract
 * version. v1 companions send 0 for unknown readings; those zeros are taken at
 * face value except for the ones that cannot be real (a 0,0 position, 0 V).
 */
export function summarize(state: VehicleState | null | undefined): VehicleSummary | null {
  if (!state) return null;
  if (state.v === 1) {
    const hasPos = !(state.pos.lat === 0 && state.pos.lon === 0);
    return {
      armed: state.armed,
      mode: state.mode === "UNKNOWN" ? null : state.mode,
      batPct: state.bat.pct,
      batV: state.bat.v > 0 ? state.bat.v : null,
      fix: state.gps.fix,
      sats: state.gps.sats,
      hdop: state.gps.hdop,
      pos: hasPos ? state.pos : null,
      hdg: state.hdg,
      gs: state.gs,
      vs: state.vs,
      wp: state.wp,
      fw: state.fw === "unknown" ? null : state.fw,
      sys: state.sys,
      fcOk: true,
    };
  }
  return {
    armed: state.armed,
    mode: state.mode,
    batPct: state.bat?.pct ?? null,
    batV: state.bat?.v ?? null,
    fix: state.gps?.fix ?? null,
    sats: state.gps?.sats ?? null,
    hdop: state.gps?.hdop ?? null,
    pos: state.pos,
    hdg: state.hdg,
    gs: state.gs,
    vs: state.vs,
    wp: state.wp ? { cur: state.wp.cur, n: state.wp.n } : null,
    fw: state.fw,
    sys: state.sys,
    fcOk: state.fc.ok,
  };
}

/** "3D", "RTK" … from a GPS fix type; null when unknown. */
export function fixLabel(fix: number | null): string | null {
  if (fix === null) return null;
  if (fix >= 6) return "RTK";
  if (fix === 5) return "RTK float";
  if (fix === 4) return "DGPS";
  if (fix === 3) return "3D";
  if (fix === 2) return "2D";
  return "No fix";
}
