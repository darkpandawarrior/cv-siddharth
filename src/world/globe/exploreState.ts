import { create } from "zustand";
import type { LatLon } from "./geoMath.ts";

/** Kept outside globeStore so W11 owns mode arbitration and measurement. */
export const useExplore = create<{
  mode: "here" | "measure" | null;
  points: LatLon[];
  setMode: (mode: "here" | "measure" | null) => void;
  addPoint: (point: LatLon) => void;
}>((set) => ({
  mode: null,
  points: [],
  setMode: (mode) => set({ mode, points: [] }),
  addPoint: (point) => set((s) => ({ points: s.points.length === 1 ? [...s.points, point] : [point] })),
}));
