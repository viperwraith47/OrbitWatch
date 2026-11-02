"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Plus, Satellite, Search, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { MAX_SATS, useAppStore } from "@/store/useAppStore";
import type { GroupListResponse } from "@/lib/sat/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const GROUP_TABS = [
  { key: "stations", label: "Stations" },
  { key: "visual", label: "Brightest" },
  { key: "weather", label: "Weather" },
  { key: "science", label: "Science" },
  { key: "amateur", label: "Amateur" },
] as const;

type GroupKey = (typeof GROUP_TABS)[number]["key"];

export function SatelliteCard() {
  const selected = useAppStore((s) => s.selected);
  const toggleSat = useAppStore((s) => s.toggleSat);
  const removeSat = useAppStore((s) => s.removeSat);
  const { toast } = useToast();

  const [tab, setTab] = useState<GroupKey>("stations");
  const [search, setSearch] = useState("");
  const [noradInput, setNoradInput] = useState("");
  const [adding, setAdding] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["sats", tab],
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<GroupListResponse> => {
      const res = await fetch(`/api/satellites?group=${tab}`);
      if (!res.ok) throw new Error("Could not load the satellite group");
      return res.json();
    },
  });

  const list = useMemo(() => {
    const all = data?.sats ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter((s) => s.name.toLowerCase().includes(q) || String(s.noradId).includes(q));
  }, [data, search]);

  const onToggle = (noradId: number, name: string) => {
    const exists = selected.some((s) => s.noradId === noradId);
    if (!exists && selected.length >= MAX_SATS) {
      toast({
        title: "Satellite limit reached",
        description: `Up to ${MAX_SATS} satellites per prediction — remove one first.`,
        variant: "destructive",
      });
      return;
    }
    toggleSat({ noradId, name });
  };

  const addByNorad = async () => {
    const id = Number.parseInt(noradInput.trim(), 10);
    if (!Number.isInteger(id) || id <= 0) {
      toast({ title: "Invalid NORAD ID", description: "Enter a number like 25544.", variant: "destructive" });
      return;
    }
    if (selected.some((s) => s.noradId === id)) {
      toast({ title: "Already selected", description: `NORAD ${id} is in your selection.` });
      return;
    }
    setAdding(true);
    try {
      const res = await fetch(`/api/satellites?norad=${id}`);
      const j = (await res.json()) as { found?: boolean; sat?: { noradId: number; name: string }; error?: string };
      if (res.ok && j.found && j.sat) {
        onToggle(j.sat.noradId, j.sat.name);
        toast({ title: "Satellite added", description: `${j.sat.name} (NORAD ${j.sat.noradId}).` });
        setNoradInput("");
      } else {
        toast({ title: "Not found", description: j.error ?? `NORAD ${id} is not in the active catalog.`, variant: "destructive" });
      }
    } catch {
      toast({ title: "Lookup failed", description: "Orbital data service unreachable.", variant: "destructive" });
    } finally {
      setAdding(false);
    }
  };

  return (
    <section aria-labelledby="sat-h" className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <Satellite aria-hidden className="h-4 w-4 text-amber-400" />
        <h2 id="sat-h" className="text-sm font-semibold">
          Satellites
        </h2>
        <span className="ml-auto font-mono text-xs text-zinc-500">
          {selected.length}/{MAX_SATS}
        </span>
      </div>

      {selected.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {selected.map((s) => (
            <span
              key={s.noradId}
              className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 py-0.5 pl-2.5 pr-1 text-xs text-amber-200"
            >
              {s.name}
              <button
                type="button"
                aria-label={`Remove ${s.name}`}
                className="rounded-full p-0.5 hover:bg-amber-500/20"
                onClick={() => removeSat(s.noradId)}
              >
                <X aria-hidden className="h-3 w-3" />
              </button>
            </span>
          ))}
          <button type="button" className="px-2 py-0.5 text-xs text-zinc-500 hover:text-zinc-300" onClick={() => selected.forEach((s) => removeSat(s.noradId))}>
            Clear
          </button>
        </div>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as GroupKey)} className="mt-3">
        <TabsList className="h-9 w-full justify-start overflow-x-auto bg-zinc-950/60 p-1">
          {GROUP_TABS.map((g) => (
            <TabsTrigger
              key={g.key}
              value={g.key}
              className="px-3 text-xs data-[state=active]:bg-zinc-800 data-[state=active]:text-amber-300"
            >
              {g.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="relative mt-3">
        <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter this group…"
          aria-label="Filter satellites"
          className="border-zinc-700 bg-zinc-950/60 pl-8 text-sm"
        />
      </div>

      <div className="slim-scroll mt-2 max-h-72 overflow-y-auto rounded-lg border border-zinc-800/70" role="list" aria-label="Satellite list">
        {isLoading && (
          <div className="space-y-2 p-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-5 animate-pulse rounded bg-zinc-800/60" />
            ))}
          </div>
        )}
        {error && <p className="p-3 text-xs text-zinc-500">Could not load this group — try again shortly.</p>}
        {!isLoading && !error && list.length === 0 && (
          <p className="p-3 text-xs text-zinc-500">No matches in this group.</p>
        )}
        {list.map((s) => {
          const checked = selected.some((x) => x.noradId === s.noradId);
          return (
            <label
              key={s.noradId}
              className="flex cursor-pointer items-center gap-2.5 border-b border-zinc-800/50 px-3 py-1.5 text-sm last:border-0 hover:bg-zinc-800/40"
            >
              <Checkbox
                checked={checked}
                onCheckedChange={() => onToggle(s.noradId, s.name)}
                aria-label={`Select ${s.name}`}
                className="data-[state=checked]:border-amber-500 data-[state=checked]:bg-amber-500 data-[state=checked]:text-zinc-950"
              />
              <span className="min-w-0 flex-1 truncate text-zinc-200">{s.name}</span>
              <span className="font-mono text-[11px] text-zinc-600">{s.noradId}</span>
            </label>
          );
        })}
      </div>

      <div className="mt-3 flex gap-2">
        <Input
          value={noradInput}
          onChange={(e) => setNoradInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !adding && addByNorad()}
          placeholder="Add by NORAD ID (any active satellite)"
          aria-label="NORAD ID"
          inputMode="numeric"
          className="border-zinc-700 bg-zinc-950/60 font-mono text-xs"
        />
        <Button
          size="sm"
          variant="outline"
          className="h-9 shrink-0 gap-1 border-zinc-700 text-xs hover:bg-zinc-800"
          onClick={addByNorad}
          disabled={adding}
        >
          {adding ? <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" /> : <Plus aria-hidden className="h-3.5 w-3.5" />}
          Add
        </Button>
      </div>
    </section>
  );
}
