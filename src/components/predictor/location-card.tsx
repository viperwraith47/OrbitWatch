"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, LocateFixed, MapPin, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { GeocodeResult, ObserverWithLabel } from "@/lib/sat/types";
import { useAppStore } from "@/store/useAppStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const PRESETS: ObserverWithLabel[] = [
  { label: "New York, US", lat: 40.7128, lng: -74.006, altM: 10 },
  { label: "London, UK", lat: 51.5074, lng: -0.1278, altM: 11 },
  { label: "Berlin, DE", lat: 52.52, lng: 13.405, altM: 34 },
  { label: "Tokyo, JP", lat: 35.6762, lng: 139.6503, altM: 40 },
  { label: "Sydney, AU", lat: -33.8688, lng: 151.2093, altM: 58 },
  { label: "Los Angeles, US", lat: 34.0522, lng: -118.2437, altM: 93 },
];

function fmtLat(lat: number): string {
  return `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? "N" : "S"}`;
}
function fmtLng(lng: number): string {
  return `${Math.abs(lng).toFixed(4)}° ${lng >= 0 ? "E" : "W"}`;
}

/** Manual coordinate entry. Remounted (via key) whenever the applied observer changes, so its inputs re-sync without effects. */
function ManualFields({ observer, onApply }: { observer: ObserverWithLabel; onApply: (o: ObserverWithLabel) => void }) {
  const [manual, setManual] = useState({
    lat: String(observer.lat),
    lng: String(observer.lng),
    altM: String(observer.altM),
  });
  const [manualError, setManualError] = useState<string | null>(null);

  const applyManual = () => {
    const lat = Number.parseFloat(manual.lat);
    const lng = Number.parseFloat(manual.lng);
    const altM = Number.parseFloat(manual.altM || "0");
    if (Number.isNaN(lat) || lat < -90 || lat > 90) return setManualError("Latitude must be between -90 and 90");
    if (Number.isNaN(lng) || lng < -180 || lng > 180) return setManualError("Longitude must be between -180 and 180");
    if (Number.isNaN(altM) || altM < -500 || altM > 10000) return setManualError("Altitude must be -500…10000 m");
    setManualError(null);
    onApply({ label: "Custom coordinates", lat, lng, altM: Math.round(altM) });
  };

  return (
    <details className="group">
      <summary className="cursor-pointer select-none text-xs text-zinc-500 hover:text-zinc-300">
        Enter coordinates manually
      </summary>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_84px_auto] sm:items-end">
        <div className="min-w-0">
          <Label htmlFor="lat" className="text-[11px] text-zinc-500">
            Latitude
          </Label>
          <Input
            id="lat"
            inputMode="decimal"
            value={manual.lat}
            onChange={(e) => setManual((m) => ({ ...m, lat: e.target.value }))}
            className="mt-1 h-9 border-zinc-700 bg-zinc-950/60 font-mono text-xs"
          />
        </div>
        <div className="min-w-0">
          <Label htmlFor="lng" className="text-[11px] text-zinc-500">
            Longitude
          </Label>
          <Input
            id="lng"
            inputMode="decimal"
            value={manual.lng}
            onChange={(e) => setManual((m) => ({ ...m, lng: e.target.value }))}
            className="mt-1 h-9 border-zinc-700 bg-zinc-950/60 font-mono text-xs"
          />
        </div>
        <div className="min-w-0">
          <Label htmlFor="alt" className="text-[11px] text-zinc-500">
            Alt, m
          </Label>
          <Input
            id="alt"
            inputMode="numeric"
            value={manual.altM}
            onChange={(e) => setManual((m) => ({ ...m, altM: e.target.value }))}
            className="mt-1 h-9 border-zinc-700 bg-zinc-950/60 font-mono text-xs"
          />
        </div>
        <Button size="sm" className="h-9 w-full bg-amber-500 text-xs font-semibold text-zinc-950 hover:bg-amber-400 sm:w-auto" onClick={applyManual}>
          Apply
        </Button>
      </div>
      {manualError && <p className="mt-1 text-xs text-red-400">{manualError}</p>}
    </details>
  );
}

