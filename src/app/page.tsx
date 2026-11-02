"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Globe2, List, Orbit, Satellite as SatelliteIcon } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import { useToast } from "@/hooks/use-toast";
import type { PassesResponse } from "@/lib/sat/types";
import { LocationCard } from "@/components/predictor/location-card";
import { SatelliteCard } from "@/components/predictor/satellite-card";
import { SettingsCard } from "@/components/predictor/settings-card";
import { ResultsPanel } from "@/components/predictor/results-panel";

// three.js + satellite.js only load when the globe tab is first opened
const GlobePanel = dynamic(() => import("@/components/predictor/globe/globe-panel").then((m) => m.GlobePanel), {
  ssr: false,
  loading: () => (
    <div className="flex h-[380px] items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/40 text-sm text-zinc-500" aria-busy="true">
      Loading 3D globe…
    </div>
  ),
});

type ViewMode = "passes" | "globe";

function LiveClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    const t = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(t);
      clearInterval(id);
    };
  }, []);
  if (!now) {
    return <span className="font-mono text-xs text-zinc-600">--:--:--</span>;
  }
  const local = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(now);
  const utc = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "UTC" }).format(now);
  return (
    <span className="hidden font-mono text-xs tabular-nums text-zinc-500 sm:inline" suppressHydrationWarning>
      {local} local · <span className="text-zinc-400">{utc} UTC</span>
    </span>
  );
}

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const observer = useAppStore((s) => s.observer);
  const selected = useAppStore((s) => s.selected);
  const params = useAppStore((s) => s.params);
  const { toast } = useToast();

  const [data, setData] = useState<PassesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("passes");
  const [globeOpened, setGlobeOpened] = useState(false);

  useEffect(() => setMounted(true), []);

  const runPrediction = useCallback(async () => {
    if (selected.length === 0) {
      toast({ title: "No satellites selected", description: "Pick at least one satellite to predict passes.", variant: "destructive" });
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/passes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          observer,
          noradIds: selected.map((s) => s.noradId),
          days: params.days,
          minElevation: params.minElevation,
          visibleOnly: params.visibleOnly,
        }),
      });
      const j = (await res.json()) as PassesResponse & { error?: string };
      if (!res.ok) throw new Error(j.error ?? `Prediction failed (${res.status})`);
      setData(j);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Prediction failed";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [observer, selected, params, toast]);

  useEffect(() => {
    if (mounted && !data && !loading && !error) void runPrediction();
  }, [mounted]);

  const liveSource = data?.sats.some((s) => s.source === "live") ?? false;

  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
      <header className="sticky top-0 z-40 border-b border-zinc-800/80 bg-zinc-950/85 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-3 px-4">
          <span aria-hidden className="grid h-9 w-9 place-items-center rounded-lg bg-amber-500 text-zinc-950 shadow-lg shadow-amber-500/25">
            <Orbit className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-base font-bold leading-tight">OrbitWatch</p>
            <p className="text-[11px] leading-tight text-zinc-500">Satellite pass predictor</p>
          </div>
          <div className="ml-auto flex items-center gap-4">
            {data && (
              <span className="hidden items-center gap-1.5 rounded-full border border-zinc-800 px-2.5 py-1 text-xs text-zinc-400 md:inline-flex">
                <span className={`h-1.5 w-1.5 rounded-full ${liveSource ? "animate-pulse bg-emerald-400" : "bg-amber-400"}`} />
                {liveSource ? "Live TLE" : "Snapshot TLE"}
              </span>
            )}
            <LiveClock />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        {!mounted ? (
          <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-zinc-500" aria-busy="true">
            <SatelliteIcon aria-hidden className="h-8 w-8 animate-pulse text-amber-500/70" />
            <p className="text-sm">Initializing orbit models…</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
            <div className="space-y-4 lg:col-span-4 xl:col-span-3">
              <LocationCard />
              <SatelliteCard />
              <SettingsCard onPredict={runPrediction} loading={loading} />
            </div>
            <div className="min-w-0 lg:col-span-8 xl:col-span-9">
              <div
                role="tablist"
                aria-label="View mode"
                className="mb-4 inline-flex overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/60 p-1"
              >
                {(
                  [
                    ["passes", "Passes", List],
                    ["globe", "3D Globe", Globe2],
                  ] as const
                ).map(([key, label, Icon]) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={view === key}
                    onClick={() => {
                      setView(key);
                      if (key === "globe") setGlobeOpened(true);
                    }}
                    className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors ${
                      view === key ? "bg-amber-500 text-zinc-950 shadow" : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    <Icon aria-hidden className="h-3.5 w-3.5" />
                    {label}
                  </button>
                ))}
              </div>
              <div className={view === "passes" ? "" : "hidden"}>
                <ResultsPanel data={data} loading={loading} error={error} onRetry={runPrediction} />
              </div>
              {globeOpened && (
                <div className={view === "globe" ? "" : "hidden"}>
                  <GlobePanel />
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      <footer className="mt-auto border-t border-zinc-800/80">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-1 px-4 py-4 text-xs text-zinc-500 sm:flex-row sm:items-center sm:justify-between">
          <p>Orbital elements: CelesTrak GP · SGP4/SDP4 propagation via satellite.js</p>
          <p>Predictions are informational — not for operational or safety use.</p>
        </div>
      </footer>
    </div>
  );
}
