// WAVE 9 LANE S3 (Open-Meteo flood layer for the hover readout). Same split
// as marine.ts/airQuality.ts -- see marine.ts's header for the shared
// provider-family/CORS/licence evidence.
//
// Feed: https://flood-api.open-meteo.com/v1/flood (GloFAS river-discharge
// model) -- daily cadence, no `current=` support (curl-confirmed: the API
// only answers `daily`), so this reads today's single row. Ocean and
// no-river cells come back with `river_discharge: null` (curl-confirmed for
// a mid-Pacific coordinate); a dry-but-real riverbed can legitimately read
// `0.0`, which is still real GloFAS data, not "no data".
export const FLOOD_HOST = "https://flood-api.open-meteo.com/v1/flood";

export interface FloodReading {
  riverDischargeM3s: number;
}

interface RawFloodDaily {
  river_discharge?: (number | null)[];
}
interface RawFlood {
  daily?: RawFloodDaily;
}

export function floodUrl(lat: number, lon: number): string {
  return `${FLOOD_HOST}?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&daily=river_discharge&forecast_days=1`;
}

/** `null` on a shape that isn't the real response, an empty `daily` array,
 *  or the cell's own `null` (no GloFAS grid cell there) -- same "absent, not
 *  faked" rule as marine.ts. */
export function parseFlood(json: unknown): FloodReading | null {
  const value = (json as RawFlood | null)?.daily?.river_discharge?.[0];
  if (typeof value !== "number") return null;
  return { riverDischargeM3s: value };
}

export async function fetchFlood(lat: number, lon: number, fetchImpl: typeof fetch = fetch): Promise<FloodReading | null> {
  const res = await fetchImpl(floodUrl(lat, lon));
  if (!res.ok) return null;
  return parseFlood(await res.json());
}

export function floodLabel(reading: FloodReading): string {
  return `${reading.riverDischargeM3s.toFixed(1)} m³/s river discharge`;
}
