import { useMemo } from "react";
import { create } from "zustand";
import type { MapsReview } from "../../data/generated/mapsPlaces.ts";
import type { Camera, Scene, Vector3 } from "three";

/**
 * /globe's one piece of shared state. The HUD, the layer panel, the
 * inspector, the tour and every WebGL layer read and write here instead of
 * threading props through Globe.tsx, so a layer can be added without
 * touching any other layer's file.
 */

/** Every toggleable layer, in the order the layer panel lists them. */
export const LAYER_IDS = ["markers", "stars", "satellites", "aircraft", "presence", "pulses", "hazards", "wind", "reach", "countries", "together", "density", "guide", "daylight", "eclipse", "buoys"] as const;
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
  guide?: { review?: MapsReview; places?: MapsReview[] };
  id: string;
  kind: string;
  title: string;
  /** `swatch` (a CSS colour) keys a row to the 3D marker it describes (a
   *  ring, a reach column) - LANE U1's composition fix for the retired
   *  floating Pune card, whose rows carried the same per-row colour dot.
   *  Rows without a swatch render as the original two-column label/value
   *  grid; a swatch row renders full-width so a long claim sentence is never
   *  truncated (G8: never abbreviate a claim). */
  rows: { label: string; value: string; swatch?: string }[];
  source: string;
  live: boolean;
  focus?: Focus;
  /** WAVE 6 LANE X6 (craft: inspector sparklines), additive: a real time
   *  series to draw as a tiny inline chart below `rows`, oldest to newest.
   *  Optional because most selections have none — Inspector.tsx never
   *  invents one; `sparkLabel` names the exact source (e.g. "M4.5+, 7d,
   *  USGS weekly feed") so the chart is never a number without its source
   *  (G8) any more than a `rows` value is. */
  spark?: number[];
  sparkLabel?: string;
  /** Frequency buckets use zero-based bars; time series keep their line. */
  sparkKind?: "histogram";
  /** LANE T1 (My Maps places): an optional horizontally scrolling photo
   *  strip the Inspector renders below the rows — curated thumbnails only,
   *  never an original filename or a live fetch. `alt` is required so every
   *  image stays screen-reader legible even without a caption. */
  media?: { src: string; alt: string; caption: string }[];
}

/** A layer's honest health, shown beside its toggle. `detail` is a short
 *  human line ("47 quakes, USGS, 3 min ago" / "TLE feed unreachable"). A
 *  layer that cannot reach its feed reports "failed" and draws nothing: no
 *  stale value is ever dressed as live. */
export type LayerHealth = { state: "loading" | "live" | "snapshot" | "failed"; detail?: string };
export type StatusKey = LayerId | "earth";

/** Phones show one bottom sheet at a time; opening one closes the others. */
export type GlobeSheet = "layers" | "time" | "tour" | "inspector" | "brief" | "story" | null;

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

/** LANE W15 (together): the full live count of OTHER explorers on
 *  `/globe` right now (never capped -- TogetherLayer.tsx may draw fewer
 *  than this) and whether this tab shares its own view. Nothing here is a
 *  location or an identity, and nothing here is ever persisted -- see
 *  together.ts's own header comment for the privacy contract this field
 *  is downstream of. */
export interface TogetherState {
  count: number;
  sharing: boolean;
}

interface GlobeState {
  storyArcsOn: boolean;
  setStoryArcsOn: (on: boolean) => void;
  cloudsOn: boolean;
  setCloudsOn: (on: boolean) => void;
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
  together: TogetherState;
  /** LANE U1 (layout): whether the right-edge LayerPanel column is expanded
   *  or collapsed to its 34px icon, sm+ only (phones use `sheet` instead).
   *  Read at store-creation time from the viewport (open by default at
   *  >= 1280, collapsed below it, per the composed layout spec) rather than
   *  a component's own lazy useState, so GlobeScene's SceneRig can shift the
   *  camera's screen centre by the same value without prop-threading it. */
  panelOpen: boolean;
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
  setTogetherCount: (count: number) => void;
  setTogetherSharing: (sharing: boolean) => void;
  setPanelOpen: (open: boolean) => void;
}

// Desktop-open / narrower-collapsed default: read once at module load, not
// in a component effect, so it is available before LayerPanel's own first
// render and before SceneRig frames the camera around it. Guarded for SSR
// (this store is imported by Globe.tsx, which routes/globe.tsx server-
// renders) - `window` is defined by the time this module re-evaluates on the
// client, since every consumer of `panelOpen` is mounted behind Globe.tsx's
// ClientOnly gate.
const PANEL_OPEN_DEFAULT_QUERY = "(min-width: 1280px)";
function initialPanelOpen(): boolean {
  return typeof window === "undefined" ? true : window.matchMedia(PANEL_OPEN_DEFAULT_QUERY).matches;
}

export const useGlobe = create<GlobeState>((set) => ({
  storyArcsOn: true,
  setStoryArcsOn: (storyArcsOn) => set({ storyArcsOn }),
  cloudsOn: true,
  setCloudsOn: (cloudsOn) => set({ cloudsOn }),
  style: "imagery",
  layers: { buoys: false, markers: true, stars: true, satellites: true, aircraft: true, presence: true, pulses: true, hazards: true, wind: true, reach: true, countries: false, together: true, density: false, guide: true, daylight: true, eclipse: false },
  view: "orbit",
  focus: null,
  selected: null,
  timeOffsetMin: 0,
  tourStep: null,
  status: {},
  sheet: null,
  imagery: { base: "VIIRS_SNPP_CorrectedReflectance_TrueColor", overlays: [] },
  filters: {},
  // Default ON (brief: "Default sharing ON with an obvious toggle later" --
  // the UI lane wires the toggle to setTogetherSharing).
  together: { count: 0, sharing: true },
  panelOpen: initialPanelOpen(),
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
  setTogetherCount: (count) => set((s) => ({ together: { ...s.together, count } })),
  setTogetherSharing: (sharing) => set((s) => ({ together: { ...s.together, sharing } })),
  setPanelOpen: (panelOpen) => set({ panelOpen }),
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
export const sceneHandles: {
  camera: Camera | null;
  canvas: HTMLCanvasElement | null;
  scene: Scene | null;
  /** Request a frame: the Canvas may run frameloop "demand" (SceneActivity). */
  invalidate: (() => void) | null;
} = { camera: null, canvas: null, scene: null, invalidate: null };

/** LANE V4 (hover readout): the pointer's current globe surface point, kept
 *  as a plain ref like `entityPositions`/`sceneHandles` above rather than
 *  reactive state -- a pointermove firing at native event rate would
 *  re-render every store subscriber on every pixel if this were `set()`, and
 *  ui/HoverReadout.tsx only ever needs the latest value once per animation
 *  frame. `countryId` is filled in by layers/CountryLayer.tsx from the exact
 *  point-in-polygon test it already runs for its own highlight (when that
 *  boundaries layer happens to be mounted), so HoverReadout can skip a
 *  redundant Natural Earth lookup on the frames where one is already fresh;
 *  -1 means "not computed here" (layer unmounted, or point outside every
 *  country's bounding cell), and HoverReadout falls back to its own copy of
 *  the (memoised, singleton-fetched) country index either way. */
export interface HoverPoint { lat: number; lon: number; clientX: number; clientY: number }
export const hoverPoint: { current: HoverPoint | null; countryId: number } = { current: null, countryId: -1 };
