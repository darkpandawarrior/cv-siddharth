// LANE V4 (hover readout): pure logic split out of HoverReadout.tsx (the
// "render layer wraps pure math" split geoMath.ts/GlobeScene.tsx and
// layers/quake.ts/quakeGlyphs.tsx already use) so it's testable with a plain
// `vitest run` under this repo's `environment: "node"` config -- no
// react-dom/JSX import here to risk a browser-only module reference at
// import time.
import { distanceAndBearing } from "../exploreMath.ts";
import type { LatLon } from "../geoMath.ts";
import type { Quake } from "../layers/quake.ts";
import { windSpeed } from "../layers/windField.ts";

export const QUAKE_RADIUS_KM = 300;
const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;

/** The nearest quake to `point` within `maxKm`, or null. A plain linear scan
 *  (an all-day feed is at most a few hundred rows, and this runs at most
 *  once per animation frame) -- the same "small enough to just scan" call
 *  layers/CountryLayer.tsx's own inspector row makes against the identical
 *  feed. */
export function nearestQuakeWithin(quakes: Quake[] | null, point: LatLon, maxKm = QUAKE_RADIUS_KM): { quake: Quake; km: number } | null {
  if (!quakes) return null;
  let best: { quake: Quake; km: number } | null = null;
  for (const quake of quakes) {
    const { km } = distanceAndBearing(point, { lat: quake.lat, lon: quake.lon });
    if (km <= maxKm && (!best || km < best.km)) best = { quake, km };
  }
  return best;
}

/** `sampleWind`'s u/v (m/s, blowing TOWARD) reduced to one rounded-to-0.1
 *  speed plus an 8-point compass label of where it blows toward -- wind
 *  direction convention differs from PuneWeather's own Open-Meteo "from"
 *  degrees (layers/WindLayer.tsx's own header comment), so this says
 *  "toward" explicitly rather than reusing that label's wording. */
export function windLabel(u: number, v: number): { speed: number; compass: string } {
  const speed = Math.round(windSpeed(u, v) * 10) / 10;
  if (speed === 0) return { speed, compass: "calm" };
  const bearing = ((Math.atan2(u, v) * 180) / Math.PI + 360) % 360;
  return { speed, compass: COMPASS[Math.round(bearing / 45) % 8] };
}

export const HOVER_FETCH_GAP_MS = 1500;
export type HoverFetchHost = "marine" | "airQuality" | "flood" | "tide" | "cape";

/** Each name maps to a different origin. A fresh origin can start at t=0. */
export function allowHoverFetch(gates: Map<HoverFetchHost, number>, host: HoverFetchHost, now: number): boolean {
  const last = gates.get(host);
  if (last !== undefined && now - last < HOVER_FETCH_GAP_MS) return false;
  gates.set(host, now);
  return true;
}
