// LANE P10C (wave 10): NOAA CO-OPS tides/water-level for the hover readout.
// Same "pure fetch + parse" split as marine.ts/flood.ts -- no React, no
// three, testable with a plain fetch mock.
//
// Feeds: api.tidesandcurrents.noaa.gov -- keyless, US government public
// domain, CORS "*" (curl-confirmed live 2026-09-30 per the globe-recheck
// plan: `curl -I -H "Origin: https://cv-siddharth.vercel.app"
// "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?..."` -> 200,
// `access-control-allow-origin: *`). US coverage only -- NOAA CO-OPS has no
// stations outside US waters, so a miss here is the honest answer for the
// rest of the globe, not a feed failure.
import { distanceAndBearing } from "../exploreMath.ts";
import type { LatLon } from "../geoMath.ts";

export const STATIONS_URL = "https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?type=waterlevels";
export const DATAGETTER_URL = "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter";

export interface TideStation {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

interface RawStation { id?: string; name?: string; lat?: number; lng?: number }
interface RawStationsResponse { stations?: RawStation[] }

/** Drops any row missing an id/name/lat/lng rather than guessing -- same
 *  "absent, not faked" rule as parseMarine/parseFlood. */
export function parseStations(json: unknown): TideStation[] {
  const list = (json as RawStationsResponse | null)?.stations;
  if (!Array.isArray(list)) return [];
  const out: TideStation[] = [];
  for (const s of list) {
    if (!s || typeof s !== "object") continue;
    if (typeof s.id === "string" && typeof s.name === "string" && typeof s.lat === "number" && typeof s.lng === "number" && Number.isFinite(s.lat) && Number.isFinite(s.lng) && Math.abs(s.lat) <= 90 && Math.abs(s.lng) <= 180 && /^\d{7}$/.test(s.id)) {
      out.push({ id: s.id, name: s.name, lat: s.lat, lon: s.lng });
    }
  }
  return out;
}

// One module-level singleton promise, the same "fetched once, shared by
// every caller" pattern countryLoad.ts's loadCountries() uses for the
// Natural Earth index -- the 302-station list never changes mid-session,
// so every hover after the first reads the same cached array.
let stationsPending: Promise<TideStation[]> | null = null;
export function loadStations(fetchImpl: typeof fetch = fetch): Promise<TideStation[]> {
  if (!stationsPending) {
    stationsPending = fetchImpl(STATIONS_URL, { signal: AbortSignal.timeout(8000) })
      .then((res) => { if (!res.ok) throw new Error("NOAA station index unreachable"); return res.json(); })
      .then((json) => { const rows = parseStations(json); if (!rows.length) throw new Error("invalid station index"); return rows; })
      .catch((error) => {
        stationsPending = null; // a failed load can be retried on the next hover
        throw error;
      });
  }
  return stationsPending;
}

export const TIDE_STATION_RADIUS_KM = 50;

/** The nearest station to `point` within `maxKm`, or null -- linear scan,
 *  the same call nearestQuakeWithin makes against a similarly small list. */
export function nearestStationWithin(stations: TideStation[], point: LatLon, maxKm = TIDE_STATION_RADIUS_KM): { station: TideStation; km: number } | null {
  let best: { station: TideStation; km: number } | null = null;
  for (const station of stations) {
    const { km } = distanceAndBearing(point, { lat: station.lat, lon: station.lon });
    if (km <= maxKm && (!best || km < best.km)) best = { station, km };
  }
  return best;
}

export interface WaterLevelReading {
  meters: number;
  time: string;
}

interface RawWaterLevelRow { t?: string; v?: string }
interface RawWaterLevel { data?: RawWaterLevelRow[] }

function stationIdValid(stationId: string): void {
  if (!/^\d{7}$/.test(stationId)) throw new Error("invalid NOAA station ID");
}

export function waterLevelUrl(stationId: string): string {
  stationIdValid(stationId);
  return `${DATAGETTER_URL}?date=latest&station=${stationId}&product=water_level&datum=MLLW&units=metric&time_zone=gmt&format=json&application=cv-siddharth`;
}

export function parseWaterLevel(json: unknown): WaterLevelReading | null {
  const row = (json as RawWaterLevel | null)?.data?.[0];
  if (!row || typeof row.t !== "string" || typeof row.v !== "string") return null;
  const meters = row.v.trim() ? Number(row.v) : NaN;
  if (!Number.isFinite(meters) || !Number.isFinite(noaaTime(row.t))) return null;
  return { meters, time: row.t };
}

export function noaaTime(text: string): number {
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(text)) return NaN;
  const at = Date.parse(text.replace(" ", "T") + "Z");
  return Number.isFinite(at) && new Date(at).toISOString().slice(0, 16).replace("T", " ") === text ? at : NaN;
}
export function freshWater(reading: WaterLevelReading | null, now: Date): WaterLevelReading | null {
  if (!reading) return null;
  const age = now.getTime() - noaaTime(reading.time);
  return age >= -300000 && age <= 7200000 ? reading : null;
}

