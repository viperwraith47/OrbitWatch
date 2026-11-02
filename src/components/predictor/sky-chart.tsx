"use client";

import { useMemo, type MouseEvent } from "react";
import type { PassSample } from "@/lib/sat/types";

/**
 * Polar sky chart, looking up: N at top, E right, S bottom, W left.
 * Center = zenith (90°), outer ring = horizon (0°).
 * Bright amber arc  = satellite sunlit with dark sky (naked-eye visible).
 * Dim zinc arc      = rest of the pass (eclipsed or daylight sky).
 */

const SIZE = 400;
const C = SIZE / 2;
const R = 178;

function project(azDeg: number, elDeg: number): { x: number; y: number } {
  const az = (azDeg * Math.PI) / 180;
  const r = (1 - Math.min(Math.max(elDeg, 0), 90) / 90) * R;
  return { x: C + r * Math.sin(az), y: C - r * Math.cos(az) };
}

/** Split samples into contiguous lit-dark ("bright") and other ("dim") runs, densified for smooth curves. */
function buildSegments(samples: PassSample[]): { d: string; bright: boolean }[] {
  const segs: { d: string; bright: boolean }[] = [];
  let current: { bright: boolean; pts: string[] } | null = null;

  const flush = () => {
    if (current && current.pts.length >= 2) {
      segs.push({ d: current.pts.join(" "), bright: current.bright });
    }
    current = null;
  };

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const bright = s.sunlit && s.skyDark;
    if (!current || current.bright !== bright) {
      flush();
      const p = project(s.az, s.el);
      current = { bright, pts: [`M ${p.x.toFixed(1)} ${p.y.toFixed(1)}`] };
    }
    if (i > 0 && current) {
      const prev = samples[i - 1];
      // densify long hops (near-horizon azimuth moves fast)
      const dist = Math.hypot(s.az - prev.az, s.el - prev.el);
      const steps = Math.min(6, Math.max(1, Math.ceil(dist / 4)));
      for (let k = 1; k <= steps; k++) {
        const f = k / steps;
        const az = prev.az + (s.az - prev.az) * f;
        const el = prev.el + (s.el - prev.el) * f;
        const p = project(az, el);
        current.pts.push(`L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`);
      }
    }
  }
  flush();
  return segs;
}

const AZ_TICKS = Array.from({ length: 12 }, (_, i) => i * 30);

interface SkyChartProps {
  samples: PassSample[];
  /** index of time-of-closest-approach sample (max elevation marker) */
  tcaIdx?: number;
  /** current scrubber position */
  markerIdx?: number;
  onMarkerChange?: (idx: number) => void;
}

