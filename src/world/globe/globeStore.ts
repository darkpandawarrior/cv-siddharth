import { useMemo } from "react";
import { create } from "zustand";
import type { Camera, Vector3 } from "three";

/**
 * /globe's one piece of shared state. The HUD, the layer panel, the
 * inspector, the tour and every WebGL layer read and write here instead of
 * threading props through Globe.tsx, so a layer can be added without
 * touching any other layer's file.
 */

/** Every toggleable layer, in the order the layer panel lists them. */
export const LAYER_IDS = ["markers", "stars", "satellites", "aircraft", "presence", "pulses", "hazards", "wind", "reach", "countries", "together"] as const;
export type LayerId = (typeof LAYER_IDS)[number];

/** "imagery" is the real NASA day/night earth; "dots" is the dot-matrix one. */
export type EarthStyle = "imagery" | "dots";

/** orbit: free OrbitControls. ground: standing at `focus`, looking up.
 *  follow: the camera rides a moving entity (the ISS, an aircraft).
 *  street: the globe hands off to a street-level map and photos at `focus`
 *  (a DOM surface over the canvas, ui/StreetView.tsx). */
export type GlobeView = "orbit" | "ground" | "follow" | "street";

/** A camera target: a surface point, or a moving entity a layer registered. */
export type Focus = { kind: "latlon"; lat: number; lon: number; distance?: number } | { kind: "entity"; id: string };

/** What the inspector card shows. A layer fills it on click. `source` names
 *  where the numbers come from (G8: a number always sits beside its
 *  source); `live` false means a snapshot, which the card must say. */
export interface Selection {
  id: string;
  kind: string;
  title: string;
  rows: { label: string; value: string }[];
  source: string;
  live: boolean;
  focus?: Focus;
}

/** A layer's honest health, shown beside its toggle. `detail` is a short
 *  human line ("47 quakes, USGS, 3 min ago" / "TLE feed unreachable"). A
 *  layer that cannot reach its feed reports "failed" and draws nothing: no
 *  stale value is ever dressed as live. */
export type LayerHealth = { state: "loading" | "live" | "snapshot" | "failed"; detail?: string };
export type StatusKey = LayerId | "earth";

/** Phones show one bottom sheet at a time; opening one closes the others. */
export type GlobeSheet = "layers" | "time" | "tour" | "inspector" | null;

/** The NASA GIBS imagery stack (ui/LayerCatalog.tsx edits it, layers/
 *  TileLayer.tsx draws it): one base layer plus overlays drawn above it in
 *  order, each at its own opacity. Ids are GIBS layer identifiers. */
export interface ImageryStack {
  base: string;
  overlays: { id: string; opacity: number }[];
}

/** LANE W12 ("Ask the globe"): the quake filter a "show quakes above 5" /
 *  "quakes this week" command sets. Read by HazardLayer.tsx (L7) on top of
 *  its own existing tier-based magnitude floor. `undefined` means unset —
 *  never restricts. */
export interface GlobeFilters {
  quakeMinMag?: number;
  quakeSinceHours?: number;
}

interface GlobeState {
  style: EarthStyle;
  layers: Record<LayerId, boolean>;
  view: GlobeView;
  focus: Focus | null;
  selected: Selection | null;
  /** Minutes added to the real clock by the time scrubber; 0 is live. */
  timeOffsetMin: number;
  /** Index into the guided tour's stops, or null when no tour is running. */
  tourStep: number | null;
  status: Partial<Record<StatusKey, LayerHealth>>;
  sheet: GlobeSheet;
  imagery: ImageryStack;
  filters: GlobeFilters;
  setStyle: (style: EarthStyle) => void;
  toggleLayer: (id: LayerId) => void;
  setView: (view: GlobeView) => void;
  flyTo: (focus: Focus | null) => void;
  select: (selection: Selection | null) => void;
  setTimeOffset: (minutes: number) => void;
  setTourStep: (step: number | null) => void;
  setStatus: (key: StatusKey, health: LayerHealth | undefined) => void;
  setSheet: (sheet: GlobeSheet) => void;
  setImagery: (imagery: ImageryStack) => void;
  /** Merges the given fields into `filters`; a field left `undefined` here
   *  keeps its current value (so "show quakes above 5" then "this week"
   *  composes instead of clobbering). */
  setFilters: (patch: GlobeFilters) => void;
}

export const useGlobe = create<GlobeState>((set) => ({
  style: "imagery",
  layers: { markers: true, stars: true, satellites: true, aircraft: true, presence: true, pulses: true, hazards: true, wind: true, reach: true, countries: false, together: true },
  view: "orbit",
  focus: null,
  selected: null,
  timeOffsetMin: 0,
  tourStep: null,
  status: {},
  sheet: null,
  imagery: { base: "VIIRS_SNPP_CorrectedReflectance_TrueColor", overlays: [] },
  filters: {},
  setStyle: (style) => set({ style }),
  toggleLayer: (id) => set((s) => ({ layers: { ...s.layers, [id]: !s.layers[id] } })),
  setView: (view) => set({ view }),
  flyTo: (focus) => set({ focus }),
  select: (selected) => set({ selected }),
  setTimeOffset: (timeOffsetMin) => set({ timeOffsetMin }),
  setTourStep: (tourStep) => set({ tourStep }),
  setStatus: (key, health) => set((s) => ({ status: { ...s.status, [key]: health } })),
  setSheet: (sheet) => set({ sheet }),
  setImagery: (imagery) => set({ imagery }),
  setFilters: (patch) =>
    set((s) => ({
      filters: {
        quakeMinMag: patch.quakeMinMag ?? s.filters.quakeMinMag,
        quakeSinceHours: patch.quakeSinceHours ?? s.filters.quakeSinceHours,
      },
    })),
}));

/** The simulated instant every time-aware layer draws: the real clock plus
 *  the scrubber's offset. Live feeds (aircraft, presence) cannot time-travel
 *  and hide themselves while the offset is non-zero rather than show a
 *  present-tense value against a past sky. */
export function simTime(offsetMin: number, realMs: number = Date.now()): Date {
  return new Date(realMs + offsetMin * 60_000);
}

/** `realNow` (useSky's minute tick) shifted by the scrubber. */
export function useSimNow(realNow: Date): Date {
  const offset = useGlobe((s) => s.timeOffsetMin);
  return useMemo(() => simTime(offset, realNow.getTime()), [offset, realNow]);
}

/** Moving entities a follow/fly-to can target. Layers register a getter for
 *  the entity's CURRENT world position (read per frame, never stored as
 *  React state) and unregister on unmount. Module-level because there is
 *  exactly one globe. */
export const entityPositions = new Map<string, () => Vector3 | null>();

/** The live scene camera, published by GlobeScene's SceneRig on mount so DOM
 *  surfaces (the explore bar's "what's here" and measure clicks) can raycast
 *  the globe without reaching into R3F's internal root registry. Read it at
 *  event time, never cache it: it is null until the Canvas mounts and after
 *  it unmounts. */
export const sceneHandles: { camera: Camera | null; canvas: HTMLCanvasElement | null } = { camera: null, canvas: null };
