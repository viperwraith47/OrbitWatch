import { NextRequest, NextResponse } from "next/server";
import type { GeocodeResult } from "@/lib/sat/types";

export const dynamic = "force-dynamic";

interface OpenMeteoGeo {
  results?: {
    name: string;
    latitude: number;
    longitude: number;
    elevation?: number;
    country?: string;
    country_code?: string;
    admin1?: string;
  }[];
}

const cache = new Map<string, { at: number; results: GeocodeResult[] }>();
const TTL = 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  if (q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const key = q.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) {
    return NextResponse.json({ results: hit.results });
  }

  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=8&language=en&format=json`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    let data: OpenMeteoGeo;
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = (await res.json()) as OpenMeteoGeo;
    } finally {
      clearTimeout(timer);
    }

    const results: GeocodeResult[] = (data.results ?? []).map((r) => ({
      name: r.name,
      country: r.country || r.country_code || "",
      admin1: r.admin1 || "",
      lat: r.latitude,
      lon: r.longitude,
      elevation: r.elevation ?? 0,
    }));

    cache.set(key, { at: Date.now(), results });
    return NextResponse.json({ results });
  } catch {
    return NextResponse.json(
      { results: [], error: "City search is temporarily unavailable" },
      { status: 502 },
    );
  }
}
