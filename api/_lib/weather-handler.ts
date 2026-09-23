import { guarded } from "./guard.js";
import type { Weather } from "../../src/lib/sky.js";

declare const process: { env: Record<string, string | undefined> };

export type { Weather };
export type WeatherResponse = { connected: boolean; weather: Weather | null; source: string; sourceUrl: string };

const SOURCE = "Open-Meteo (CC BY 4.0)";
const SOURCE_URL = "https://open-meteo.com";
const EMPTY: WeatherResponse = { connected: false, weather: null, source: SOURCE, sourceUrl: SOURCE_URL };

// City-level Pune coordinates, matching src/lib/sky.ts's PUNE constant
// (kept as a literal here on purpose — this file's only job is one upstream
// call, and importing sky.ts's PUNE for two numbers would pull a client-only
// pure-math module into the edge bundle for no behavioural gain).
const UPSTREAM =
  "https://api.open-meteo.com/v1/forecast" +
  "?latitude=18.52&longitude=73.86" +
  "&current=temperature_2m,weather_code,cloud_cover,precipitation,wind_speed_10m,wind_direction_10m" +
  "&timezone=Asia%2FKolkata";

interface OpenMeteoResponse {
  current?: {
    time: string;
    temperature_2m: number;
    weather_code: number;
    cloud_cover: number;
    precipitation: number;
    wind_speed_10m: number;
    wind_direction_10m: number;
  };
}

/**
 * One upstream call, city-level, no key. Open-Meteo's own refresh interval
 * is 900s, matched by this handler's s-maxage below, so there is at most one
 * real upstream call per 15 minutes per edge node (P3).
 *
 * Same contract as github-activity-handler.ts's getGithubActivity: never
 * throws, a dead or slow upstream (a rejected fetch — 5xx, DNS, timeout — or
 * a non-ok status) degrades to `connected:false, weather:null` rather than
 * ever failing the request itself. The sun still renders; only the weather
 * readout says "unavailable right now" (P2).
 */
export async function getWeather(
  _env: Record<string, string | undefined>,
  fetchImpl: typeof fetch = fetch,
): Promise<WeatherResponse> {
  let res: Response;
  try {
    res = await fetchImpl(UPSTREAM);
  } catch {
    return EMPTY;
  }
  if (!res.ok) return EMPTY;

  let data: OpenMeteoResponse;
  try {
    data = (await res.json()) as OpenMeteoResponse;
  } catch {
    return EMPTY;
  }
  const c = data.current;
  if (!c) return EMPTY;

  const weather: Weather = {
    at: c.time,
    tempC: c.temperature_2m,
    code: c.weather_code,
    cloudPct: c.cloud_cover,
    precipMm: c.precipitation,
    windKmh: c.wind_speed_10m,
    windFromDeg: c.wind_direction_10m,
  };
  return { connected: true, weather, source: SOURCE, sourceUrl: SOURCE_URL };
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
