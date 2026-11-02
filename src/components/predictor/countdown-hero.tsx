"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Clock, Compass, Gauge } from "lucide-react";
import type { PassInfo } from "@/lib/sat/types";
import { compass16, fmtCountdown, fmtDateLong, fmtDuration, fmtTime } from "@/lib/format";
import { VIS_META } from "./pass-detail-dialog";

export function CountdownHero({ passes }: { passes: PassInfo[] }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (passes.length === 0) return null;
  const next = passes.find((p) => p.end > now);
  if (!next) return null;

  const live = next.start <= now;
  const vis = VIS_META[next.visibility];
  const VisIcon = vis.icon;
  const progress = live ? Math.min(1, Math.max(0, (now - next.start) / (next.end - next.start))) : 0;

  return (
    <section
      aria-label="Next pass"
      className="relative overflow-hidden rounded-xl border border-amber-500/20 bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-950 p-5 sm:p-6"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-amber-500/10 blur-3xl"
      />
      <div className="relative grid gap-6 md:grid-cols-[1.3fr_1fr] md:items-center">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-amber-400/90">
            {live ? (
              <>
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                Pass in progress
              </>
            ) : (
              <>
                <Clock aria-hidden className="h-3.5 w-3.5" /> Next pass
              </>
            )}
          </p>
          <p className="mt-2 truncate text-lg font-semibold text-zinc-100">
            {next.satName}
            <span className="ml-2 font-mono text-xs font-normal text-zinc-500">NORAD {next.noradId}</span>
          </p>
          <p className="mt-1 text-sm text-zinc-400">
            {fmtDateLong(next.start)} · {fmtTime(next.start)} → {fmtTime(next.end)} · {fmtDuration(next.durationS)}
          </p>
          <p className="mt-4 font-mono text-4xl font-semibold tabular-nums text-white sm:text-5xl">
            {live ? (
              <>
                <span className="text-emerald-400">setting</span> in {fmtCountdown(next.end - now)}
              </>
            ) : (
              <>T–{fmtCountdown(next.start - now)}</>
            )}
          </p>
          {live && (
            <div className="mt-3 h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-amber-400 transition-[width] duration-1000 ease-linear"
                style={{ width: `${(progress * 100).toFixed(1)}%` }}
              />
            </div>
          )}
        </div>

        <div className="grid gap-2.5 text-sm md:justify-items-end">
          <p className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 ${vis.badge}`}>
            <VisIcon aria-hidden className="h-3.5 w-3.5" /> {vis.label}
          </p>
          <p className="flex items-center gap-2 text-zinc-300">
            <Gauge aria-hidden className="h-4 w-4 text-zinc-500" />
            <span className="font-mono tabular-nums text-amber-400">{next.maxEl.toFixed(1)}°</span> max elevation
          </p>
          <p className="flex items-center gap-2 text-zinc-300">
            <Compass aria-hidden className="h-4 w-4 text-zinc-500" />
            {compass16(next.startAz)} → {compass16(next.endAz)}
            <ArrowRight aria-hidden className="h-3.5 w-3.5 text-zinc-600" />
            culminates {compass16(next.maxElAz)}
          </p>
          <p className="font-mono text-xs tabular-nums text-zinc-500">
            {next.rangeAtMaxKm.toLocaleString()} km at closest approach
          </p>
        </div>
      </div>
    </section>
  );
}
