// LANE W12. A compact JSON snapshot of what the globe currently shows —
// grounds the LLM fallback (askLLM.ts sends this alongside the visitor's
// text) so it can answer "what's happening in Japan" or write a narrate
// that cites real numbers instead of inventing them. Kept under 2 KB (see
// shrinkToFit below and context.test.ts's own size-cap test): this rides on
// every globe-mode request, on top of an already-large system prompt.
import { entityPositions, LAYER_IDS, simTime, useGlobe } from "../globeStore.ts";
import { xyzToLatLon } from "../cameraMath.ts";

/** HazardLayer.tsx (L7) owns and writes `window.__HAZARD_DEBUG__` — read
 *  here through a local cast rather than a `declare global` augmentation
 *  (that file already augments the same global with its own, larger shape;
 *  two conflicting augmentations of the same property is a TS2717 error).
 *  `topQuakes` and `filters` are this lane's additions to that existing
 *  debug object — see HazardLayer.tsx's own comment. */
interface HazardDebugSlice {
  quakes: number;
  fires: number;
  storms: number;
  topQuakes?: { place: string; mag: number }[];
}
function readHazardDebug(): HazardDebugSlice | undefined {
  return (window as unknown as { __HAZARD_DEBUG__?: HazardDebugSlice }).__HAZARD_DEBUG__;
}

// The ISS, as SatelliteLayer.tsx (L3) and intents.ts both key it.
const ISS_ENTITY_ID = "sat:25544";

export interface GlobeContextSnapshot {
  simTime: string;
  layersOn: string[];
  health: Record<string, string>;
  selected: { kind: string; title: string } | null;
  camera: { lat: number; lon: number } | null;
  quakes: { count: number; top: { place: string; mag: number }[] };
  fires: number;
  storms: number;
  iss: { lat: number; lon: number } | null;
}

export const CONTEXT_MAX_BYTES = 2048;

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function jsonBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

/** Defensive truncation so a pathological state (many layers, each with a
 *  long health detail) can never push this past budget — dropping the least
 *  useful fields first: health strings, then quake detail, then layer names. */
function shrinkToFit(snapshot: GlobeContextSnapshot, maxBytes: number): GlobeContextSnapshot {
  let s = snapshot;
  if (jsonBytes(s) <= maxBytes) return s;
  s = { ...s, health: {} };
  if (jsonBytes(s) <= maxBytes) return s;
  s = { ...s, quakes: { ...s.quakes, top: s.quakes.top.slice(0, 1) } };
  if (jsonBytes(s) <= maxBytes) return s;
  s = { ...s, layersOn: s.layersOn.slice(0, 3) };
  return s;
}

export function buildGlobeContext(nowMs: number = Date.now()): GlobeContextSnapshot {
  const s = useGlobe.getState();
  const layersOn = LAYER_IDS.filter((id) => s.layers[id]);

  const health: Record<string, string> = {};
  for (const id of layersOn) {
    const detail = s.status[id]?.detail;
    if (detail) health[id] = detail.slice(0, 60);
  }

  const selected = s.selected ? { kind: s.selected.kind, title: s.selected.title.slice(0, 60) } : null;

  let camera: { lat: number; lon: number } | null = null;
  if (s.focus?.kind === "latlon") {
    camera = { lat: round1(s.focus.lat), lon: round1(s.focus.lon) };
  } else if (s.focus?.kind === "entity") {
    const p = entityPositions.get(s.focus.id)?.();
    if (p) {
      const ll = xyzToLatLon({ x: p.x, y: p.y, z: p.z });
      camera = { lat: round1(ll.lat), lon: round1(ll.lon) };
    }
  }

  const hazard = typeof window !== "undefined" ? readHazardDebug() : undefined;
  const issPos = typeof window !== "undefined" ? entityPositions.get(ISS_ENTITY_ID)?.() : undefined;
  const iss = issPos ? (() => {
    const ll = xyzToLatLon({ x: issPos.x, y: issPos.y, z: issPos.z });
    return { lat: round1(ll.lat), lon: round1(ll.lon) };
  })() : null;

  const snapshot: GlobeContextSnapshot = {
    simTime: simTime(s.timeOffsetMin, nowMs).toISOString(),
    layersOn,
    health,
    selected,
    camera,
    quakes: { count: hazard?.quakes ?? 0, top: (hazard?.topQuakes ?? []).slice(0, 5) },
    fires: hazard?.fires ?? 0,
    storms: hazard?.storms ?? 0,
    iss,
  };
  return shrinkToFit(snapshot, CONTEXT_MAX_BYTES);
}
