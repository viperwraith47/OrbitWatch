import { parse3le, tleEpochDate } from "./tle";
import { TLE_SNAPSHOT } from "./tle-snapshot";
import type { GroupInfo, SatGroupKey, TleEntry, TleResolved } from "./types";

/**
 * Orbital element store.
 *
 * Live source: CelesTrak GP data served through the ReTLEctor caching mirror
 * (https://retlector.eu — an open CelesTrak caching proxy). When unreachable,
 * falls back to a bundled snapshot of the same groups.
 */

export const SAT_GROUPS: GroupInfo[] = [
  { key: "stations", label: "Space Stations", hint: "ISS, Tiangong & docked vehicles" },
  { key: "visual", label: "Brightest", hint: "Brightest objects — best naked-eye targets" },
  { key: "weather", label: "Weather", hint: "Weather & Earth-observation satellites" },
  { key: "science", label: "Science", hint: "Hubble & science missions" },
  { key: "amateur", label: "Amateur Radio", hint: "Ham radio satellites" },
];

const CACHE_TTL_MS = 3 * 60 * 60 * 1000; // 3 h
const FETCH_TIMEOUT_MS = 12_000;

interface GroupCache {
  entries: Map<number, TleEntry>;
  source: "live" | "snapshot";
  fetchedAt: number;
  inflight?: Promise<GroupCache>;
}

const groupCaches = new Map<SatGroupKey, GroupCache>();
let activeCache: { entries: Map<number, TleEntry>; source: "live" | "snapshot"; fetchedAt: number; inflight?: Promise<NonNullable<typeof activeCache>> } | null = null;

async function fetchText(url: string): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "OrbitWatch/1.0 (satellite pass predictor demo)" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function snapshotMap(): Map<string, TleEntry> {
  const m = new Map<string, TleEntry>();
  for (const g of TLE_SNAPSHOT) {
    for (const e of parse3le(g.text)) {
      m.set(`${g.group}:${e.noradId}`, e);
    }
  }
  return m;
}

let snapMap: Map<string, TleEntry> | null = null;
function snapshotEntry(group: string, noradId: number): TleEntry | null {
  if (!snapMap) snapMap = snapshotMap();
  return snapMap.get(`${group}:${noradId}`) ?? null;
}

async function getGroup(key: SatGroupKey): Promise<GroupCache> {
  const existing = groupCaches.get(key);
  if (existing && Date.now() - existing.fetchedAt < CACHE_TTL_MS) return existing;
  if (existing?.inflight) return existing.inflight;

  const p = (async (): Promise<GroupCache> => {
    try {
      const text = await fetchText(`https://retlector.eu/${key}/3le`);
      const entries = parse3le(text);
      if (entries.length === 0) throw new Error("empty group");
      const cache: GroupCache = { entries: new Map(entries.map((e) => [e.noradId, e])), source: "live", fetchedAt: Date.now() };
      groupCaches.set(key, cache);
      return cache;
    } catch {
      const snap = TLE_SNAPSHOT.find((g) => g.group === key);
      if (snap) {
        const entries = parse3le(snap.text);
        const cache: GroupCache = { entries: new Map(entries.map((e) => [e.noradId, e])), source: "snapshot", fetchedAt: Date.now() };
        groupCaches.set(key, cache);
        return cache;
      }
      throw new Error(`No orbital data available for group "${key}"`);
    }
  })();

  if (existing) existing.inflight = p;
  try {
    return await p;
  } finally {
    if (existing) existing.inflight = undefined;
  }
}

async function getActive(): Promise<NonNullable<typeof activeCache>> {
  if (activeCache && Date.now() - activeCache.fetchedAt < CACHE_TTL_MS) return activeCache;
  if (activeCache?.inflight) return activeCache.inflight;
  const p = (async () => {
    try {
      const text = await fetchText("https://retlector.eu/active/3le");
      const entries = parse3le(text);
      if (entries.length === 0) throw new Error("empty active");
      activeCache = { entries: new Map(entries.map((e) => [e.noradId, e])), source: "live", fetchedAt: Date.now() };
    } catch {
      if (!activeCache) {
        // Build a pseudo active cache from the snapshot (all groups merged)
        const merged = new Map<number, TleEntry>();
        for (const g of TLE_SNAPSHOT) for (const e of parse3le(g.text)) merged.set(e.noradId, e);
        activeCache = { entries: merged, source: "snapshot", fetchedAt: Date.now() };
      }
    }
    return activeCache!;
  })();
  if (activeCache) activeCache.inflight = p;
  try {
    return await p;
  } finally {
    if (activeCache) activeCache.inflight = undefined;
  }
}

export interface GroupList {
  source: "live" | "snapshot";
  fetchedAt: number;
  sats: { noradId: number; name: string }[];
}

export async function getGroupList(key: SatGroupKey): Promise<GroupList> {
  const cache = await getGroup(key);
  const sats = [...cache.entries.values()]
    .map((e) => ({ noradId: e.noradId, name: e.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { source: cache.source, fetchedAt: cache.fetchedAt, sats };
}

/** Look up a single satellite by NORAD catalog id (any active satellite). */
export async function lookupNorad(noradId: number): Promise<TleResolved | null> {
  const active = await getActive();
  const entry = active.entries.get(noradId) ?? null;
  if (!entry) return null;
  return { ...entry, source: active.source, epoch: tleEpochDate(entry.line1) };
}

/**
 * Resolve elements for a batch of NORAD ids, preferring curated group caches,
 * then the active catalog, then the bundled snapshot.
 */
export async function resolveForPasses(noradIds: number[]): Promise<{ found: Map<number, TleResolved>; missing: number[] }> {
  const found = new Map<number, TleResolved>();
  const missing: number[] = [];
  const rest: number[] = [];

  for (const id of noradIds) {
    let hit: TleEntry | null = null;
    let src: "live" | "snapshot" = "live";
    for (const g of SAT_GROUPS) {
      const c = groupCaches.get(g.key);
      if (c && c.entries.has(id)) {
        hit = c.entries.get(id)!;
        src = c.source;
        break;
      }
    }
    if (hit) found.set(id, { ...hit, source: src, epoch: tleEpochDate(hit.line1) });
    else rest.push(id);
  }

  if (rest.length > 0) {
    const active = await getActive();
    for (const id of rest) {
      const e = active.entries.get(id);
      if (e) found.set(id, { ...e, source: active.source, epoch: tleEpochDate(e.line1) });
      else {
        // last resort: any snapshot group
        let snapHit: TleEntry | null = null;
        for (const g of SAT_GROUPS) {
          const cand = snapshotEntry(g.key, id);
          if (cand) {
            snapHit = cand;
            break;
          }
        }
        if (snapHit) found.set(id, { ...snapHit, source: "snapshot", epoch: tleEpochDate(snapHit.line1) });
        else missing.push(id);
      }
    }
  }

  return { found, missing };
}
