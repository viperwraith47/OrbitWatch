/** Shared types for the satellite pass predictor (server & client). */

export interface Observer {
  /** Latitude, degrees, -90..90 */
  lat: number;
  /** Longitude, degrees, -180..180 */
  lng: number;
  /** Altitude above mean sea level, meters */
  altM: number;
}

export interface ObserverWithLabel extends Observer {
  /** Human-readable label, e.g. "New York, US" */
  label: string;
}

export interface TleEntry {
  noradId: number;
  name: string;
  line1: string;
  line2: string;
}

export interface TleResolved extends TleEntry {
  /** Where the elements came from */
  source: "live" | "snapshot";
  /** Parsed TLE epoch (UTC) */
  epoch: Date | null;
}

export type SatGroupKey = "stations" | "visual" | "weather" | "science" | "amateur";

export interface GroupInfo {
  key: SatGroupKey;
  label: string;
  hint: string;
}

export interface GroupListResponse {
  group: SatGroupKey;
  label: string;
  source: "live" | "snapshot";
  fetchedAt: string;
  sats: { noradId: number; name: string }[];
}

/** One time sample along a pass, for the sky chart scrubber. */
export interface PassSample {
  /** Epoch ms (UTC) */
  t: number;
  /** Azimuth, degrees 0..360 (N=0, E=90) */
  az: number;
  /** Elevation, degrees 0..90 */
  el: number;
  /** Slant range, km */
  rangeKm: number;
  /** Satellite is sunlit (not in Earth's shadow) */
  sunlit: boolean;
  /** Sky at observer is dark enough for naked-eye spotting (sun below -6°) */
  skyDark: boolean;
}

export type PassVisibility = "visible" | "twilight" | "daylight" | "eclipsed";

export interface PassInfo {
  noradId: number;
  satName: string;
  /** AOS epoch ms */
  start: number;
  /** LOS epoch ms */
  end: number;
  /** Duration, seconds */
  durationS: number;
  /** Max elevation, degrees */
  maxEl: number;
  /** Time of max elevation, epoch ms */
  maxElT: number;
  /** Azimuth at max elevation */
  maxElAz: number;
  /** Azimuth at AOS */
  startAz: number;
  /** Azimuth at LOS */
  endAz: number;
  /** Slant range at TCA, km */
  rangeAtMaxKm: number;
  visibility: PassVisibility;
  /** Sun elevation at observer at TCA, degrees (negative = below horizon) */
  sunElAtMax: number;
  /** True when the pass is cut off by the prediction window */
  truncated: boolean;
  /** True when the satellite stays in view for the whole window (GEO-like) */
  continuous: boolean;
  samples: PassSample[];
}

export interface SatPassResult {
  noradId: number;
  name: string;
  source: "live" | "snapshot";
  tleEpoch: string | null;
  /** Per-satellite error, e.g. decayed orbit */
  error?: string;
  passes: PassInfo[];
}

export interface PassesResponse {
  generatedAt: string;
  windowDays: number;
  minElevation: number;
  visibleOnly: boolean;
  observer: ObserverWithLabel;
  sats: SatPassResult[];
}

export interface PassesRequest {
  observer: ObserverWithLabel;
  noradIds: number[];
  days: number;
  minElevation: number;
  visibleOnly: boolean;
}

export interface GeocodeResult {
  name: string;
  country: string;
  admin1: string;
  lat: number;
  lon: number;
  elevation: number;
}
