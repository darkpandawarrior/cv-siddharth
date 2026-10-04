// LANE L7 (live earth events). Pure USGS earthquake parsing and the two
// visual mappings (magnitude -> ring radius, depth -> colour) plus the time
// helpers HazardLayer and quakeGlyphs.tsx need. No three, no React, no DOM —
// same "render layer wraps pure math" split as geoMath.ts.
//
// Feed: https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson
// (also 2.5_week.geojson for more history — not used here: tiers T2/T3 are a
// client-side magnitude filter over the SAME all-day feed, not a second
// fetch, per this lane's brief). Refresh cadence: 5 min (USGS's own).
export const QUAKE_POLL_MS = 5 * 60_000;

/** The one USGS geojson shape this parser reads (feed docs: "summary" format). */
interface UsgsFeature {
  id: string;
  properties: {
    mag: number | null;
    place: string | null;
    time: number;
    url: string;
  };
  geometry: { type: string; coordinates: [number, number, number] } | null;
}
interface UsgsFeed {
  type: string;
  features: UsgsFeature[];
}

export interface Quake {
  id: string;
  mag: number;
  place: string;
  lat: number;
  lon: number;
  depthKm: number;
  timeMs: number;
  url: string;
}

/** `null` on anything that doesn't look like the real feed — a fetch/shape
 *  failure draws nothing rather than garbage markers (the house "absent, not
 *  faked" rule every other live parser here follows). */
export function parseQuakes(json: unknown): Quake[] | null {
  const feed = json as Partial<UsgsFeed> | null;
  if (!feed || typeof feed !== "object" || !Array.isArray(feed.features)) return null;
  const quakes: Quake[] = [];
  for (const f of feed.features) {
    const coords = f.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 3 || typeof f.properties?.mag !== "number") continue;
    quakes.push({
      id: f.id,
      mag: f.properties.mag,
      place: f.properties.place ?? "unknown location",
      lon: coords[0],
      lat: coords[1],
      depthKm: coords[2],
      timeMs: f.properties.time,
      url: f.properties.url ?? "https://earthquake.usgs.gov/",
    });
  }
  return quakes;
}

export const TIER_MIN_MAG: Record<1 | 2 | 3, number> = { 1: -Infinity, 2: 2.5, 3: 4.5 };
/** T3 is a static read (this lane's task 1: "T3 M4.5+ static") — no
 *  arrival pulse, no M>=5 ripple, just the resting ring. */
export const TIER_STATIC: Record<1 | 2 | 3, boolean> = { 1: false, 2: false, 3: true };

export function filterQuakesForTier(quakes: Quake[], tier: 1 | 2 | 3): Quake[] {
  const min = TIER_MIN_MAG[tier];
  return quakes.filter((q) => q.mag >= min);
}

/** Magnitude >= this gets the slow repeating ripple (task 1). */
export const RIPPLE_MIN_MAG = 5;

// ponytail: a 2-point radius curve, not a fitted physical model — log2
// because magnitude already IS a log scale (each +1 is ~32x energy), so a
// second log keeps the drawn size from swamping the globe at M9 while still
// separating M0 from M9 by about 3x. Upgrade to a fitted curve if a real
// dataset ever asks for a specific spread.
const QUAKE_MIN_RADIUS = 0.012;
const QUAKE_RADIUS_SCALE = 0.06;

/** World-unit outer radius for a quake's surface ring, log-scaled by
 *  magnitude so a M9 reads as clearly bigger than a M2 without a M9 ring
 *  swallowing a continent (GLOBE_RADIUS is 6 units). */
export function magnitudeToRadius(mag: number): number {
  const m = Math.max(mag, 0);
  return QUAKE_MIN_RADIUS + QUAKE_RADIUS_SCALE * Math.log2(m + 2);
}

// Perceptual-in-spirit, not a Lab/OKLab ramp (ponytail: a 2-stop RGB lerp is
// the whole ask here — ~all quakes are 0-300km, deeper ones just clamp to
// the coolest stop). Warm amber (shallow, the destructive, felt kind) to
// cool indigo (deep, the ones nobody feels) — deliberately NOT this app's
// brand tokens: depth is data, not a claim (house rule, globe-lanes.md).
const SHALLOW_RGB = [255, 183, 3] as const; // #ffb703
const DEEP_RGB = [58, 12, 163] as const; // #3a0ca3
const DEPTH_COOL_KM = 300;

function toHex(rgb: readonly [number, number, number]): string {
  return "#" + rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
}

/** Shallow-warm to deep-cool ring colour, clamped past 300km (subduction
 *  quakes go to 700km; past 300 the colour has nothing left to say). */
export function depthToColor(depthKm: number): string {
  const t = Math.max(0, Math.min(1, depthKm / DEPTH_COOL_KM));
  const rgb: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < 3; i++) rgb[i] = SHALLOW_RGB[i] + (DEEP_RGB[i] - SHALLOW_RGB[i]) * t;
  return toHex(rgb);
}

export const QUAKE_DEPTH_LEGEND = {
  unit: "km depth",
  stops: [{ color: depthToColor(0), label: "0" }, { color: depthToColor(DEPTH_COOL_KM), label: `${DEPTH_COOL_KM}+` }],
};

/** "3 min ago" / "2 hr ago" / "5 d ago" for the inspector row. */
export function formatTimeAgo(nowMs: number, eventMs: number): string {
  const deltaMin = Math.max(0, Math.floor((nowMs - eventMs) / 60_000));
  if (deltaMin < 1) return "just now";
  if (deltaMin < 60) return `${deltaMin} min ago`;
  const deltaHr = Math.round(deltaMin / 60);
  if (deltaHr < 24) return `${deltaHr} hr ago`;
  return `${Math.round(deltaHr / 24)} d ago`;
}

/** Task 7 (time scrubbing): quakes at or before the simulated instant stay,
 *  later ones (the scrubber wound back before they happened) are dropped.
 *  Older-than-a-day-from-`simNowMs` ones fade rather than vanish outright —
 *  a floor so nothing goes fully invisible, just dim. */
const FADE_HORIZON_MS = 24 * 60 * 60_000;
const FADE_FLOOR = 0.15;

export function quakesAtTime(quakes: Quake[], simNowMs: number): Quake[] {
  return quakes.filter((q) => q.timeMs <= simNowMs);
}

export function quakeFadeAlpha(simNowMs: number, eventMs: number): number {
  const age = Math.max(0, simNowMs - eventMs);
  return Math.max(FADE_FLOOR, 1 - age / FADE_HORIZON_MS);
}
