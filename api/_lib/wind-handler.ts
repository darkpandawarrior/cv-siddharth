import { FORECAST_URL } from "../../src/world/globe/layers/feedUrls.js";
// `.js` extension on purpose: Vercel's @vercel/node builder type-checks this
// file with its own tsconfig (moduleResolution "node16"), which requires
// explicit extensions in ESM imports — same as tle-handler.ts.
import { guarded } from "./guard.js";
import { governed, type GovernorOptions } from "./upstream.js";

// LANE W5 (global wind): Open-Meteo's forecast API, multi-location, one
// upstream call for a coarse global grid of 10 m wind — open-meteo.com/en/terms
// (free, non-commercial use, under 10,000 calls/day / 5,000/hour / 600/minute;
// data itself CC BY 4.0, attributed below). A personal portfolio is exactly
// the non-commercial case the terms name.
//
// Verified today (2026-09-28) with curl against the live API:
//  - a GET with ~600+ comma-separated locations intermittently 414s (URI too
//    large, upstream-side, not ours to control) — POST as
//    application/x-www-form-urlencoded avoids it and is Open-Meteo's own
//    documented alternative for a large location list.
//  - the hard cap is 1000 locations per request; this grid asks for 648.
//  - the exact 10-degree grid below (18 lat rows x 36 lon columns) returned
//    200 with a ~250 KB raw JSON body for wind_speed_10m + wind_direction_10m.
const USER_AGENT = "siddharth-pandalai.vercel.app portfolio";
const FETCH_TIMEOUT_MS = 12_000; // a 648-location POST measured 2.5-20s upstream, well above the other routes' single-point calls
const ATTRIBUTION = ["Wind: Open-Meteo.com (CC BY 4.0)"];

/** A regular lat/lon grid, row-major (lat outer, lon inner) — `u`/`v` in the
 *  compact response are indexed `lat_i * lonCount + lon_i` against this. */
export interface WindGridSpec {
  latStart: number;
  latStep: number;
  latCount: number;
  lonStart: number;
  lonStep: number;
  lonCount: number;
}

// 10-degree grid, poles inset by half a step so no row sits exactly on a
// pole (a real pole is a single point, not usefully a "cell") — 18 x 36 =
// 648 points, the brief's own target density.
export const WIND_GRID: WindGridSpec = { latStart: -85, latStep: 10, latCount: 18, lonStart: -180, lonStep: 10, lonCount: 36 };

export interface WindResponse {
  connected: boolean;
  stale: boolean;
  modelTime: string | null;
  grid: WindGridSpec | null;
  /** Eastward / northward m/s components of the vector the wind blows
   *  TOWARD (the visualisation convention client-side advection wants),
   *  Float32-friendly plain arrays, length `grid.latCount * grid.lonCount`. */
  u: number[];
  v: number[];
  attribution: string[];
}

const UNAVAILABLE: WindResponse = { connected: false, stale: false, modelTime: null, grid: null, u: [], v: [], attribution: ATTRIBUTION };

/** Row-major lat/lon CSVs for `grid`, matching a) the order Open-Meteo hands
 *  the multi-location response back in (array index === input order — a
 *  positional response is not documented, but was confirmed against the live
 *  API for both a 3-point and a 648-point request today) and b) the index
 *  math `parseWindUpstream` uses to fill `u`/`v`. Exported so a small grid
 *  can be built for a test the same way the real 648-point one is. */
export function buildWindQuery(grid: WindGridSpec): { latitude: string; longitude: string } {
  const lats: string[] = [];
  const lons: string[] = [];
  for (let latI = 0; latI < grid.latCount; latI++) {
    const lat = grid.latStart + latI * grid.latStep;
    for (let lonI = 0; lonI < grid.lonCount; lonI++) {
      lats.push(String(lat));
      lons.push(String(grid.lonStart + lonI * grid.lonStep));
    }
  }
  return { latitude: lats.join(","), longitude: lons.join(",") };
}

interface UpstreamPoint {
  current?: { time: string; wind_speed_10m: number; wind_direction_10m: number };
}

/**
 * `wind_speed_10m` is km/h; `wind_direction_10m` is the meteorological
 * "coming FROM" bearing (0 = from the north), degrees clockwise. The client
 * advects particles along the vector the wind blows TOWARD, so both are
 * converted here: speed to m/s, and direction flipped from "from" to
 * "toward" via the standard u = -speed*sin(dir), v = -speed*cos(dir) (dir
 * from north, clockwise) — e.g. wind FROM the north (dir 0) blows toward the
 * south, u=0, v=-speed, which the formula gives exactly.
 */
