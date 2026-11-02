import { NextRequest, NextResponse } from "next/server";
import { twoline2satrec } from "satellite.js";
import { resolveForPasses } from "@/lib/sat/tle-store";
import { findPasses } from "@/lib/sat/passes";
import type { PassesResponse, SatPassResult } from "@/lib/sat/types";

export const dynamic = "force-dynamic";

const MAX_SATS = 12;
const MAX_DAYS = 7;

interface Body {
  observer?: { lat?: number; lng?: number; altM?: number; label?: string };
  noradIds?: number[];
  days?: number;
  minElevation?: number;
  visibleOnly?: boolean;
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { observer, noradIds } = body;
  const days = Math.min(Math.max(Number(body.days) || 2, 1), MAX_DAYS);
  const minElevation = Math.min(Math.max(Number(body.minElevation) ?? 10, 0), 60);
  const visibleOnly = Boolean(body.visibleOnly);

  if (!observer || typeof observer.lat !== "number" || typeof observer.lng !== "number") {
    return NextResponse.json({ error: "Observer latitude/longitude required" }, { status: 400 });
  }
  if (Math.abs(observer.lat) > 90 || Math.abs(observer.lng) > 180) {
    return NextResponse.json({ error: "Observer coordinates out of range" }, { status: 400 });
  }
  if (!Array.isArray(noradIds) || noradIds.length === 0) {
    return NextResponse.json({ error: "Select at least one satellite" }, { status: 400 });
  }
  const uniqueIds = [...new Set(noradIds.filter((n) => Number.isInteger(n) && n > 0))];
  if (uniqueIds.length === 0) {
    return NextResponse.json({ error: "No valid satellite ids" }, { status: 400 });
  }
  if (uniqueIds.length > MAX_SATS) {
    return NextResponse.json({ error: `At most ${MAX_SATS} satellites per prediction` }, { status: 400 });
  }

  const { found, missing } = await resolveForPasses(uniqueIds);
  if (found.size === 0) {
    return NextResponse.json(
      { error: `No orbital elements found (missing: ${missing.join(", ")})` },
      { status: 503 },
    );
  }

  const observerRad = {
    latitude: (observer.lat * Math.PI) / 180,
    longitude: (observer.lng * Math.PI) / 180,
    height: Math.min(Math.max(Number(observer.altM) || 0, -500) / 1000, 10), // km, clamp
  };

  const startMs = Date.now();
  const endMs = startMs + days * 86_400_000;
  const sats: SatPassResult[] = [];

  for (const id of uniqueIds) {
    const tle = found.get(id);
    if (!tle) continue;
    let result: SatPassResult;
    try {
      const satrec = twoline2satrec(tle.line1, tle.line2);
      const { passes, error } = findPasses(satrec, observerRad, startMs, endMs);
      const filtered = passes
        .filter((p) => p.maxEl >= minElevation)
        .filter((p) => !visibleOnly || p.visibility === "visible");
      result = {
        noradId: id,
        name: tle.name,
        source: tle.source,
        tleEpoch: tle.epoch ? tle.epoch.toISOString() : null,
        passes: filtered.map((p) => ({ ...p, noradId: id, satName: tle.name })).sort((a, b) => a.start - b.start),
        error: error ?? (filtered.length === 0 && passes.length > 0 ? "No passes match your filters" : undefined),
      };
    } catch {
      result = {
        noradId: id,
        name: tle.name,
        source: tle.source,
        tleEpoch: tle.epoch ? tle.epoch.toISOString() : null,
        passes: [],
        error: "Failed to propagate this orbit",
      };
    }
    sats.push(result);
  }

  const response: PassesResponse = {
    generatedAt: new Date().toISOString(),
    windowDays: days,
    minElevation,
    visibleOnly,
    observer: {
      label: observer.label || `${observer.lat.toFixed(3)}, ${observer.lng.toFixed(3)}`,
      lat: observer.lat,
      lng: observer.lng,
      altM: Number(observer.altM) || 0,
    },
    sats,
  };
  return NextResponse.json(response);
}
