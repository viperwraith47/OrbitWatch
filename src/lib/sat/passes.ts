import {
  propagate,
  gstime,
  eciToEcf,
  ecfToLookAngles,
  radiansToDegrees,
  type SatRec,
} from "satellite.js";
import { sunElevationDeg, isSatSunlit, type SatObserver } from "./astro";
import type { PassInfo, PassSample } from "./types";

const DETECTION_STEP_MS = 30_000; // 30 s coarse scan
const HORIZON_EPS = 0.02; // degrees — ignore grazing noise

interface Look {
  el: number;
  az: number;
  rangeKm: number;
  eci: { x: number; y: number; z: number };
}

function lookAt(satrec: SatRec, observer: SatObserver, t: number): Look | null {
  const date = new Date(t);
  const pv = propagate(satrec, date);
  if (!pv) return null;
  const gmst = gstime(date);
  const satEcf = eciToEcf(pv.position, gmst);
  const look = ecfToLookAngles(observer, satEcf);
  return {
    el: radiansToDegrees(look.elevation),
    az: (radiansToDegrees(look.azimuth) + 360) % 360,
    rangeKm: look.rangeSat,
    eci: pv.position,
  };
}

/** Bisect an elevation zero-crossing between tBelow (el<=0) and tAbove (el>0). */
function refineCrossing(
  satrec: SatRec,
  observer: SatObserver,
  tBelow: number,
  tAbove: number,
): number {
  let lo = tBelow;
  let hi = tAbove;
  for (let i = 0; i < 8; i++) {
    const mid = (lo + hi) / 2;
    const l = lookAt(satrec, observer, mid);
    if (!l) break;
    if (l.el > 0) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

/** Ternary search for the time of maximum elevation in [t0, t1]. */
function findTca(
  satrec: SatRec,
  observer: SatObserver,
  t0: number,
  t1: number,
): { t: number; look: Look | null } {
  let lo = t0;
  let hi = t1;
  let best: { t: number; look: Look | null } = { t: (t0 + t1) / 2, look: null };
  for (let i = 0; i < 34 && hi - lo > 200; i++) {
    const m1 = lo + (hi - lo) / 3;
    const m2 = hi - (hi - lo) / 3;
    const l1 = lookAt(satrec, observer, m1);
    const l2 = lookAt(satrec, observer, m2);
    if (!l1 || !l2) return best;
    if (l1.el < l2.el) {
      lo = m1;
      best = { t: m2, look: l2 };
    } else {
      hi = m2;
      best = { t: m1, look: l1 };
    }
  }
  const l = lookAt(satrec, observer, (lo + hi) / 2);
  if (l && (!best.look || l.el >= best.look.el)) best = { t: (lo + hi) / 2, look: l };
  return best;
}

export interface FindPassesResult {
  passes: PassInfo[];
  error?: string;
}

/**
 * Find all passes (elevation > 0°) of one satellite over the observer
 * within [startMs, endMs]. SGP4 via satellite.js; illumination via the
 * sun model; visibility classified at time of closest approach.
 */
export function findPasses(
  satrec: SatRec,
  observer: SatObserver,
  startMs: number,
  endMs: number,
): FindPassesResult {
  const passes: PassInfo[] = [];
  const errorGuard = lookAt(satrec, observer, startMs);
  if (!errorGuard) {
    return { passes, error: "Orbit cannot be propagated (decayed or invalid elements)" };
  }

  let t = startMs;
  let prev: Look | null = errorGuard;
  let prevT = t;
  let open: { startT: number; startAz: number; truncated: boolean } | null = null;

  if (prev.el > 0) {
    open = { startT: startMs, startAz: prev.az, truncated: true };
  }

  const closePass = (losT: number, losLook: Look | null, losTruncated: boolean) => {
    if (!open) return;
    const startT = open.startT;
    const durationS = (losT - startT) / 1000;
    if (durationS < 30) {
      open = null;
      return;
    }
    const tca = findTca(satrec, observer, startT, losT);
    if (!tca.look || tca.look.el < HORIZON_EPS) {
      open = null;
      return;
    }
    const tcaT = tca.t;
    const tcaLook = tca.look;
    const sunEl = sunElevationDeg(observer, new Date(tcaT));
    const sunlit = isSatSunlit(tcaLook.eci, new Date(tcaT));

    let visibility: PassInfo["visibility"];
    if (sunEl >= 0) visibility = "daylight";
    else if (!sunlit) visibility = "eclipsed";
    else if (sunEl < -6) visibility = "visible";
    else visibility = "twilight";

    // Samples for the sky chart — adaptive step, capped at 600.
    const dur = losT - startT;
    const stepMs = Math.max(10_000, Math.ceil(dur / 600 / 1000) * 1000);
    const samples: PassSample[] = [];
    for (let s = startT; s <= losT; s += stepMs) {
      const l = lookAt(satrec, observer, s);
      if (!l) continue;
      const d = new Date(s);
      samples.push({
        t: Math.round(s),
        az: Math.round(l.az * 10) / 10,
        el: Math.round(l.el * 10) / 10,
        rangeKm: Math.round(l.rangeKm),
        sunlit: isSatSunlit(l.eci, d),
        skyDark: sunElevationDeg(observer, d) < -6,
      });
    }
    // Always include the LOS sample
    if (samples.length === 0 || samples[samples.length - 1].t < Math.round(losT)) {
      const l = lookAt(satrec, observer, losT);
      if (l) {
        const d = new Date(losT);
        samples.push({
          t: Math.round(losT),
          az: Math.round(l.az * 10) / 10,
          el: Math.max(0, Math.round(l.el * 10) / 10),
          rangeKm: Math.round(l.rangeKm),
          sunlit: isSatSunlit(l.eci, d),
          skyDark: sunElevationDeg(observer, d) < -6,
        });
      }
    }

    passes.push({
      noradId: satrec.satnum ? Number(satrec.satnum) : 0,
      satName: "",
      start: Math.round(startT),
      end: Math.round(losT),
      durationS: Math.round(durationS),
      maxEl: Math.round(tcaLook.el * 10) / 10,
      maxElT: Math.round(tcaT),
      maxElAz: Math.round(tcaLook.az * 10) / 10,
      startAz: Math.round(open.startAz * 10) / 10,
      endAz: Math.round((losLook?.az ?? 0) * 10) / 10,
      rangeAtMaxKm: Math.round(tcaLook.rangeKm),
      visibility,
      sunElAtMax: Math.round(sunEl * 10) / 10,
      truncated: open.truncated || losTruncated,
      continuous: durationS > 6 * 3600,
      samples,
    });
    open = null;
  };

  while (t < endMs) {
    t = Math.min(t + DETECTION_STEP_MS, endMs);
    const cur = lookAt(satrec, observer, t);
    if (!cur) {
      // Propagation failed mid-window (e.g. decay): close anything open, stop.
      if (open) closePass(t, cur, true);
      return { passes, error: "Propagation stopped mid-window — elements may be decayed" };
    }
    if (prev) {
      if (prev.el <= 0 && cur.el > 0) {
        const aos = refineCrossing(satrec, observer, prevT, t);
        const l = lookAt(satrec, observer, aos) ?? cur;
        open = { startT: aos, startAz: l.az, truncated: false };
      } else if (prev.el > 0 && cur.el <= 0) {
        if (open) {
          const los = refineCrossing(satrec, observer, t, prevT); // reversed: el(t)<=0, el(prev)>0
          const l = lookAt(satrec, observer, los) ?? cur;
          closePass(los, l, false);
        }
      }
    }
    prev = cur;
    prevT = t;
  }

  if (open) closePass(endMs, lookAt(satrec, observer, endMs), true);
  return { passes };
}
