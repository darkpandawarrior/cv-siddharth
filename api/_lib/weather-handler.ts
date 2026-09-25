// `.js` extension on purpose: Vercel's @vercel/node builder type-checks this
// file with its own tsconfig (moduleResolution "node16"), which requires
// explicit extensions in ESM imports — same as github-activity.ts.
import { guarded } from "./guard.js";
import type { Air, River, Season, Weather } from "../../src/lib/sky.js";

declare const process: { env: Record<string, string | undefined> };

export type { Air, River, Season, Weather };
export type WeatherResponse = {
  connected: boolean;
  weather: Weather | null;
  air: Air | null;
  river: River | null;
  season: Season | null;
  rain6hMm: number | null;
  attribution: string[];
};

// City-level Pune coordinates, matching src/lib/sky.ts's PUNE constant (kept
// as literals here on purpose, same rationale as before this widening — this
// file's only job is three upstream calls, and importing sky.ts's PUNE for
// two numbers would pull a client-only pure-math module into the edge bundle
// for no behavioural gain). The flood cell sits a fraction of a degree off
// (18.53/73.87 vs 18.52/73.86): that is the Sangam confluence GloFAS actually
// resolves to, per the lane brief.
const FORECAST_URL =
  "https://api.open-meteo.com/v1/forecast" +
  "?latitude=18.52&longitude=73.86" +
  "&current=temperature_2m,relative_humidity_2m,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,visibility" +
  "&hourly=precipitation&past_hours=6" +
  "&daily=precipitation_sum&past_days=30" +
  "&timezone=Asia%2FKolkata";

const AIR_URL =
  "https://air-quality-api.open-meteo.com/v1/air-quality" +
  "?latitude=18.52&longitude=73.86" +
  "&current=pm2_5,pm10,us_aqi,european_aqi,aerosol_optical_depth" +
  "&timezone=Asia%2FKolkata";

const FLOOD_URL =
  "https://flood-api.open-meteo.com/v1/flood" +
  "?latitude=18.53&longitude=73.87" +
  "&daily=river_discharge&past_days=7&forecast_days=3";

const TIMEOUT_MS = 4000;
// No email or other personal identifier in any header — the guard G6/privacy
// rule this whole route family follows (github-activity, ops, pipeline).
const USER_AGENT = "siddharth-pandalai.vercel.app portfolio";

const ATTRIBUTION = [
  "Weather data by Open-Meteo.com (CC BY 4.0)",
  "Air quality: CAMS model via Open-Meteo.com (CC BY 4.0)",
  "River discharge: GloFAS (Copernicus EMS) via Open-Meteo.com, modelled 5 km cell, not a gauge",
];

interface ForecastResponse {
  current?: {
    time: string;
    interval: number;
    temperature_2m: number;
    relative_humidity_2m: number;
    precipitation: number;
    weather_code: number;
    cloud_cover: number;
    wind_speed_10m: number;
    wind_direction_10m: number;
    visibility: number;
  };
  hourly?: { precipitation: number[] };
  daily?: { precipitation_sum: number[] };
}

interface AirApiResponse {
  current?: {
    time: string;
    pm2_5: number;
    pm10: number;
    us_aqi: number;
    european_aqi: number;
    aerosol_optical_depth: number;
  };
}

interface FloodResponse {
  daily?: { time: string[]; river_discharge: number[] };
}

/**
 * One upstream fetch, `null` on anything that isn't a clean 200 — a rejected
 * fetch (timeout, DNS, network), a non-ok status, or a body that doesn't
 * parse as JSON. Same contract as github-activity-handler.ts: this never
 * throws, so the caller's Promise.allSettled entries never land in the
 * "rejected" branch.
 */