export function LocationCard() {
  const observer = useAppStore((s) => s.observer);
  const setObserver = useAppStore((s) => s.setObserver);
  const { toast } = useToast();

  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [openList, setOpenList] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);

  const { data: geo, isFetching } = useQuery({
    queryKey: ["geocode", debounced],
    enabled: debounced.length >= 2,
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<GeocodeResult[]> => {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(debounced)}`);
      if (!res.ok) throw new Error("City search unavailable");
      const j = (await res.json()) as { results?: GeocodeResult[] };
      return j.results ?? [];
    },
  });

  const applyGeo = (g: GeocodeResult) => {
    const label = [g.name, g.admin1, g.country].filter(Boolean).join(", ");
    setObserver({ label, lat: g.lat, lng: g.lon, altM: Math.round(g.elevation) });
    setQ("");
    setDebounced("");
    setOpenList(false);
  };

  const applyManual = (o: ObserverWithLabel) => setObserver(o);

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      toast({ title: "Geolocation unavailable", description: "This browser does not support geolocation.", variant: "destructive" });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setObserver({
          label: "My location",
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          altM: Math.round(pos.coords.altitude ?? 0),
        });
        toast({ title: "Location applied", description: "Using your device location." });
      },
      (err) => {
        toast({
          title: "Could not get your location",
          description: err.message + " Try searching for a city instead.",
          variant: "destructive",
        });
      },
      { timeout: 10000, maximumAge: 60000 },
    );
  };

  const results = geo ?? [];
  const showList = openList && debounced.length >= 2;

  return (
    <section aria-labelledby="loc-h" className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <MapPin aria-hidden className="h-4 w-4 text-amber-400" />
        <h2 id="loc-h" className="text-sm font-semibold">
          Observer location
        </h2>
        <Button
          size="sm"
          variant="outline"
          className="ml-auto h-7 gap-1 border-zinc-700 text-xs text-zinc-300 hover:bg-zinc-800"
          onClick={useMyLocation}
        >
          <LocateFixed aria-hidden className="h-3.5 w-3.5" /> Use my location
        </Button>
      </div>

      <p className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-sm">
        <span className="font-medium text-zinc-100">{observer.label}</span>
        <span className="ml-2 font-mono text-xs text-zinc-500">
          {fmtLat(observer.lat)}, {fmtLng(observer.lng)} · {observer.altM} m
        </span>
      </p>

      <div className="mt-3 space-y-3">
        <div className="relative">
          <div className="relative">
            <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
            <Input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setOpenList(true);
              }}
              onFocus={() => setOpenList(true)}
              placeholder="Search a city…"
              aria-label="Search city"
              className="border-zinc-700 bg-zinc-950/60 pl-8 text-sm"
              autoComplete="off"
            />
          </div>
          {showList && (
            <div
              role="listbox"
              aria-label="City results"
              className="slim-scroll absolute z-30 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl shadow-black/40"
              onBlur={() => setOpenList(false)}
            >
              {isFetching && <p className="px-3 py-2 text-xs text-zinc-500">Searching…</p>}
              {!isFetching && results.length === 0 && (
                <p className="px-3 py-2 text-xs text-zinc-500">No cities found.</p>
              )}
              {results.map((g, i) => (
                <button
                  key={`${g.name}-${i}`}
                  type="button"
                  role="option"
                  aria-selected="false"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-zinc-800 focus:bg-zinc-800 focus:outline-none"
                  onClick={() => applyGeo(g)}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-zinc-100">{g.name}</span>
                    <span className="block truncate text-xs text-zinc-500">
                      {[g.admin1, g.country].filter(Boolean).join(", ")}
                    </span>
                  </span>
                  <Check aria-hidden className="ml-auto h-3.5 w-3.5 shrink-0 text-zinc-600" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Preset locations">
          {PRESETS.map((p) => {
            const active = p.label === observer.label;
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => setObserver(p)}
                className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                  active
                    ? "border-amber-500/50 bg-amber-500/15 text-amber-300"
                    : "border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        <ManualFields key={`${observer.lat}|${observer.lng}|${observer.altM}`} observer={observer} onApply={applyManual} />
      </div>
    </section>
  );
}
