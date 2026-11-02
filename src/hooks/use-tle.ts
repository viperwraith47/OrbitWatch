"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** One satellite with orbital elements, ready for client-side SGP4 propagation. */
export interface GlobeTle {
  noradId: number;
  name: string;
  line1: string;
  line2: string;
  epoch: string | null;
}

interface TleResponse {
  source: "live" | "snapshot";
  fetchedAt: string;
  sats: GlobeTle[];
  missing: number[];
  error?: string;
}

/** Module-level cache: TLEs barely change over a session. */
const cache = new Map<string, { at: number; data: TleResponse }>();
const CACHE_TTL_MS = 10 * 60 * 1000;

/**
 * Marker colors for satellites on the globe. Deliberately vivid against the
 * dark globe; index is assigned per NORAD id and persists for the session.
 */
export const SAT_PALETTE = [
  "#fbbf24", // amber
  "#34d399", // emerald
  "#22d3ee", // cyan
  "#f472b6", // pink
  "#a78bfa", // violet
  "#fb923c", // orange
  "#a3e635", // lime
  "#e879f9", // fuchsia
  "#2dd4bf", // teal
  "#f87171", // red
  "#facc15", // yellow
  "#c084fc", // purple
] as const;

const colorAssign = new Map<number, string>();

/** Stable per-session color for a satellite (first come, first served). */
export function satColor(noradId: number): string {
  let c = colorAssign.get(noradId);
  if (!c) {
    c = SAT_PALETTE[colorAssign.size % SAT_PALETTE.length];
    colorAssign.set(noradId, c);
  }
  return c;
}

export function useTle(noradIds: number[]) {
  const key = [...noradIds].sort((a, b) => a - b).join(",");
  const [data, setData] = useState<TleResponse | null>(() => (key ? cache.get(key)?.data ?? null : null));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inflight = useRef(false);

  const load = useCallback(
    async (force = false) => {
      if (!key || inflight.current) return;
      const hit = cache.get(key);
      if (!force && hit && Date.now() - hit.at < CACHE_TTL_MS) return;
      inflight.current = true;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/tle?norads=${encodeURIComponent(key)}`);
        const j = (await res.json()) as TleResponse;
        if (!res.ok) throw new Error(j.error ?? `TLE fetch failed (${res.status})`);
        cache.set(key, { at: Date.now(), data: j });
        setData(j);
      } catch (e) {
        setError(e instanceof Error ? e.message : "TLE fetch failed");
      } finally {
        inflight.current = false;
        setLoading(false);
      }
    },
    [key],
  );

  useEffect(() => {
    if (!key) {
      setData(null);
      return;
    }
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      setData(hit.data);
      return;
    }
    void load();
  }, [key, load]);

  return { tles: data?.sats ?? [], source: data?.source ?? null, loading, error, reload: () => load(true) };
}
