/** WAVE 6 LANE X3 (time machine UI): the reactive seam between the Compare
 *  toggle (TimeScrubber.tsx), the draggable divider (ui/CompareDivider.tsx)
 *  and the imagery shader (EarthImagery.tsx) — all three need the same
 *  live split/date state and none of them may edit globeStore.ts
 *  (globe-lanes.md's ownership rule), so this is its own tiny store rather
 *  than a field bolted onto the shared one. Thin: every real rule (clamping,
 *  nudging) stays in compare.ts's pure functions; this only holds them. */
import { create } from "zustand";
import { clampSplit, createCompare, nudgeCompare, setCompareSplit, type CompareState } from "./compare.ts";

interface CompareStore {
  state: CompareState | null;
  /** `leftMs`/`rightMs` are the caller's chosen dates (TimeScrubber picks
   *  the current scrub position and real "today"); `layer` is the GIBS
   *  layer id both sides render with the same imagery style. */
  open: (leftMs: number, rightMs: number, layer: string) => void;
  close: () => void;
  setSplit: (split: number) => void;
  nudge: (key: string, shift?: boolean) => void;
}

export const useCompare = create<CompareStore>((set, get) => ({
  state: null,
  open: (leftMs, rightMs, layer) => set({ state: createCompare({ dateMs: leftMs, layer }, { dateMs: rightMs, layer }) }),
  close: () => set({ state: null }),
  setSplit: (split) => {
    const s = get().state;
    if (s) set({ state: setCompareSplit(s, clampSplit(split)) });
  },
  nudge: (key, shift) => {
    const s = get().state;
    if (s) set({ state: nudgeCompare(s, key, shift) });
  },
}));
