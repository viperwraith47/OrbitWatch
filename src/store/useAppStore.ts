"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ObserverWithLabel } from "@/lib/sat/types";

export interface SelectedSat {
  noradId: number;
  name: string;
}

export interface PredictionParams {
  days: number;
  minElevation: number;
  visibleOnly: boolean;
}

interface AppState {
  observer: ObserverWithLabel;
  setObserver: (o: ObserverWithLabel) => void;
  selected: SelectedSat[];
  toggleSat: (sat: SelectedSat) => void;
  removeSat: (noradId: number) => void;
  clearSats: () => void;
  params: PredictionParams;
  setParams: (p: Partial<PredictionParams>) => void;
}

export const MAX_SATS = 12;

export const DEFAULT_SATS: SelectedSat[] = [
  { noradId: 25544, name: "ISS (ZARYA)" },
  { noradId: 48274, name: "CSS (TIANHE)" },
  { noradId: 20580, name: "HST" },
];

export const DEFAULT_OBSERVER: ObserverWithLabel = {
  label: "New York, United States",
  lat: 40.7128,
  lng: -74.006,
  altM: 10,
};

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      observer: DEFAULT_OBSERVER,
      setObserver: (o) => set({ observer: o }),

      selected: DEFAULT_SATS,
      toggleSat: (sat) => {
        const cur = get().selected;
        const exists = cur.some((s) => s.noradId === sat.noradId);
        if (exists) {
          set({ selected: cur.filter((s) => s.noradId !== sat.noradId) });
          return;
        }
        if (cur.length >= MAX_SATS) return; // caller shows toast
        set({ selected: [...cur, sat] });
      },
      removeSat: (noradId) => set({ selected: get().selected.filter((s) => s.noradId !== noradId) }),
      clearSats: () => set({ selected: [] }),

      params: { days: 2, minElevation: 10, visibleOnly: false },
      setParams: (p) => set({ params: { ...get().params, ...p } }),
    }),
    {
      name: "orbitwatch-v1",
      partialize: (s) => ({
        observer: s.observer,
        selected: s.selected,
        params: s.params,
      }),
    },
  ),
);
