import type { TleEntry } from "./types";

/**
 * Parse a 3LE document (name / line1 / line2 triplets, one per satellite).
 * Also tolerates 2LE (bare TLE pairs) by naming entries "SAT-<norad>".
 */
export function parse3le(text: string): TleEntry[] {
  const lines = text.split(/\r?\n/);
  const entries: TleEntry[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line || line.startsWith("1 ") || line.startsWith("2 ")) {
      i += 1;
      continue;
    }
    const name = line.trimEnd();
    const l1 = (lines[i + 1] || "").trimEnd();
    const l2 = (lines[i + 2] || "").trimEnd();
    if (l1.startsWith("1 ") && l2.startsWith("2 ")) {
      const norad = parseInt(l1.substring(2, 7), 10);
      if (!Number.isNaN(norad)) {
        entries.push({ noradId: norad, name: name || `SAT ${norad}`, line1: l1, line2: l2 });
      }
      i += 3;
    } else {
      i += 1;
    }
  }
  return entries;
}

/**
 * Parse the TLE epoch from line 1 (columns 19–32, YYDDD.DDDDDDDD).
 * Returns a UTC Date, or null when unparsable.
 */
export function tleEpochDate(line1: string): Date | null {
  try {
    const epochField = line1.substring(18, 32);
    if (epochField.length < 14) return null;
    const yy = parseInt(epochField.substring(0, 2), 10);
    const doy = parseFloat(epochField.substring(2));
    if (Number.isNaN(yy) || Number.isNaN(doy)) return null;
    const year = yy >= 57 ? 1900 + yy : 2000 + yy;
    // Day 1.0 = Jan 1 00:00
    const ms = Date.UTC(year, 0, 1) + (doy - 1) * 86400000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}
