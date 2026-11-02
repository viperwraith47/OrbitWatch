/** Client-safe formatting helpers (local timezone aware). */

const COMPASS_16 = [
  "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
  "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
] as const;

export function compass16(az: number): string {
  const idx = Math.round((((az % 360) + 360) % 360) / 22.5) % 16;
  return COMPASS_16[idx];
}

export function fmtTime(t: number): string {
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(t));
}

export function fmtTimeSec(t: number): string {
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date(t));
}

export function fmtDateLong(t: number): string {
  return new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" }).format(new Date(t));
}

export function fmtDateFull(t: number): string {
  return new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(new Date(t));
}

export function fmtDateShort(t: number): string {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(t));
}

/** Local-time day key for grouping, e.g. "2026-11-02". */
export function dayKey(t: number): string {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function isToday(t: number): boolean {
  return dayKey(t) === dayKey(Date.now());
}

export function isTomorrow(t: number): boolean {
  return dayKey(t) === dayKey(Date.now() + 86_400_000);
}

export function relativeDayLabel(t: number): string {
  if (isToday(t)) return "Today";
  if (isTomorrow(t)) return "Tomorrow";
  return new Intl.DateTimeFormat(undefined, { weekday: "long" }).format(new Date(t));
}

export function fmtDuration(sec: number): string {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60} min`;
}

/** "02:14:33" style countdown. */
export function fmtCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${p(h)}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
}

export function maxElQuality(el: number): { label: string; tone: "excellent" | "good" | "fair" | "low" } {
  if (el >= 60) return { label: "Excellent", tone: "excellent" };
  if (el >= 30) return { label: "Good", tone: "good" };
  if (el >= 15) return { label: "Fair", tone: "fair" };
  return { label: "Low", tone: "low" };
}
