// LANE P1 (wave 7 parked list: "Surprise me teleport — fits as a one-box
// command once X2 merges", now unblocked). Picks a real, currently
// interesting place from data this page has ALREADY loaded rather than
// inventing one — each candidate function below names exactly which already-
// loaded source it reads and why. Store-free and DOM-free (only
// `entityPositions`/`sessionStorage` reads, both already this codebase's own
// "read a live value without subscribing" convention — see globeStore.ts's
// own header on `entityPositions`), so every candidate builder here is a
// plain function a test can call without mounting React or a Canvas.
import { xyzToLatLon } from "../cameraMath.ts";
import { sunTimes } from "../../../lib/sky.ts";
import { mapsExport, mapsPlaces, type MapsPlace } from "../../../data/generated/mapsPlaces.ts";
import { getCachedLaunches, formatCountdown, type Launch } from "../layers/launches.ts";
import { parseQuakes, type Quake } from "../layers/quake.ts";
import { entityPositions, useGlobe, type Selection } from "../globeStore.ts";

import { getLiveSignalSnapshot } from "../../../lib/useLiveSignal.ts";

const ISS_ENTITY_ID = "sat:25544";
// Reuse the feed already loaded by HazardLayer/CountryLayer; no request here.
const QUAKES_URL = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson";