export async function fetchWaterLevel(stationId: string, fetchImpl: typeof fetch = fetch): Promise<WaterLevelReading | null> {
  const res = await fetchImpl(waterLevelUrl(stationId), { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error("NOAA water level unreachable");
  return parseWaterLevel(await res.json());
}

export interface TidePrediction {
  time: Date;
  type: "H" | "L";
  meters: number;
}

interface RawPrediction { t?: string; v?: string; type?: string }
interface RawPredictions { predictions?: RawPrediction[] }

function yyyymmdd(d: Date): string {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** A 48h GMT window starting today -- enough to always hold at least one
 *  future high/low past `now`, whichever hour of the day `now` falls in. */
export function predictionsUrl(stationId: string, now: Date): string {
  stationIdValid(stationId);
  if (!Number.isFinite(now.getTime())) throw new Error("invalid prediction date");
  const begin = yyyymmdd(now);
  const end = yyyymmdd(new Date(now.getTime() + 24 * 3_600_000));
  return `${DATAGETTER_URL}?begin_date=${begin}&end_date=${end}&station=${stationId}&product=predictions&datum=MLLW&units=metric&time_zone=gmt&interval=hilo&format=json&application=cv-siddharth`;
}

export function parsePredictions(json: unknown): TidePrediction[] {
  const list = (json as RawPredictions | null)?.predictions;
  if (!Array.isArray(list)) return [];
  const out: TidePrediction[] = [];
  for (const p of list) {
    if (!p || typeof p !== "object") continue;
    if (typeof p.t !== "string" || typeof p.v !== "string" || (p.type !== "H" && p.type !== "L")) continue;
    const meters = p.v.trim() ? Number(p.v) : NaN;
    if (!Number.isFinite(meters) || !Number.isFinite(noaaTime(p.t))) continue;
    // GMT rows come back "YYYY-MM-DD HH:MM" with no zone suffix -- appending
    // "Z" after swapping the space for "T" is the one string edit needed to
    // make it a real ISO instant.
    out.push({ time: new Date(`${p.t.replace(" ", "T")}Z`), type: p.type, meters });
  }
  return out;
}

export async function fetchPredictions(stationId: string, now: Date, fetchImpl: typeof fetch = fetch): Promise<TidePrediction[]> {
  const res = await fetchImpl(predictionsUrl(stationId, now), { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error("NOAA tide predictions unreachable");
  return parsePredictions(await res.json());
}

/** The soonest high/low strictly after `now`, or null when the fetched
 *  window has none left (a real gap at the edge of the 48h request, not an
 *  error). */
export function nextTide(predictions: TidePrediction[], now: Date): TidePrediction | null {
  let best: TidePrediction | null = null;
  for (const p of predictions) {
    if (p.time.getTime() > now.getTime() && (!best || p.time.getTime() < best.time.getTime())) best = p;
  }
  return best;
}

export interface TideReading {
  water: WaterLevelReading | null;
  next: TidePrediction | null;
  waterFailed?: boolean;
  predictionFailed?: boolean;
}

export async function fetchTide(stationId: string, now: Date, fetchImpl: typeof fetch = fetch): Promise<TideReading> {
  const [water, predictions] = await Promise.allSettled([fetchWaterLevel(stationId, fetchImpl), fetchPredictions(stationId, now, fetchImpl)]);
  return { water: water.status === "fulfilled" ? freshWater(water.value, now) : null, next: predictions.status === "fulfilled" ? nextTide(predictions.value, now) : null, waterFailed: water.status === "rejected", predictionFailed: predictions.status === "rejected" };

}

/** The hover chip's tide row -- says plainly this is US-coastal-only
 *  coverage, sourced, same "absent, not faked" shape as marine/flood's own
 *  labels. */
export function tideLabel(reading: TideReading): string {
  const parts: string[] = [];
  if (reading.water) parts.push(`${reading.water.meters.toFixed(2)} m MLLW, ${reading.water.time} UTC`);
  if (reading.next) parts.push(`next ${reading.next.type === "H" ? "high" : "low"} ${`${reading.next.time.toISOString().slice(0, 16).replace("T", " ")} UTC`}`);
  if (reading.waterFailed) parts.push("water level unreachable");
  if (reading.predictionFailed) parts.push("prediction feed unreachable");
  const body = parts.length ? parts.join(", ") : "no current reading";
  return `${body} · NOAA CO-OPS tides (US coastal)`;
}
