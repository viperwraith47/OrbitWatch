"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Pause, Play, Eye, Sunset, Sun, MoonStar, Mountain, Clock3, Timer, Telescope } from "lucide-react";
import type { PassInfo, PassVisibility } from "@/lib/sat/types";
import { SkyChart, SkyChartLegend } from "./sky-chart";
import { compass16, fmtDateLong, fmtDuration, fmtTimeSec } from "@/lib/format";

export const VIS_META: Record<
  PassVisibility,
  { label: string; short: string; icon: typeof Eye; card: string; badge: string; explain: string }
> = {
  visible: {
    label: "Naked-eye pass",
    short: "Visible",
    icon: Eye,
    card: "border-l-emerald-500/60",
    badge: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    explain:
      "Sunlit satellite over a dark sky — this pass should be plainly visible to the naked eye. Give your eyes a minute to adapt and look in the direction it rises.",
  },
  twilight: {
    label: "Twilight pass",
    short: "Twilight",
    icon: Sunset,
    card: "border-l-amber-500/60",
    badge: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    explain:
      "The satellite is sunlit but the sky is still bright with twilight — challenging, though high passes are sometimes caught.",
  },
  daylight: {
    label: "Daylight pass",
    short: "Daylight",
    icon: Sun,
    card: "border-l-zinc-600",
    badge: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
    explain:
      "The pass happens in daylight — the satellite is sunlit, but the sky is too bright for naked-eye spotting (still fine for radio reception).",
  },
  eclipsed: {
    label: "In Earth's shadow",
    short: "Shadow",
    icon: MoonStar,
    card: "border-l-zinc-700",
    badge: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
    explain:
      "The satellite is inside Earth's shadow — optically invisible, but a radio pass nonetheless.",
  },
};