export function toUV(speedKmh: number, dirFromDeg: number): [u: number, v: number] {
  const speedMs = speedKmh / 3.6;
  const rad = (dirFromDeg * Math.PI) / 180;
  return [-speedMs * Math.sin(rad), -speedMs * Math.cos(rad)];
}

/**
 * Pure parser: the upstream's JSON array text plus the grid it was queried
 * for, never a network — testable against a committed trimmed real response.
 * `null` when the array length doesn't match the grid (a malformed or
 * truncated body is not worth guessing at). A point with no `current` block
 * (a transient upstream gap on one cell) is treated as calm (0, 0) rather
 * than failing the whole grid — one dead cell reads as a calm patch, not a
 * hole in the field.
 */
export function parseWindUpstream(text: string, grid: WindGridSpec): { modelTime: string | null; u: number[]; v: number[] } | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!Array.isArray(data) || data.length !== grid.latCount * grid.lonCount) return null;
  const points = data as UpstreamPoint[];
  const u: number[] = new Array(points.length);
  const v: number[] = new Array(points.length);
  let modelTime: string | null = null;
  for (let i = 0; i < points.length; i++) {
    const c = points[i].current;
    if (!c) {
      u[i] = 0;
      v[i] = 0;
      continue;
    }
    if (modelTime === null) modelTime = c.time;
    const [uu, vv] = toUV(c.wind_speed_10m, c.wind_direction_10m);
    u[i] = uu;
    v[i] = vv;
  }
  return { modelTime, u, v };
}

// The CDN's own s-maxage IS the real cap here: every edge node's cache
// collapses concurrent visitors onto one served response for an hour, so
// upstream calls are bounded at roughly 24/day per warm node regardless of
// traffic. minIntervalMs below is a second, per-isolate floor underneath
// that — belt and braces, not the primary mechanism.
const GOVERNOR_OPT: GovernorOptions = {
  minIntervalMs: 55 * 60_000,
  maxStaleMs: 24 * 60 * 60_000, // matches the success response's stale-while-revalidate
  maxBytes: 1024 * 1024, // measured raw body ~250 KB; generous headroom
  cooldownMs: 5 * 60_000,
  maxCooldownMs: 60 * 60_000,
};

function fetchGrid(grid: WindGridSpec, fetchImpl: typeof fetch): Promise<Response> {
  const { latitude, longitude } = buildWindQuery(grid);
  const body = new URLSearchParams({ latitude, longitude, current: "wind_speed_10m,wind_direction_10m", timezone: "UTC" });
  return fetchImpl(FORECAST_URL, {
    method: "POST",
    headers: { "user-agent": USER_AGENT, "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
}

export async function getWind(fetchImpl: typeof fetch = fetch): Promise<WindResponse> {
  const result = await governed<{ modelTime: string | null; u: number[]; v: number[] }>(
    "wind",
    () => fetchGrid(WIND_GRID, fetchImpl),
    (text) => {
      const parsed = parseWindUpstream(text, WIND_GRID);
      if (!parsed) throw new Error("wind: upstream grid shape mismatch");
      return parsed;
    },
    GOVERNOR_OPT,
  );
  if (result.value === null) return UNAVAILABLE;
  return { connected: true, stale: result.stale, modelTime: result.value.modelTime, grid: WIND_GRID, u: result.value.u, v: result.value.v, attribution: ATTRIBUTION };
}

// Success: an hour of shared CDN caching, a day of stale-while-revalidate —
// see GOVERNOR_OPT's comment. Failure: a short 60s negative cache, so a real
// outage degrades every visitor to one failed request a minute rather than
// storming the upstream (living-earth lanes doc, "bounded per cache window
// regardless of visitor count" applies to the error path too).
const SUCCESS_CACHE = "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400";
const ERROR_CACHE = "public, max-age=0, s-maxage=60";

async function windHandler(_request: Request): Promise<Response> {
  const body = await getWind();
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json", "cache-control": body.connected ? SUCCESS_CACHE : ERROR_CACHE },
  });
}

export const handleWind = guarded("wind", windHandler);
