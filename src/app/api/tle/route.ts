import { NextRequest, NextResponse } from "next/server";
import { resolveForPasses } from "@/lib/sat/tle-store";

export const dynamic = "force-dynamic";

const MAX_IDS = 16;

/**
 * GET /api/tle?norads=25544,48274,20580
 *
 * Returns raw TLE lines for the requested satellites so the client can
 * propagate positions locally (3D globe view) with satellite.js.
 */
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("norads") ?? "";
  const ids = raw
    .split(",")
    .map((s) => Number.parseInt(s.trim(), 10))
    .filter((n) => Number.isInteger(n) && n > 0 && n <= 999999);

  if (ids.length === 0) {
    return NextResponse.json({ error: "Provide ?norads=<id,id,...>" }, { status: 400 });
  }
  if (ids.length > MAX_IDS) {
    return NextResponse.json({ error: `Too many ids (max ${MAX_IDS})` }, { status: 400 });
  }

  try {
    const { found, missing } = await resolveForPasses(ids);
    let source: "live" | "snapshot" = "live";
    for (const e of found.values()) {
      if (e.source === "snapshot") source = "snapshot";
    }
    return NextResponse.json({
      source,
      fetchedAt: new Date().toISOString(),
      sats: [...found.values()].map((e) => ({
        noradId: e.noradId,
        name: e.name,
        line1: e.line1,
        line2: e.line2,
        epoch: e.epoch ? e.epoch.toISOString() : null,
      })),
      missing,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Orbital data unavailable";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