async function fetchJson<T>(url: string, fetchImpl: typeof fetch): Promise<T | null> {
  try {
    const res = await fetchImpl(url, {
      headers: { "user-agent": USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Open-Meteo's `current` values cover the preceding model interval
 * (`current.interval`, seconds) rather than a rate — `precipitation` is the
 * total mm that fell during that interval, so converting to mm/h needs
 * `* 3600 / interval` (confirmed against the live `current_units` block,
 * which labels `precipitation` "mm" not "mm/h"; live-data-spec §1.2).
 */
function parseWeather(data: ForecastResponse | null): {
  weather: Weather | null;
  rain6hMm: number | null;
  season: Season | null;
} {
  const c = data?.current;
  if (!c) return { weather: null, rain6hMm: null, season: null };
  const weather: Weather = {
    at: c.time,
    intervalSec: c.interval,
    tempC: c.temperature_2m,
    code: c.weather_code,
    cloudPct: c.cloud_cover,
    precipMmH: (c.precipitation * 3600) / c.interval,
    windKmh: c.wind_speed_10m,
    windFromDeg: c.wind_direction_10m,
    humidityPct: c.relative_humidity_2m,
    visibilityM: c.visibility,
  };
  const hourly = data?.hourly?.precipitation;
  const rain6hMm = hourly ? hourly.reduce((sum, v) => sum + v, 0) : null;
  // `past_days=30` guarantees at least 30 leading entries are the trailing
  // 30 days regardless of whatever forecast days Open-Meteo appends after
  // them by default — slice rather than trust the array's exact length.
  const daily = data?.daily?.precipitation_sum;
  const season: Season | null = daily ? { days: 30, sumMm: daily.slice(0, 30).reduce((sum, v) => sum + v, 0) } : null;
  return { weather, rain6hMm, season };
}

function parseAir(data: AirApiResponse | null): Air | null {
  const c = data?.current;
  if (!c) return null;
  return { at: c.time, pm25: c.pm2_5, pm10: c.pm10, usAqi: c.us_aqi, euAqi: c.european_aqi, aod: c.aerosol_optical_depth };
}

/**
 * `past_days=7&forecast_days=3` gives 7 past values then 3 forecast values
 * (today plus 2 ahead) — 10 total. `dischargeM3s` is today's value (the
 * first of the 3 forecast entries); `next` is the 2 ahead; `range7d` is the
 * [min, max] of the 7 past entries.
 */
function parseRiver(data: FloodResponse | null): River | null {
  const d = data?.daily;
  if (!d || d.river_discharge.length < 8) return null;
  const past = d.river_discharge.slice(0, -3);
  const forecast = d.river_discharge.slice(-3);
  return {
    date: d.time[d.time.length - 3],
    dischargeM3s: forecast[0],
    next: forecast.slice(1),
    range7d: [Math.min(...past), Math.max(...past)],
  };
}

/**
 * Same shape as github-activity-handler.ts: never throws, a dead or slow
 * upstream degrades that one block to `null` rather than ever failing the
 * request. `connected` mirrors the primary forecast block only — air and
 * river are auxiliary and were always allowed to be independently absent.
 */
export async function getWeather(
  _env: Record<string, string | undefined>,
  fetchImpl: typeof fetch = fetch,
): Promise<WeatherResponse> {
  const [forecastResult, airResult, floodResult] = await Promise.allSettled([
    fetchJson<ForecastResponse>(FORECAST_URL, fetchImpl),
    fetchJson<AirApiResponse>(AIR_URL, fetchImpl),
    fetchJson<FloodResponse>(FLOOD_URL, fetchImpl),
  ]);
  const forecastData = forecastResult.status === "fulfilled" ? forecastResult.value : null;
  const airData = airResult.status === "fulfilled" ? airResult.value : null;
  const floodData = floodResult.status === "fulfilled" ? floodResult.value : null;

  const { weather, rain6hMm, season } = parseWeather(forecastData);
  const air = parseAir(airData);
  const river = parseRiver(floodData);

  return { connected: weather !== null, weather, air, river, season, rain6hMm, attribution: ATTRIBUTION };
}

async function weatherHandler(_request: Request): Promise<Response> {
  const body = await getWeather(process.env);
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json",
      // Open-Meteo's own current-weather interval is 900s — matching it
      // caps this endpoint at one real upstream call per edge node per
      // 15 minutes (P3).
      "cache-control": "public, max-age=0, s-maxage=900, stale-while-revalidate=3600",
    },
  });
}

export const handleWeather = guarded("weather", weatherHandler);
