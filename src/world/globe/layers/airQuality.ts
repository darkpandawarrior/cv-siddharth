// WAVE 9 LANE S3 (Open-Meteo air-quality layer for the hover readout). Same
// split as marine.ts/flood.ts -- see marine.ts's header for the shared
// provider-family/CORS/licence evidence.
//
// Feed: https://air-quality-api.open-meteo.com/v1/air-quality (CAMS global
// model) -- unlike marine/flood this answers everywhere, land or sea
// (curl-confirmed for a mid-Pacific coordinate), so this is the one row the
// hover chip can show at any point once the fetch settles.
export const AIR_QUALITY_HOST = "https://air-quality-api.open-meteo.com/v1/air-quality";

export interface AirQualityReading {
  usAqi: number;
  europeanAqi: number;
  pm25: number;
}

interface RawAirQualityCurrent {
  us_aqi?: number | null;
  european_aqi?: number | null;
  pm2_5?: number | null;
}
interface RawAirQuality {
  current?: RawAirQualityCurrent;
}

export function airQualityUrl(lat: number, lon: number): string {
  return `${AIR_QUALITY_HOST}?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&current=pm2_5,us_aqi,european_aqi`;
}

/** `null` on a shape that isn't the real response, or a reading CAMS itself
 *  didn't fill in for this cell -- same "absent, not faked" rule as marine.ts. */
export function parseAirQuality(json: unknown): AirQualityReading | null {
  const c = (json as RawAirQuality | null)?.current;
  if (!c || typeof c.us_aqi !== "number" || typeof c.european_aqi !== "number" || typeof c.pm2_5 !== "number") return null;
  return { usAqi: c.us_aqi, europeanAqi: c.european_aqi, pm25: c.pm2_5 };
}

export async function fetchAirQuality(lat: number, lon: number, fetchImpl: typeof fetch = fetch): Promise<AirQualityReading | null> {
  const res = await fetchImpl(airQualityUrl(lat, lon));
  if (!res.ok) return null;
  return parseAirQuality(await res.json());
}

export function airQualityLabel(reading: AirQualityReading): string {
  return `AQI ${reading.usAqi} US / ${reading.europeanAqi} EU · PM2.5 ${reading.pm25.toFixed(0)} µg/m³`;
}
