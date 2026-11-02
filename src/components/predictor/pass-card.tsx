"use client";

import { useState } from "react";
import { Radio } from "lucide-react";
import type { PassInfo } from "@/lib/sat/types";
import { compass16, fmtDuration, fmtTime, maxElQuality } from "@/lib/format";
import { PassDetailDialog, VIS_META } from "./pass-detail-dialog";

const QUALITY_TONE: Record<string, string> = {
  excellent: "text-emerald-400",
  good: "text-amber-400",
  fair: "text-zinc-300",
  low: "text-zinc-500",
};

export function PassCard({
  pass,
  now,
  tleEpoch,
}: {
  pass: PassInfo;
  now: number;
  tleEpoch: string | null;
}) {
  const [open, setOpen] = useState(false);
  const vis = VIS_META[pass.visibility];
  const quality = maxElQuality(pass.maxEl);
  const live = pass.start <= now && pass.end > now;
  const soon = !live && pass.start - now < 20 * 60_000;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`group grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 rounded-lg border border-zinc-800/80 border-l-2 bg-zinc-900/60 p-3 text-left transition-colors hover:border-zinc-700 hover:bg-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 sm:gap-4 sm:p-4 ${vis.card} ${live ? "border-l-emerald-400" : ""}`}
        aria-label={`Pass of ${pass.satName} starting ${new Date(pass.start).toLocaleString()}`}
      >
        <div className="min-w-[86px] sm:min-w-[110px]">
          <p className="font-mono text-sm tabular-nums text-zinc-200">
            {fmtTime(pass.start)} – {fmtTime(pass.end)}
          </p>
          <p className="mt-0.5 text-xs text-zinc-500">{fmtDuration(pass.durationS)}</p>
        </div>

        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="min-w-0 truncate text-sm font-medium text-zinc-100 group-hover:text-white">
              {pass.satName}
            </span>
            <span className="font-mono text-[11px] text-zinc-600">#{pass.noradId}</span>
            {live && (
              <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-400">
                <Radio aria-hidden className="h-3 w-3 animate-pulse" /> Live now
              </span>
            )}
            {soon && !live && (
              <span className="inline-flex items-center rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-amber-400">
                Soon
              </span>
            )}
          </p>
          <p className="mt-1 truncate text-xs text-zinc-500">
            {compass16(pass.startAz)} {pass.startAz.toFixed(0)}° → {compass16(pass.maxElAz)}{" "}
            {pass.maxElAz.toFixed(0)}° · sets {compass16(pass.endAz)} {pass.endAz.toFixed(0)}°
          </p>
        </div>

        <div className="flex items-center gap-3 sm:gap-4">
          <div className="text-right">
            <p className={`font-mono text-xl leading-6 tabular-nums sm:text-2xl ${QUALITY_TONE[quality.tone]}`}>
              {pass.maxEl.toFixed(0)}°
            </p>
            <p className="text-[11px] uppercase tracking-wide text-zinc-600">
              max · {quality.label.toLowerCase()}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] leading-4 ${vis.badge}`}>
              <vis.icon aria-hidden className="h-3 w-3" />
              <span className="hidden sm:inline">{vis.short}</span>
            </span>
          </div>
        </div>
      </button>

      <PassDetailDialog pass={pass} tleEpoch={tleEpoch} open={open} onOpenChange={setOpen} />
    </>
  );
}
