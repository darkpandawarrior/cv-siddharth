import { useMemo } from "react";
import { create } from "zustand";
import type { Vector3 } from "three";

/**
 * /globe's one piece of shared state. The HUD, the layer panel, the
 * inspector, the tour and every WebGL layer read and write here instead of
 * threading props through Globe.tsx, so a layer can be added without
 * touching any other layer's file.
 */

/** Every toggleable layer, in the order the layer panel lists them. */
export const LAYER_IDS = ["markers", "stars", "satellites", "aircraft", "presence", "pulses", "hazards"] as const;
export type LayerId = (typeof LAYER_IDS)[number];

/** "imagery" is the real NASA day/night earth; "dots" is the dot-matrix one. */
export type EarthStyle = "imagery" | "dots";

/** orbit: free OrbitControls. ground: standing at `focus`, looking up.
 *  follow: the camera rides a moving entity (the ISS, an aircraft). */
export type GlobeView = "orbit" | "ground" | "follow";

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
  setStyle: (style: EarthStyle) => void;
  toggleLayer: (id: LayerId) => void;
  setView: (view: GlobeView) => void;
  flyTo: (focus: Focus | null) => void;
  select: (selection: Selection | null) => void;
  setTimeOffset: (minutes: number) => void;
  setTourStep: (step: number | null) => void;
  setStatus: (key: StatusKey, health: LayerHealth | undefined) => void;
}

export const useGlobe = create<GlobeState>((set) => ({
  style: "imagery",
  layers: { markers: true, stars: true, satellites: true, aircraft: true, presence: true, pulses: true, hazards: true },
  view: "orbit",
  focus: null,
  selected: null,
  timeOffsetMin: 0,
  tourStep: null,
  status: {},
  setStyle: (style) => set({ style }),
  toggleLayer: (id) => set((s) => ({ layers: { ...s.layers, [id]: !s.layers[id] } })),
  setView: (view) => set({ view }),
  flyTo: (focus) => set({ focus }),
  select: (selected) => set({ selected }),
  setTimeOffset: (timeOffsetMin) => set({ timeOffsetMin }),
  setTourStep: (tourStep) => set({ tourStep }),
  setStatus: (key, health) => set((s) => ({ status: { ...s.status, [key]: health } })),
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
