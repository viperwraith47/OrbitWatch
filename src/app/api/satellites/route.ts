import { NextRequest, NextResponse } from "next/server";
import { getGroupList, lookupNorad, SAT_GROUPS } from "@/lib/sat/tle-store";
import type { GroupListResponse } from "@/lib/sat/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/satellites?group=stations|visual|weather|science|amateur
 * GET /api/satellites?norad=25544
 */
export async function GET(req: NextRequest) {
  const group = req.nextUrl.searchParams.get("group");
  const noradRaw = req.nextUrl.searchParams.get("norad");

  try {
    if (noradRaw) {
      const noradId = Number.parseInt(noradRaw, 10);
      if (!Number.isInteger(noradId) || noradId <= 0 || noradId > 999999) {
        return NextResponse.json({ found: false, error: "Invalid NORAD id" }, { status: 400 });
      }
      const entry = await lookupNorad(noradId);
      if (!entry) {
        return NextResponse.json(
          { found: false, error: `NORAD ${noradId} not found in the active catalog` },
          { status: 404 },
        );
      }
      return NextResponse.json({
        found: true,
        sat: {
          noradId: entry.noradId,
          name: entry.name,
          source: entry.source,
          epoch: entry.epoch ? entry.epoch.toISOString() : null,
        },
      });
    }

    if (group) {
      const def = SAT_GROUPS.find((g) => g.key === group);
      if (!def) {
        return NextResponse.json({ error: `Unknown group "${group}"` }, { status: 400 });
      }
      const list = await getGroupList(def.key);
      const body: GroupListResponse = {
        group: def.key,
        label: def.label,
        source: list.source,
        fetchedAt: new Date(list.fetchedAt).toISOString(),
        sats: list.sats,
      };
      return NextResponse.json(body);
    }

    return NextResponse.json({
      groups: SAT_GROUPS.map((g) => ({ key: g.key, label: g.label, hint: g.hint })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Orbital data unavailable";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