interface Props {
  pass: PassInfo;
  tleEpoch: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export function PassDetailDialog({ pass, tleEpoch, open, onOpenChange }: Props) {
  const samples = pass.samples;
  const tcaIdx = useMemo(() => {
    let best = 0;
    samples.forEach((s, i) => {
      if (s.el > samples[best].el) best = i;
    });
    return best;
  }, [samples]);

  const [idx, setIdx] = useState(() => tcaIdx);
  const [playing, setPlaying] = useState(false);

  // Each dialog instance is bound to one pass; when the pass changes,
  // remounting (PassCard passes a fresh open state) re-initializes idx.

  useEffect(() => {
    if (!playing) return;
    const n = samples.length;
    if (n < 2) return;
    const stepMs = Math.max(40, 6000 / n);
    const id = setInterval(() => {
      setIdx((cur) => {
        if (cur >= n - 1) {
          setPlaying(false);
          return cur;
        }
        return cur + 1;
      });
    }, stepMs);
    return () => clearInterval(id);
  }, [playing, samples.length]);

  if (samples.length === 0) return null;
  const cur = samples[Math.min(idx, samples.length - 1)];
  const vis = VIS_META[pass.visibility];
  const VisIcon = vis.icon;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2 pr-6">
            <Telescope aria-hidden className="h-5 w-5 text-amber-400" />
            {pass.satName}
            <span className="font-mono text-xs font-normal text-zinc-500">NORAD {pass.noradId}</span>
          </DialogTitle>
          <DialogDescription>
            {fmtDateLong(pass.start)} · {fmtTimeSec(pass.start)} → {fmtTimeSec(pass.end)} local ·{" "}
            {fmtDuration(pass.durationS)}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 sm:grid-cols-[1.25fr_1fr]">
          <div className="min-w-0">
            <SkyChart samples={samples} tcaIdx={tcaIdx} markerIdx={idx} onMarkerChange={setIdx} />
            <div className="mt-3">
              <SkyChartLegend />
            </div>
            <div className="mt-4 flex items-center gap-3">
              <Button
                variant="outline"
                size="icon"
                aria-label={playing ? "Pause" : "Play"}
                className="h-9 w-9 shrink-0 rounded-full border-zinc-700 bg-zinc-900 hover:bg-zinc-800"
                onClick={() => {
                  if (!playing && idx >= samples.length - 1) setIdx(0);
                  setPlaying((p) => !p);
                }}
              >
                {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </Button>
              <Slider
                className="flex-1 min-w-0"
                value={[Math.min(idx, samples.length - 1)]}
                min={0}
                max={samples.length - 1}
                step={1}
                onValueChange={(v) => {
                  setIdx(v[0]);
                  setPlaying(false);
                }}
                aria-label="Time through pass"
              />
              <span className="w-[92px] shrink-0 text-right font-mono text-xs tabular-nums text-zinc-400">
                {fmtTimeSec(cur.t)}
              </span>
            </div>
            <p className="mt-2 text-center font-mono text-xs tabular-nums text-zinc-500" aria-live="polite">
              az {cur.az.toFixed(0)}° ({compass16(cur.az)}) · el {cur.el.toFixed(1)}° · {cur.rangeKm.toLocaleString()} km ·{" "}
              {cur.sunlit ? "sunlit" : "in shadow"}
            </p>
          </div>

          <div className="min-w-0">
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">Rises (AOS)</dt>
                <dd className="font-mono tabular-nums">
                  {fmtTimeSec(pass.start)} · {compass16(pass.startAz)} {pass.startAz.toFixed(0)}°
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">Culminates (TCA)</dt>
                <dd className="font-mono tabular-nums text-amber-400">
                  {fmtTimeSec(pass.maxElT)} · {compass16(pass.maxElAz)} {pass.maxElAz.toFixed(0)}° ·{" "}
                  {pass.maxEl.toFixed(1)}° up
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">Sets (LOS)</dt>
                <dd className="font-mono tabular-nums">
                  {fmtTimeSec(pass.end)} · {compass16(pass.endAz)} {pass.endAz.toFixed(0)}°
                </dd>
              </div>
            </dl>

            <Separator className="my-4" />

            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div>
                <dt className="flex items-center gap-1 text-xs text-zinc-500">
                  <Timer aria-hidden className="h-3.5 w-3.5" /> Duration
                </dt>
                <dd className="font-mono tabular-nums">{fmtDuration(pass.durationS)}</dd>
              </div>
              <div>
                <dt className="flex items-center gap-1 text-xs text-zinc-500">
                  <Mountain aria-hidden className="h-3.5 w-3.5" /> Slant range
                </dt>
                <dd className="font-mono tabular-nums">{pass.rangeAtMaxKm.toLocaleString()} km</dd>
              </div>
              <div>
                <dt className="flex items-center gap-1 text-xs text-zinc-500">
                  <Sun aria-hidden className="h-3.5 w-3.5" /> Sun altitude
                </dt>
                <dd className="font-mono tabular-nums">{pass.sunElAtMax.toFixed(1)}°</dd>
              </div>
              <div>
                <dt className="flex items-center gap-1 text-xs text-zinc-500">
                  <Clock3 aria-hidden className="h-3.5 w-3.5" /> Elements epoch
                </dt>
                <dd className="font-mono tabular-nums text-xs">
                  {tleEpoch ? new Date(tleEpoch).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—"}
                </dd>
              </div>
            </dl>

            <div className={`mt-4 rounded-lg border p-3 ${vis.badge}`}>
              <p className="flex items-center gap-2 text-sm font-semibold">
                <VisIcon aria-hidden className="h-4 w-4" /> {vis.label}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-zinc-300/90">{vis.explain}</p>
            </div>

            {pass.continuous && (
              <p className="mt-3 rounded-lg border border-zinc-700 bg-zinc-900 p-3 text-xs text-zinc-400">
                This object stays above your horizon for the entire prediction window (very high or
                geostationary orbit) — start/end mark the window edges, not a real pass.
              </p>
            )}
            {pass.truncated && !pass.continuous && (
              <p className="mt-3 text-xs text-zinc-500">Pass extends beyond the prediction window — times are truncated.</p>
            )}
          </div>
        </div>

        <p className="sr-only">
          Sky chart of the pass: azimuth-elevation track with {compass16(pass.startAz)} rise and{" "}
          {compass16(pass.endAz)} set, maximum elevation {pass.maxEl.toFixed(1)} degrees.
        </p>
      </DialogContent>
    </Dialog>
  );
}

export function VisibilityBadge({ v }: { v: PassVisibility }) {
  const meta = VIS_META[v];
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] leading-4 ${meta.badge}`}>
      <Icon aria-hidden className="h-3 w-3" />
      <span className="hidden sm:inline">{meta.short}</span>
    </span>
  );
}

export function VisibilityBadgeFull({ v }: { v: PassVisibility }) {
  const meta = VIS_META[v];
  const Icon = meta.icon;
  return (
    <Badge variant="outline" className={`gap-1 ${meta.badge}`}>
      <Icon aria-hidden className="h-3 w-3" />
      {meta.short}
    </Badge>
  );
}