export interface SurpriseResult {
  selection: Selection;
  /** Why this candidate was picked, shown verbatim in the one-box answer
   *  line — G8 (never a number without its source) applied to a PLACE: a
   *  visitor is told why the globe flew somewhere, not just where. */
  reason: string;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ---------------------------------------------------------------------------
// Candidate 1: the ISS, wherever it actually is right now. Reads the SAME
// module-level position getter CameraDirector/LayerPanel already use for
// "follow the ISS" (globeStore.ts `entityPositions`) — real telemetry
// SatelliteLayer.tsx registered, not a second copy of it.
// ---------------------------------------------------------------------------
export function issCandidate(): SurpriseResult | null {
  const getPosition = entityPositions.get(ISS_ENTITY_ID);
  const p = getPosition?.();
  if (!p || ![p.x, p.y, p.z].every(Number.isFinite) || Math.hypot(p.x, p.y, p.z) === 0 || useGlobe.getState().timeOffsetMin !== 0 || useGlobe.getState().status.satellites?.state === "failed") return null; // satellites layer not mounted / no TLE fix yet -- never invented
  const { lat, lon } = xyzToLatLon({ x: p.x, y: p.y, z: p.z });
  return {
    selection: {
      id: ISS_ENTITY_ID,
      kind: "satellite",
      title: "The ISS, right now",
      rows: [{ label: "Position", value: `${round1(lat)}, ${round1(lon)}` }],
      source: "CelesTrak TLE, computed orbital position",
      live: true,
      focus: { kind: "entity", id: ISS_ENTITY_ID },
    },
    reason: "where the ISS is now (computed from its orbit)",
  };
}

// ---------------------------------------------------------------------------
// Candidate 2: the next real rocket launch, from the SAME sessionStorage
// cache HazardLayer.tsx already wrote this page load (layers/launches.ts's
// own getCachedLaunches/CACHE_KEY) — no second Launch Library request.
// `undefined` (not `null`) storage lets a test pass a plain object without
// building a full Storage mock.
// ---------------------------------------------------------------------------
export function launchCandidate(nowMs: number, storage: Pick<Storage, "getItem" | "setItem"> | undefined): SurpriseResult | null {
  if (!storage) return null;
  const launches = getCachedLaunches(storage, nowMs);
  if (!launches || launches.length === 0) return null;
  const next: Launch | undefined = launches.find((launch) => launch.netMs > nowMs && launch.netMs - nowMs <= 86_400_000 && Number.isFinite(launch.lat) && Math.abs(launch.lat) <= 90 && Number.isFinite(launch.lon) && Math.abs(launch.lon) <= 180);
  if (!next || useGlobe.getState().status.hazards?.state === "failed") return null; // parseLaunches already sorts by net ascending
  const where = next.locationName || next.padName;
  return {
    selection: {
      id: `launch:${next.id}`,
      kind: "surprise",
      title: next.name,
      rows: [
        { label: "Pad", value: next.padName || "unnamed pad" },
        { label: "Countdown", value: formatCountdown(nowMs, next.netMs) },
        { label: "Provider", value: next.provider },
      ],
      source: `Launch Library 2, cached schedule; launch ${new Date(next.netMs).toISOString()}`,
      live: false,
      focus: { kind: "latlon", lat: next.lat, lon: next.lon },
    },
    reason: `${next.name} is scheduled from ${where}, ${formatCountdown(nowMs, next.netMs)}`,
  };
}

// ---------------------------------------------------------------------------
// Candidate 3: the largest earthquake in the past day, from USGS's own
// all-day summary feed (parseQuakes is the exact pure parser
// layers/quake.ts already ships and tests; this lane only adds the fetch).
// ---------------------------------------------------------------------------
export function biggestQuakeCandidate(quakes: Quake[] | null): SurpriseResult | null {
  const valid = quakes?.filter((quake) => Number.isFinite(quake.timeMs) && Number.isFinite(quake.depthKm) && Number.isFinite(quake.mag) && Number.isFinite(quake.lat) && Math.abs(quake.lat) <= 90 && Number.isFinite(quake.lon) && Math.abs(quake.lon) <= 180);
  if (!valid?.length) return null;
  const biggest = valid.reduce((a, b) => (b.mag > a.mag ? b : a));
  return {
    selection: {
      id: `quake:${biggest.id}`,
      kind: "surprise",
      title: `M${biggest.mag.toFixed(1)} ${biggest.place}`,
      rows: [
        { label: "Magnitude", value: biggest.mag.toFixed(1) },
        { label: "Depth", value: `${Math.round(biggest.depthKm)} km` },
      ],
      source: `USGS, past day; event ${new Date(biggest.timeMs).toISOString()}`,
      live: true,
      focus: { kind: "latlon", lat: biggest.lat, lon: biggest.lon },
    },
    reason: `the largest earthquake in the loaded past-day USGS feed is M${biggest.mag.toFixed(1)} near ${biggest.place}`,
  };
}

// Candidate 4: a sampled real city within 30 minutes of its computed sunset.
interface SunsetCity {
  name: string;
  country: string;
  lat: number;
  lon: number;
}

// A fixed, real, well-spaced (roughly every 30 degrees of longitude) set of
// major cities so "somewhere is at sunset" always resolves to a genuine
// place, never an invented one (house rule, globe-lanes.md).
const SUNSET_CITIES: readonly SunsetCity[] = [
  { name: "Los Angeles", country: "USA", lat: 34.05, lon: -118.24 },
  { name: "Mexico City", country: "Mexico", lat: 19.43, lon: -99.13 },
  { name: "New York", country: "USA", lat: 40.71, lon: -74.01 },
  { name: "Reykjavik", country: "Iceland", lat: 64.15, lon: -21.94 },
  { name: "London", country: "UK", lat: 51.51, lon: -0.13 },
  { name: "Cairo", country: "Egypt", lat: 30.04, lon: 31.24 },
  { name: "Nairobi", country: "Kenya", lat: -1.29, lon: 36.82 },
  { name: "Dubai", country: "UAE", lat: 25.2, lon: 55.3 },
  { name: "Mumbai", country: "India", lat: 19.08, lon: 72.88 },
  { name: "Bangkok", country: "Thailand", lat: 13.76, lon: 100.5 },
  { name: "Tokyo", country: "Japan", lat: 35.68, lon: 139.69 },
  { name: "Sydney", country: "Australia", lat: -33.87, lon: 151.21 },
  { name: "Auckland", country: "New Zealand", lat: -36.85, lon: 174.76 },
];

export function sunsetCandidate(now: Date): SurpriseResult | null {
  const candidates = SUNSET_CITIES.map((city) => ({ city, sunset: sunTimes(now, city.lat, city.lon).sunset }));
  const nearby = candidates.filter(({ sunset }) => Number.isFinite(sunset.getTime()) && Math.abs(sunset.getTime() - now.getTime()) <= 30 * 60_000);
  if (!nearby.length) return null;
  const { city, sunset } = nearby.reduce((a, b) => Math.abs(a.sunset.getTime() - now.getTime()) < Math.abs(b.sunset.getTime() - now.getTime()) ? a : b);
  return {
    selection: {
      id: `sunset:${city.name}`, kind: "surprise", title: `Sunset near ${city.name}`,
      rows: [{ label: "Sunset UTC", value: `${sunset.toISOString()} (computed, not observed)` }],
      source: "computed with the site's solar model, including latitude and season",
      live: false, focus: { kind: "latlon", lat: city.lat, lon: city.lon, distance: 14 },
    },
    reason: `sunset is within 30 minutes in ${city.name}, ${city.country} (computed)`,
  };
}

// ---------------------------------------------------------------------------
// Candidate 5: one of the owner's own Google Maps Local Guide places --
// already-loaded static data (src/data/generated/mapsPlaces.ts, bundled at
// build time, the exact source layers/GuideLayer.tsx draws from).
// ---------------------------------------------------------------------------
export function mapsPlaceCandidate(places: readonly MapsPlace[], rand: () => number): SurpriseResult | null {
  if (places.length === 0) return null;
  const place = places[Math.floor(rand() * places.length)];
  return {
    selection: {
      id: `maps:${place.slug}`,
      kind: "surprise",
      title: place.city,
      rows: [
        { label: "Reviews", value: String(place.reviews) },
        { label: "Photos", value: String(place.photos) },
      ],
      source: `Google Maps Local Guide export ${mapsExport} (owner contributions)`,
      live: false,
      focus: { kind: "latlon", lat: place.lat, lon: place.lon },
    },
    reason: `the owner contributed reviews or photos in ${place.city} on Google Maps`,
  };
}

// ---------------------------------------------------------------------------
// Picking one candidate. `rand` is injectable (defaults to Math.random) so a
// test can assert a specific slot without flaking.
// ---------------------------------------------------------------------------
export function chooseCandidate(pool: readonly SurpriseResult[], rand: () => number = Math.random): SurpriseResult | null {
  if (pool.length === 0) return null;
  return pool[Math.floor(rand() * pool.length)];
}

/** Every source this session can honestly offer right now. Each builder
 *  already returns `null` for "not loaded / not available" rather than
 *  inventing a fallback, so this is a plain filter, not a health check of
 *  its own. */
export function surpriseCandidates(nowMs: number, storage: Pick<Storage, "getItem" | "setItem"> | undefined): SurpriseResult[] {
  const snapshot = getLiveSignalSnapshot<unknown>(QUAKES_URL);
  const quakes = snapshot.error ? null : parseQuakes(snapshot.data)?.filter((quake) => quake.timeMs <= nowMs && nowMs - quake.timeMs <= 86_400_000) ?? null;
  return [issCandidate(), launchCandidate(nowMs, storage), biggestQuakeCandidate(quakes), sunsetCandidate(new Date(nowMs)), mapsPlaceCandidate(mapsPlaces, Math.random)].filter((candidate): candidate is SurpriseResult => candidate !== null);
}

export function pickSurprise(nowMs: number = Date.now()): SurpriseResult | null {
  let storage: Storage | undefined;
  try { storage = typeof window === "undefined" ? undefined : window.sessionStorage; } catch { /* Private browsing may block storage. */ }
  return chooseCandidate(surpriseCandidates(nowMs, storage));
}
