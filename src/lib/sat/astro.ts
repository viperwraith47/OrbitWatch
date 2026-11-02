import {
  gstime,
  eciToEcf,
  ecfToLookAngles,
  sunPos,
  shadowFraction,
  jday,
  radiansToDegrees,
  type GeodeticLocation,
} from "satellite.js";

/** Geodetic location in satellite.js's radians convention. */
export interface SatObserver {
  latitude: number; // radians
  longitude: number; // radians
  height: number; // km above WGS84 ellipsoid
}

const AU_KM = 149597870.7;

function sunEcfKm(date: Date) {
  const { rsun } = sunPos(jday(date));
  const sunKm = { x: rsun.x * AU_KM, y: rsun.y * AU_KM, z: rsun.z * AU_KM };
  return eciToEcf(sunKm, gstime(date));
}

/**
 * Sun elevation as seen by the observer, degrees.
 * Negative = below horizon. Below about -6° the sky is astronomically dark
 * enough for naked-eye satellite spotting (civil twilight ends).
 */
export function sunElevationDeg(observer: SatObserver, date: Date): number {
  const look = ecfToLookAngles(observer, sunEcfKm(date));
  return radiansToDegrees(look.elevation);
}

/** Sun azimuth as seen by the observer, degrees 0..360. */
export function sunAzimuthDeg(observer: SatObserver, date: Date): number {
  const look = ecfToLookAngles(observer, sunEcfKm(date));
  return (radiansToDegrees(look.azimuth) + 360) % 360;
}

/**
 * True when the satellite is sunlit (outside of Earth's umbra/penumbra).
 * Uses satellite.js's shadowFraction: 0 = fully lit, 1 = umbra.
 * Threshold 0.5 → illuminated through most of the penumbra.
 */
export function isSatSunlit(satEciKm: { x: number; y: number; z: number }, date: Date): boolean {
  const { rsun } = sunPos(jday(date));
  return shadowFraction(rsun, satEciKm) < 0.5;
}