export function SkyChart({ samples, tcaIdx, markerIdx, onMarkerChange }: SkyChartProps) {
  const segs = useMemo(() => buildSegments(samples), [samples]);
  if (samples.length === 0) return null;

  const first = samples[0];
  const last = samples[samples.length - 1];
  const tca = tcaIdx != null ? samples[tcaIdx] : null;
  const marker = markerIdx != null ? samples[Math.min(markerIdx, samples.length - 1)] : null;
  const tcaP = tca ? project(tca.az, tca.el) : null;
  const markerP = marker ? project(marker.az, marker.el) : null;

  const handleClick = (e: MouseEvent<SVGSVGElement>) => {
    if (!onMarkerChange) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * SIZE;
    const py = ((e.clientY - rect.top) / rect.height) * SIZE;
    const dx = px - C;
    const dy = py - C;
    if (Math.hypot(dx, dy) > R * 1.08) return;
    const az = (((Math.atan2(dx, -dy) * 180) / Math.PI) % 360 + 360) % 360;
    const el = Math.min(90, Math.max(0, (1 - Math.hypot(dx, dy) / R) * 90));
    let best = 0;
    let bestD = Infinity;
    samples.forEach((s, i) => {
      let dAz = Math.abs(s.az - az);
      dAz = Math.min(dAz, 360 - dAz);
      const d = dAz * dAz + (s.el - el) * (s.el - el);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    onMarkerChange(best);
  };

  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      role="img"
      aria-label="Sky chart of the satellite pass, north up, east right"
      className="mx-auto block aspect-square w-full max-w-[420px] select-none"
      onClick={handleClick}
    >
      {/* horizon + elevation rings */}
      <circle cx={C} cy={C} r={R} fill="none" stroke="#3f3f46" strokeWidth={1.5} />
      <circle cx={C} cy={C} r={(1 - 30 / 90) * R} fill="none" stroke="#27272a" strokeWidth={1} strokeDasharray="3 5" />
      <circle cx={C} cy={C} r={(1 - 60 / 90) * R} fill="none" stroke="#27272a" strokeWidth={1} strokeDasharray="3 5" />
      <circle cx={C} cy={C} r={3} fill="#3f3f46" />

      {/* elevation ring labels along NE diagonal */}
      <text x={C + Math.SQRT1_2 * ((1 - 30 / 90) * R) + 6} y={C - Math.SQRT1_2 * ((1 - 30 / 90) * R) - 4} fill="#52525b" fontSize={9} fontFamily="var(--font-geist-mono), monospace">30°</text>
      <text x={C + Math.SQRT1_2 * ((1 - 60 / 90) * R) + 6} y={C - Math.SQRT1_2 * ((1 - 60 / 90) * R) - 4} fill="#52525b" fontSize={9} fontFamily="var(--font-geist-mono), monospace">60°</text>

      {/* azimuth ticks */}
      {AZ_TICKS.map((az) => {
        const rad = (az * Math.PI) / 180;
        const sin = Math.sin(rad);
        const cos = Math.cos(rad);
        const major = az % 90 === 0;
        return (
          <line
            key={az}
            x1={C + (R - 2) * sin}
            y1={C - (R - 2) * cos}
            x2={C + (R - (major ? 14 : 8)) * sin}
            y2={C - (R - (major ? 14 : 8)) * cos}
            stroke={major ? "#52525b" : "#3f3f46"}
            strokeWidth={major ? 1.5 : 1}
          />
        );
      })}

      {/* cardinal labels */}
      {([["N", 0], ["E", 90], ["S", 180], ["W", 270]] as const).map(([label, az]) => {
        const rad = (az * Math.PI) / 180;
        return (
          <text
            key={label}
            x={C + (R + 14) * Math.sin(rad)}
            y={C - (R + 14) * Math.cos(rad) + 5}
            textAnchor="middle"
            fill="#d4d4d8"
            fontSize={14}
            fontWeight={700}
            fontFamily="var(--font-geist-sans), sans-serif"
          >
            {label}
          </text>
        );
      })}
      {([["NE", 45], ["SE", 135], ["SW", 225], ["NW", 315]] as const).map(([label, az]) => {
        const rad = (az * Math.PI) / 180;
        return (
          <text
            key={label}
            x={C + (R + 10) * Math.sin(rad)}
            y={C - (R + 10) * Math.cos(rad) + 4}
            textAnchor="middle"
            fill="#71717a"
            fontSize={10}
            fontFamily="var(--font-geist-sans), sans-serif"
          >
            {label}
          </text>
        );
      })}

      {/* trajectory: dim segments first, bright segments on top */}
      {segs.map((seg, i) =>
        seg.bright ? null : (
          <path key={`d${i}`} d={seg.d} fill="none" stroke="#52525b" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        ),
      )}
      {segs.map((seg, i) =>
        seg.bright ? (
          <g key={`b${i}`}>
            <path d={seg.d} fill="none" stroke="rgba(251,191,36,0.22)" strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" />
            <path d={seg.d} fill="none" stroke="#fbbf24" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
          </g>
        ) : null,
      )}

      {/* AOS / LOS markers */}
      {(() => {
        const p = project(first.az, first.el);
        return <circle cx={p.x} cy={p.y} r={4.5} fill="#18181b" stroke="#a1a1aa" strokeWidth={1.8} />;
      })()}
      {(() => {
        const p = project(last.az, last.el);
        return <circle cx={p.x} cy={p.y} r={4.5} fill="#18181b" stroke="#a1a1aa" strokeWidth={1.8} />;
      })()}

      {/* TCA marker */}
      {tcaP && (
        <g>
          <circle cx={tcaP.x} cy={tcaP.y} r={9} fill="none" stroke="rgba(251,191,36,0.35)" strokeWidth={2} />
          <circle cx={tcaP.x} cy={tcaP.y} r={4} fill="#fbbf24" />
        </g>
      )}

      {/* scrub marker */}
      {markerP && (
        <g>
          <circle cx={markerP.x} cy={markerP.y} r={13} fill="rgba(251,191,36,0.15)" />
          <circle cx={markerP.x} cy={markerP.y} r={6.5} fill="#fafafa" stroke="#fbbf24" strokeWidth={2.5} />
        </g>
      )}
    </svg>
  );
}

export function SkyChartLegend() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-xs text-zinc-400">
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="inline-block h-[3px] w-6 rounded-full bg-amber-400" />
        Sunlit · dark sky (naked-eye)
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="inline-block h-[2px] w-6 rounded-full bg-zinc-600" />
        Eclipsed / daylight
      </span>
    </div>
  );
}
