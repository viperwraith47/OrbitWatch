"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, RefreshCw, Satellite, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { PassInfo, PassesResponse, SatPassResult } from "@/lib/sat/types";
import { dayKey, fmtDateFull, relativeDayLabel } from "@/lib/format";
import { PassCard } from "./pass-card";
import { CountdownHero } from "./countdown-hero";

interface Props {
  data: PassesResponse | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

export function ResultsPanel({ data, loading, error, onRetry }: Props) {
  const [now, setNow] = useState(() => Date.now());
  // Satellite filter state, anchored to the result it belongs to.
  // When a new result arrives (data changes), the filter resets implicitly.
  const [satFilter, setSatFilter] = useState<{ for: PassesResponse | null; hidden: Set<number> }>({
    for: null,
    hidden: new Set(),
  });
  const hidden = satFilter.for === data ? satFilter.hidden : new Set<number>();

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const allPasses = useMemo<PassInfo[]>(() => {
    if (!data) return [];
    const flat = data.sats.flatMap((s) => s.passes);
    return flat.sort((a, b) => a.start - b.start);
  }, [data]);

  const shown = useMemo(() => allPasses.filter((p) => !hidden.has(p.noradId)), [allPasses, hidden]);

  const perSat = useMemo(() => {
    const m = new Map<number, { name: string; count: number }>();
    for (const p of allPasses) {
      const e = m.get(p.noradId);
      if (e) e.count += 1;
      else m.set(p.noradId, { name: p.satName, count: 1 });
    }
    return m;
  }, [allPasses]);

  const tleEpochBySat = useMemo(() => {
    const m = new Map<number, string | null>();
    data?.sats.forEach((s: SatPassResult) => m.set(s.noradId, s.tleEpoch));
    return m;
  }, [data]);

  const days = useMemo(() => {
    const groups: { key: string; label: string; date: string; passes: PassInfo[] }[] = [];
    for (const p of shown) {
      const k = dayKey(p.start);
      let g = groups.find((x) => x.key === k);
      if (!g) {
        g = { key: k, label: relativeDayLabel(p.start), date: fmtDateFull(p.start), passes: [] };
        groups.push(g);
      }
      g.passes.push(p);
    }
    return groups;
  }, [shown]);

  if (loading && !data) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Loading predictions">
        <Skeleton className="h-40 w-full rounded-xl" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle aria-hidden className="h-4 w-4" />
        <AlertTitle>Prediction failed</AlertTitle>
        <AlertDescription className="mt-1 flex flex-wrap items-center gap-3">
          <span>{error}</span>
          <Button size="sm" variant="outline" onClick={onRetry} className="ml-auto">
            <RefreshCw aria-hidden className="mr-1 h-3.5 w-3.5" /> Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (!data || allPasses.length === 0) {
    return (
      <div className="flex h-full min-h-[420px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-zinc-800 p-8 text-center">
        <Satellite aria-hidden className="h-10 w-10 text-zinc-700" />
        <p className="text-sm font-medium text-zinc-300">No passes in this window</p>
        <p className="max-w-sm text-xs leading-relaxed text-zinc-500">
          Try a longer prediction window, a lower minimum elevation, or pick satellites that
          overfly your latitude more often (the ISS and Tiangong only favor locations within
          ±52°).
        </p>
      </div>
    );
  }

  const anyLiveSource = data.sats.some((s) => s.source === "live");
  const satErrors = data.sats.filter((s) => s.error);

  return (
    <div className="space-y-5">
      <CountdownHero passes={shown} />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="text-sm text-zinc-300">
          <span className="font-semibold text-white">{shown.length}</span> passes ·{" "}
          {new Set(shown.map((p) => p.noradId)).size} satellites · {data.windowDays}-day window ·
          min {data.minElevation}°
          {data.visibleOnly && " · naked-eye only"}
        </p>
        <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500">
          <span className={`h-1.5 w-1.5 rounded-full ${anyLiveSource ? "bg-emerald-400" : "bg-amber-400"}`} />
          {anyLiveSource ? "Live orbital elements" : "Cached snapshot"}
        </span>
      </div>

      {perSat.size > 1 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by satellite">
          {[...perSat.entries()].map(([norad, info]) => {
            const isHidden = hidden.has(norad);
            return (
              <button
                key={norad}
                type="button"
                aria-pressed={!isHidden}
                onClick={() =>
                  setSatFilter(() => {
                    const next = new Set(hidden);
                    if (next.has(norad)) next.delete(norad);
                    else next.add(norad);
                    return { for: data, hidden: next };
                  })
                }
                className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                  isHidden
                    ? "border-zinc-800 text-zinc-600 hover:border-zinc-700"
                    : "border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
                }`}
              >
                {info.name} · {info.count}
              </button>
            );
          })}
        </div>
      )}

      {satErrors.length > 0 && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 text-xs text-zinc-500">
          {satErrors.map((s) => (
            <p key={s.noradId}>
              <span className="text-zinc-400">{s.name}:</span> {s.error}
            </p>
          ))}
        </div>
      )}

      {days.map((g) => (
        <section key={g.key} aria-label={`Passes on ${g.date}`}>
          <h3 className="sticky top-16 z-10 -mx-1 mb-2 flex items-baseline gap-2 bg-zinc-950/90 px-1 py-1.5 backdrop-blur">
            <span className="text-sm font-semibold text-zinc-100">{g.label}</span>
            <span className="text-xs text-zinc-500">{g.date}</span>
            <span className="ml-auto inline-flex items-center gap-1 text-xs text-zinc-500">
              <Sparkles aria-hidden className="h-3 w-3 text-zinc-600" />
              {g.passes.length} pass{g.passes.length === 1 ? "" : "es"}
            </span>
          </h3>
          <div className="space-y-2.5">
            {g.passes.map((p) => (
              <PassCard key={`${p.noradId}-${p.start}`} pass={p} now={now} tleEpoch={tleEpochBySat.get(p.noradId) ?? null} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
