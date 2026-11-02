"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Crosshair,
  Globe2,
  Loader2,
  MapPin,
  Orbit,
  Pause,
  Play,
  RotateCcw,
  Satellite as SatelliteIcon,
  X,
} from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import { satColor, useTle } from "@/hooks/use-tle";
import type { GlobeOptions, SatLive } from "./globe-scene";
import { GlobeScene } from "./globe-scene";

const SPEEDS = [1, 60, 600] as const;

function fmtSim(t: number): string {
  const d = new Date(t);
  const day = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(d);
  const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "UTC" }).format(d);
  return `${day} · ${time} UTC`;
}

function fmtLat(lat: number): string {
  return `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? "N" : "S"}`;
}
function fmtLng(lng: number): string {
  return `${Math.abs(lng).toFixed(2)}° ${lng >= 0 ? "E" : "W"}`;
}

/** Simulated-time clock: drift-free at 1×, rebased on speed/pause changes. */
interface SimClock {
  baseSim: number;
  baseWall: number;
  speed: number;
  paused: boolean;
}

function clockTime(c: SimClock): number {
  if (c.paused) return c.baseSim;
  if (c.speed === 1) return Date.now();
  return c.baseSim + (Date.now() - c.baseWall) * c.speed;
}

export function GlobePanel() {
  const observer = useAppStore((s) => s.observer);
  const selected = useAppStore((s) => s.selected);
  const { tles, source, loading, error, reload } = useTle(selected.map((s) => s.noradId));

  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<GlobeScene | null>(null);
  const clockRef = useRef<SimClock>({ baseSim: Date.now(), baseWall: Date.now(), speed: 1, paused: false });
  const labelEls = useRef(new Map<number, HTMLElement>());

  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState<number>(1);
  const [options, setOptions] = useState<GlobeOptions>({ showOrbits: true, showTracks: true, showLabels: true, autoRotate: true });
  const [selNorad, setSelNorad] = useState<number | null>(null);
  const [liveSats, setLiveSats] = useState<SatLive[]>([]);
  const [simDisplay, setSimDisplay] = useState<{ label: string; live: boolean; speed: number }>({ label: "", live: true, speed: 1 });

  const getTime = useCallback(() => clockTime(clockRef.current), []);

  // --- mount the scene once -------------------------------------------------
  useEffect(() => {
    if (!containerRef.current) return;
    const scene = new GlobeScene(containerRef.current, {
      tles: [],
      observer: { lat: observer.lat, lng: observer.lng },
      options: { showOrbits: true, showTracks: true, showLabels: true, autoRotate: true },
      selected: null,
      getTime,
      onTick: setLiveSats,
      onPick: (id) => setSelNorad(id),
    });
    scene.setLabels(labelEls.current);
    sceneRef.current = scene;
    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
  }, [getTime]);

  // --- push updates into the scene ------------------------------------------
  const sceneTles = useMemo(() => tles.map((t) => ({ ...t, color: satColor(t.noradId) })), [tles]);

  useEffect(() => {
    sceneRef.current?.setTles(sceneTles);
  }, [sceneTles]);

  useEffect(() => {
    sceneRef.current?.setObserver(observer.lat, observer.lng);
  }, [observer.lat, observer.lng]);

  useEffect(() => {
    sceneRef.current?.setOptions(options);
  }, [options]);

  useEffect(() => {
    sceneRef.current?.setSelected(selNorad);
  }, [selNorad]);

  useEffect(() => {
    sceneRef.current?.setLabels(labelEls.current);
  }, [sceneTles, observer]);

  // --- time controls ---------------------------------------------------------
  const rebase = useCallback(() => {
    clockRef.current = { ...clockRef.current, baseSim: clockTime(clockRef.current), baseWall: Date.now() };
  }, []);

  const togglePause = useCallback(() => {
    rebase();
    clockRef.current.paused = !clockRef.current.paused;
    setPaused(clockRef.current.paused);
  }, [rebase]);

  const changeSpeed = useCallback(
    (v: number) => {
      rebase();
      clockRef.current.speed = v;
      clockRef.current.paused = false;
      setSpeed(v);
      setPaused(false);
    },
    [rebase],
  );

  const goNow = useCallback(() => {
    clockRef.current = { baseSim: Date.now(), baseWall: Date.now(), speed: 1, paused: false };
    setSpeed(1);
    setPaused(false);
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      const c = clockRef.current;
      const sim = clockTime(c);
      const live = !c.paused && c.speed === 1 && Math.abs(sim - Date.now()) < 2500;
      setSimDisplay({ label: fmtSim(sim), live, speed: c.speed });
    }, 500);
    return () => clearInterval(id);
  }, []);

  // ---------------------------------------------------------------- render --

  const liveBySat = useMemo(() => new Map(liveSats.map((s) => [s.noradId, s])), [liveSats]);
  const selLive = selNorad != null ? liveBySat.get(selNorad) : undefined;
  const selMeta = selected.find((s) => s.noradId === selNorad);

  const tracked = tles.length;
  const missing = selected.length - tracked;

  return (
    <section aria-label="3D globe view" className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/40">
      {/* header */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-zinc-800/80 px-4 py-3">
        <span aria-hidden className="grid h-7 w-7 place-items-center rounded-md bg-amber-500/15 text-amber-400">
          <Globe2 className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold leading-tight">3D Globe</h2>
          <p className="text-[11px] leading-tight text-zinc-500">Live positions · SGP4 propagation in your browser</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {source && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-800 px-2 py-0.5 text-[11px] text-zinc-400">
              <span className={`h-1.5 w-1.5 rounded-full ${source === "live" ? "animate-pulse bg-emerald-400" : "bg-amber-400"}`} />
              {source === "live" ? "Live TLE" : "Snapshot TLE"}
            </span>
          )}
          {selected.length > 0 && (
            <span className="rounded-full border border-zinc-800 px-2 py-0.5 text-[11px] text-zinc-400">
              {tracked} tracked{missing > 0 ? ` · ${missing} unavailable` : ""}
            </span>
          )}
        </div>
      </div>

      {/* canvas + overlays */}
      <div className="relative bg-[#04060a]">
        <div ref={containerRef} className="h-[380px] w-full sm:h-[480px] lg:h-[560px]" />

        {/* HTML labels pinned by the scene (positions written every frame) */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          {tles.map((t) => {
            const color = satColor(t.noradId);
            const isSel = selNorad === t.noradId;
            return (
              <button
                key={t.noradId}
                type="button"
                ref={(el) => {
                  if (el) labelEls.current.set(t.noradId, el);
                  else labelEls.current.delete(t.noradId);
                }}
                onClick={() => setSelNorad(isSel ? null : t.noradId)}
                className="pointer-events-auto absolute left-0 top-0 z-10 flex items-center gap-1 whitespace-nowrap rounded-full border bg-zinc-950/80 px-1.5 py-0.5 text-[10px] font-medium backdrop-blur-sm will-change-transform"
                style={{ borderColor: isSel ? color : "rgba(63,63,70,0.7)", color, opacity: 0 }}
                tabIndex={-1}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
                {t.name}
              </button>
            );
          })}
          <span
            ref={(el) => {
              if (el) labelEls.current.set(-1, el);
              else labelEls.current.delete(-1);
            }}
            className="absolute left-0 top-0 z-10 flex items-center gap-1 whitespace-nowrap rounded-full border border-amber-500/50 bg-zinc-950/80 px-1.5 py-0.5 text-[10px] font-medium text-amber-300 backdrop-blur-sm will-change-transform"
            style={{ opacity: 0 }}
          >
            <MapPin aria-hidden className="h-2.5 w-2.5" />
            {observer.label}
          </span>
        </div>

        {/* selected satellite live card */}
        {selLive && selLive.valid && (
          <div className="absolute left-3 top-3 z-20 w-56 rounded-lg border border-zinc-700/80 bg-zinc-950/85 p-3 shadow-xl backdrop-blur-md">
            <div className="mb-2 flex items-start gap-2">
              <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: selLive.color }} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold leading-tight">{selLive.name}</p>
                <p className="text-[10px] leading-tight text-zinc-500">NORAD {selLive.noradId}</p>
              </div>
              <button
                type="button"
                aria-label="Close satellite details"
                onClick={() => setSelNorad(null)}
                className="rounded p-0.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
              >
                <X aria-hidden className="h-3.5 w-3.5" />
              </button>
            </div>
            <dl className="space-y-1 text-[11px]">
              {[
                ["Latitude", fmtLat(selLive.lat)],
                ["Longitude", fmtLng(selLive.lng)],
                ["Altitude", `${Math.round(selLive.altKm).toLocaleString()} km`],
                ["Speed", `${selLive.speedKmS.toFixed(2)} km/s`],
                ["Period", `${selLive.periodMin < 100 ? selLive.periodMin.toFixed(1) : Math.round(selLive.periodMin)} min`],
                ["Inclination", `${selLive.inclDeg.toFixed(1)}°`],
              ].map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-2">
                  <dt className="text-zinc-500">{k}</dt>
                  <dd className="font-mono tabular-nums text-zinc-200">{v}</dd>
                </div>
              ))}
            </dl>
            <button
              type="button"
              onClick={() => selNorad != null && sceneRef.current?.focusOn(selNorad)}
              className="mt-2.5 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-[11px] font-medium text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white"
            >
              <Crosshair aria-hidden className="h-3.5 w-3.5" /> Center on globe
            </button>
          </div>
        )}

        {/* hint */}
        <p className="pointer-events-none absolute bottom-2.5 right-3 z-10 hidden rounded-full bg-zinc-950/60 px-2 py-0.5 text-[10px] text-zinc-500 backdrop-blur-sm sm:block">
          drag to rotate · scroll to zoom · click a satellite
        </p>

        {/* states */}
        {loading && (
          <div className="absolute inset-0 z-30 grid place-items-center bg-zinc-950/70 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-2 text-zinc-400">
              <Loader2 aria-hidden className="h-6 w-6 animate-spin text-amber-400" />
              <p className="text-xs">Fetching orbital elements…</p>
            </div>
          </div>
        )}
        {!loading && error && (
          <div className="absolute inset-0 z-30 grid place-items-center bg-zinc-950/80 p-6">
            <div className="flex max-w-xs flex-col items-center gap-2 text-center">
              <AlertTriangle aria-hidden className="h-6 w-6 text-amber-400" />
              <p className="text-xs text-zinc-400">{error}</p>
              <button
                type="button"
                onClick={reload}
                className="mt-1 rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:border-zinc-500 hover:text-white"
              >
                Retry
              </button>
            </div>
          </div>
        )}
        {!loading && !error && selected.length === 0 && (
          <div className="absolute inset-0 z-30 grid place-items-center bg-zinc-950/60 p-6 backdrop-blur-[2px]">
            <div className="flex flex-col items-center gap-2 text-center text-zinc-400">
              <SatelliteIcon aria-hidden className="h-6 w-6 text-zinc-600" />
              <p className="text-xs">Select satellites on the left to watch them orbit</p>
            </div>
          </div>
        )}
      </div>

      {/* controls + legend */}
      <div className="flex flex-col gap-3 border-t border-zinc-800/80 px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {/* time */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={togglePause}
              aria-label={paused ? "Resume time" : "Pause time"}
              aria-pressed={paused}
              className="grid h-8 w-8 place-items-center rounded-md border border-zinc-700 bg-zinc-900 text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white"
            >
              {paused ? <Play aria-hidden className="h-3.5 w-3.5" /> : <Pause aria-hidden className="h-3.5 w-3.5" />}
            </button>
            <div role="group" aria-label="Time speed" className="flex overflow-hidden rounded-md border border-zinc-700">
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => changeSpeed(s)}
                  aria-pressed={speed === s && !paused}
                  className={`h-8 px-2.5 text-xs font-medium tabular-nums transition-colors ${
                    speed === s && !paused ? "bg-amber-500 text-zinc-950" : "bg-zinc-900 text-zinc-400 hover:text-white"
                  }`}
                >
                  {s === 1 ? "1×" : `${s / 60}m×`}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={goNow}
              className="inline-flex h-8 items-center gap-1 rounded-md border border-zinc-700 bg-zinc-900 px-2.5 text-xs text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white"
            >
              <RotateCcw aria-hidden className="h-3 w-3" /> Now
            </button>
            <span className="ml-1 hidden font-mono text-[11px] tabular-nums text-zinc-400 md:inline" suppressHydrationWarning>
              {simDisplay.label || fmtSim(Date.now())}
            </span>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                simDisplay.live ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"
              }`}
            >
              {simDisplay.live ? "LIVE" : `SIM${paused ? " · PAUSED" : simDisplay.speed === 1 ? "" : ` · ${simDisplay.speed / 60}m×`}`}
            </span>
          </div>

          {/* layer toggles */}
          <div role="group" aria-label="Globe layers" className="flex flex-wrap items-center gap-1.5">
            {(
              [
                ["showOrbits", "Orbits"],
                ["showTracks", "Tracks"],
                ["showLabels", "Labels"],
                ["autoRotate", "Spin"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setOptions((o) => ({ ...o, [key]: !o[key] }))}
                aria-pressed={options[key]}
                className={`h-7 rounded-full border px-2.5 text-[11px] transition-colors ${
                  options[key]
                    ? "border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
                    : "border-zinc-800 text-zinc-600 hover:border-zinc-700 hover:text-zinc-400"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* legend */}
        {tles.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Satellite legend — click to inspect">
            <Orbit aria-hidden className="mr-0.5 h-3.5 w-3.5 text-zinc-600" />
            {tles.map((t) => {
              const color = satColor(t.noradId);
              const isSel = selNorad === t.noradId;
              const lv = liveBySat.get(t.noradId);
              return (
                <button
                  key={t.noradId}
                  type="button"
                  onClick={() => setSelNorad(isSel ? null : t.noradId)}
                  aria-pressed={isSel}
                  title={lv?.valid ? `${fmtLat(lv.lat)} ${fmtLng(lv.lng)} · ${Math.round(lv.altKm)} km` : t.name}
                  className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11px] transition-colors ${
                    isSel ? "border-zinc-500 bg-zinc-800/80 text-white" : "border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                  }`}
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
                  {t.name}
                </button>
              );
            })}
          </div>
        )}
        {selMeta == null && selNorad != null && liveBySat.get(selNorad)?.valid === false && (
          <p className="text-[11px] text-zinc-500">Selected satellite could not be propagated (decayed or invalid elements).</p>
        )}
      </div>
    </section>
  );
}
