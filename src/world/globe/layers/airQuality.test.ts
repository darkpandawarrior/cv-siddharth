import { describe, expect, it, vi } from "vitest";
import { airQualityLabel, airQualityUrl, fetchAirQuality, parseAirQuality } from "./airQuality.ts";

describe("airQualityUrl", () => {
  it("builds the current-reading request for a lat/lon", () => {
    expect(airQualityUrl(18.95, 72.6)).toBe(
      "https://air-quality-api.open-meteo.com/v1/air-quality?latitude=18.950&longitude=72.600&current=pm2_5,us_aqi,european_aqi",
    );
  });
});

describe("parseAirQuality", () => {
  it("reads a current reading, coastal or inland alike", () => {
    const json = { current: { pm2_5: 34.7, us_aqi: 89, european_aqi: 51 } };
    expect(parseAirQuality(json)).toEqual({ usAqi: 89, europeanAqi: 51, pm25: 34.7 });
  });

  it("returns null for a shape that isn't the real response", () => {
    expect(parseAirQuality(null)).toBeNull();
    expect(parseAirQuality({})).toBeNull();
    expect(parseAirQuality({ current: { us_aqi: null, european_aqi: null, pm2_5: null } })).toBeNull();
  });
});

describe("airQualityLabel", () => {
  it("formats both AQI scales and PM2.5", () => {
    expect(airQualityLabel({ usAqi: 89, europeanAqi: 51, pm25: 34.7 })).toBe("AQI 89 US / 51 EU · PM2.5 35 µg/m³");
  });
});

describe("fetchAirQuality", () => {
  it("fetches, parses and returns a reading", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ current: { pm2_5: 5.2, us_aqi: 21, european_aqi: 20 } }), { status: 200 }));
    const reading = await fetchAirQuality(0, -140, fetchImpl as unknown as typeof fetch);
    expect(reading).toEqual({ usAqi: 21, europeanAqi: 20, pm25: 5.2 });
    expect(fetchImpl).toHaveBeenCalledWith(airQualityUrl(0, -140));
  });

  it("returns null on a non-ok response instead of throwing", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 500 }));
    expect(await fetchAirQuality(0, -140, fetchImpl as unknown as typeof fetch)).toBeNull();
  });
});
