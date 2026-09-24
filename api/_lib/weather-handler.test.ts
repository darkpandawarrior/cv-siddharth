import { describe, it, expect, vi } from "vitest";
import { getWeather, handleWeather } from "./weather-handler";

const FORECAST_SAMPLE = {
  current: {
    time: "2026-09-24T03:30",
    interval: 900,
    temperature_2m: 22.9,
    relative_humidity_2m: 94,
    precipitation: 0,
    weather_code: 3,
    cloud_cover: 95,
    wind_speed_10m: 10,
    wind_direction_10m: 270,
    visibility: 11420,
  },
  hourly: { precipitation: [0, 0, 0, 0.2, 0.1, 0] },
  daily: { precipitation_sum: Array.from({ length: 30 }, () => 4.67) },
};

const AIR_SAMPLE = {
  current: { time: "2026-09-24T03:30", pm2_5: 29.2, pm10: 40, us_aqi: 77, european_aqi: 50, aerosol_optical_depth: 0.7 },
};

// 7 past days (min 32.27, max 99.46) + today + 2 ahead ([73.64, 78.98, 54.46]).
const FLOOD_SAMPLE = {
  daily: {
    time: ["09-17", "09-18", "09-19", "09-20", "09-21", "09-22", "09-23", "09-24", "09-25", "09-26"],
    river_discharge: [32.27, 55, 60, 70, 80, 90, 99.46, 73.64, 78.98, 54.46],
  },
};

/** Routes a fake fetch by upstream host, so each of the 3 real calls can be
 *  independently made to succeed, 500, or reject (timeout). */
function routedFetch(opts: {
  forecast?: unknown | "fail" | "timeout";
  air?: unknown | "fail" | "timeout";
  flood?: unknown | "fail" | "timeout";
}) {
  return vi.fn(async (url: string) => {
    const pick = url.includes("air-quality-api") ? opts.air : url.includes("flood-api") ? opts.flood : opts.forecast;
    if (pick === "timeout") throw new Error("The operation was aborted");
    if (pick === "fail" || pick === undefined) return new Response(null, { status: 500 });
    return new Response(JSON.stringify(pick), { status: 200 });
  });
}

describe("getWeather", () => {
  it("normalizes all three upstreams and converts precipitation to precipMmH", async () => {
    const result = await getWeather(
      {},
      routedFetch({ forecast: FORECAST_SAMPLE, air: AIR_SAMPLE, flood: FLOOD_SAMPLE }) as unknown as typeof fetch,
    );
    expect(result.connected).toBe(true);
    expect(result.weather).toMatchObject({ tempC: 22.9, humidityPct: 94, visibilityM: 11420, precipMmH: 0 });
    expect(result.air).toEqual({ at: "2026-09-24T03:30", pm25: 29.2, pm10: 40, usAqi: 77, euAqi: 50, aod: 0.7 });
    expect(result.river).toEqual({ date: "09-24", dischargeM3s: 73.64, next: [78.98, 54.46], range7d: [32.27, 99.46] });
    expect(result.season).toEqual({ days: 30, sumMm: 30 * 4.67 });
    expect(result.rain6hMm).toBeCloseTo(0.3, 5);
    expect(result.attribution).toHaveLength(3);
  });

  it("converts interval 900 + precipitation 0.6 to precipMmH 2.4", async () => {
    const wet = { ...FORECAST_SAMPLE, current: { ...FORECAST_SAMPLE.current, precipitation: 0.6, interval: 900 } };
    const result = await getWeather({}, routedFetch({ forecast: wet, air: AIR_SAMPLE, flood: FLOOD_SAMPLE }) as unknown as typeof fetch);
    expect(result.weather?.precipMmH).toBeCloseTo(2.4, 5);
  });

  it("air 500 leaves air null while weather and river stay present", async () => {
    const result = await getWeather(
      {},
      routedFetch({ forecast: FORECAST_SAMPLE, air: "fail", flood: FLOOD_SAMPLE }) as unknown as typeof fetch,
    );
    expect(result.connected).toBe(true);
    expect(result.air).toBeNull();
    expect(result.weather).not.toBeNull();
    expect(result.river).not.toBeNull();
  });

  it("all three upstreams 500 degrades to connected:false with every block null", async () => {
    const result = await getWeather({}, routedFetch({ forecast: "fail", air: "fail", flood: "fail" }) as unknown as typeof fetch);
    expect(result).toEqual({
      connected: false,
      weather: null,
      air: null,
      river: null,
      season: null,
      rain6hMm: null,
      attribution: result.attribution,
    });
    expect(result.attribution).toHaveLength(3);
  });

  it("a timeout on every upstream degrades the same way as a 500, never throwing", async () => {
    const result = await getWeather(
      {},
      routedFetch({ forecast: "timeout", air: "timeout", flood: "timeout" }) as unknown as typeof fetch,
    );
    expect(result.connected).toBe(false);
    expect(result.weather).toBeNull();
  });

  it("calls the exact three documented upstream URLs, with AbortSignal.timeout and no '@' in any header", async () => {
    const fetchImpl = routedFetch({ forecast: FORECAST_SAMPLE, air: AIR_SAMPLE, flood: FLOOD_SAMPLE });
    await getWeather({}, fetchImpl as unknown as typeof fetch);
    const calls = fetchImpl.mock.calls as unknown as [string, RequestInit][];
    expect(calls).toHaveLength(3);
    const urls = calls.map(([url]) => url);
    expect(urls).toContain(
      "https://api.open-meteo.com/v1/forecast?latitude=18.52&longitude=73.86" +
        "&current=temperature_2m,relative_humidity_2m,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,visibility" +
        "&hourly=precipitation&past_hours=6&daily=precipitation_sum&past_days=30&timezone=Asia%2FKolkata",
    );
    expect(urls).toContain(
      "https://air-quality-api.open-meteo.com/v1/air-quality?latitude=18.52&longitude=73.86" +
        "&current=pm2_5,pm10,us_aqi,european_aqi,aerosol_optical_depth&timezone=Asia%2FKolkata",
    );
    expect(urls).toContain(
      "https://flood-api.open-meteo.com/v1/flood?latitude=18.53&longitude=73.87&daily=river_discharge&past_days=7&forecast_days=3",
    );
    for (const [, init] of calls) {
      expect(init.signal).toBeInstanceOf(AbortSignal);
      for (const value of Object.values(init.headers as Record<string, string>)) {
        expect(value).not.toContain("@");
      }
    }
  });
});

describe("handleWeather", () => {
  it("responds 200 even when every upstream is down", async () => {
    global.fetch = vi.fn(async () => new Response(null, { status: 500 })) as unknown as typeof fetch;
    const response = await handleWeather(new Request("http://localhost/api/weather"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ connected: false, weather: null });
  });

  it("sets the 15-minute edge cache header", async () => {
    global.fetch = routedFetch({ forecast: FORECAST_SAMPLE, air: AIR_SAMPLE, flood: FLOOD_SAMPLE }) as unknown as typeof fetch;
    const response = await handleWeather(new Request("http://localhost/api/weather"));
    expect(response.headers.get("cache-control")).toBe("public, max-age=0, s-maxage=900, stale-while-revalidate=3600");
  });
});
