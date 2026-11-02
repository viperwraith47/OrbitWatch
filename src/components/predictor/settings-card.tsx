"use client";

import { Radar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useAppStore } from "@/store/useAppStore";
import { Loader2 } from "lucide-react";

const WINDOW_OPTIONS = [
  { value: "1", label: "24 hours" },
  { value: "2", label: "48 hours" },
  { value: "3", label: "3 days" },
  { value: "5", label: "5 days" },
  { value: "7", label: "7 days" },
];

const ELEVATION_OPTIONS = [
  { value: "0", label: "Any above horizon (0°)" },
  { value: "10", label: "At least 10°" },
  { value: "20", label: "At least 20°" },
  { value: "30", label: "At least 30°" },
  { value: "45", label: "At least 45°" },
];

export function SettingsCard({
  onPredict,
  loading,
}: {
  onPredict: () => void;
  loading: boolean;
}) {
  const params = useAppStore((s) => s.params);
  const setParams = useAppStore((s) => s.setParams);

  return (
    <section aria-labelledby="set-h" className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <Radar aria-hidden className="h-4 w-4 text-amber-400" />
        <h2 id="set-h" className="text-sm font-semibold">
          Prediction settings
        </h2>
      </div>

      <div className="mt-4 space-y-4">
        <div>
          <Label htmlFor="win" className="text-xs text-zinc-500">
            Prediction window
          </Label>
          <Select value={String(params.days)} onValueChange={(v) => setParams({ days: Number(v) })}>
            <SelectTrigger id="win" className="mt-1 border-zinc-700 bg-zinc-950/60 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-zinc-700 bg-zinc-900">
              {WINDOW_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="mel" className="text-xs text-zinc-500">
            Minimum max-elevation
          </Label>
          <Select value={String(params.minElevation)} onValueChange={(v) => setParams({ minElevation: Number(v) })}>
            <SelectTrigger id="mel" className="mt-1 border-zinc-700 bg-zinc-950/60 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-zinc-700 bg-zinc-900">
              {ELEVATION_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2.5">
          <div>
            <Label htmlFor="vis" className="text-sm text-zinc-200">
              Naked-eye passes only
            </Label>
            <p className="text-xs text-zinc-500">Sunlit satellite, dark sky at culmination</p>
          </div>
          <Switch
            id="vis"
            checked={params.visibleOnly}
            onCheckedChange={(c) => setParams({ visibleOnly: c })}
            className="data-[state=checked]:bg-amber-500"
          />
        </div>

        <Button
          onClick={onPredict}
          disabled={loading}
          className="h-11 w-full bg-amber-500 text-base font-semibold text-zinc-950 shadow-lg shadow-amber-500/20 hover:bg-amber-400"
        >
          {loading ? (
            <>
              <Loader2 aria-hidden className="mr-1 h-5 w-5 animate-spin" /> Propagating orbits…
            </>
          ) : (
            "Predict passes"
          )}
        </Button>
      </div>
    </section>
  );
}
