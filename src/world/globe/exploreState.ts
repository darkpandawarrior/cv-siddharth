import { create } from "zustand";
import type { LatLon } from "./geoMath.ts";

/** Kept outside globeStore so W11 owns mode arbitration and measurement. */
export const useExplore = create<{
  mode: "here" | "measure" | "pin" | null;
  points: LatLon[];
  pins: LatLon[];
  pin: (point: LatLon) => void;
  removePin: (index: number) => void;
  clearPins: () => void;
  setMode: (mode: "here" | "measure" | "pin" | null) => void;
  addPoint: (point: LatLon) => void;
}>((set) => ({
  mode: null,
  points: [],
  pins: [],
  pin: (point) => set(s => {
    if (![point.lat, point.lon].every(Number.isFinite) || Math.abs(point.lat) > 90 || Math.abs(point.lon) > 180 || s.pins.length >= 2 || s.pins.some(p => p.lat === point.lat && p.lon === point.lon)) return s;
    return { pins: [...s.pins, { lat: point.lat, lon: point.lon }] };
  }),
  removePin: (index) => set(s => ({ pins: s.pins.filter((_, i) => i !== index) })),
  clearPins: () => set({ pins: [] }),
  setMode: (mode) => set({ mode, points: [] }),
  addPoint: (point) => set((s) => ({ points: s.points.length === 1 ? [...s.points, point] : [point] })),
}));
