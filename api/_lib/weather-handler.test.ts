import { describe, it, expect, vi } from "vitest";
import { getWeather, handleWeather } from "./weather-handler";

const SAMPLE = {
  current: {
    time: "2026-09-24T03:15",
    temperature_2m: 22.9,
    weather_code: 3,
    cloud_cover: 97,
    precipitation: 0,
    wind_speed_10m: 10.3,
    wind_direction_10m: 263,
  },
};

function fakeFetch(body: unknown, status = 200) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status }));
}

describe("getWeather", () => {
  it("normalizes the live Open-Meteo sample verified on 2026-09-24", async () => {
    const result = await getWeather({}, fakeFetch(SAMPLE) as unknown as typeof fetch);
    expect(result.connected).toBe(true);
    expect(result.source).toBe("Open-Meteo (CC BY 4.0)");
    expect(result.sourceUrl).toBe("https://open-meteo.com");
    expect(result.weather).toEqual({
      at: "2026-09-24T03:15",
      tempC: 22.9,
      code: 3,
      cloudPct: 97,
      precipMm: 0,
      windKmh: 10.3,
      windFromDeg: 263,
    });
  });

  it("calls the documented city-level Pune endpoint with no key", async () => {
    const fetchImpl = fakeFetch(SAMPLE);
    await getWeather({}, fetchImpl as unknown as typeof fetch);
    const [url] = fetchImpl.mock.calls[0] as unknown as [string];
    expect(url).toContain("api.open-meteo.com/v1/forecast");
    expect(url).toContain("latitude=18.52&longitude=73.86");
    expect(url).toContain("current=temperature_2m,weather_code,cloud_cover,precipitation,wind_speed_10m,wind_direction_10m");
    expect(url).not.toContain("appid=");
    expect(url).not.toContain("key=");
  });

  it("degrades to connected:false on an upstream 500, never throwing", async () => {
    const result = await getWeather({}, fakeFetch({}, 500) as unknown as typeof fetch);
    expect(result).toEqual({ connected: false, weather: null, source: "Open-Meteo (CC BY 4.0)", sourceUrl: "https://open-meteo.com" });
  });

  it("degrades to connected:false on a timeout (a rejected fetch)", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("timed out");
    });
    const result = await getWeather({}, fetchImpl as unknown as typeof fetch);
    expect(result).toEqual({ connected: false, weather: null, source: "Open-Meteo (CC BY 4.0)", sourceUrl: "https://open-meteo.com" });
  });

  it("degrades to connected:false when the body has no current block", async () => {
    const result = await getWeather({}, fakeFetch({}) as unknown as typeof fetch);
    expect(result.connected).toBe(false);
    expect(result.weather).toBeNull();
  });
});

describe("handleWeather", () => {
  it("responds 200 even when the upstream is down", async () => {
    global.fetch = vi.fn(async () => new Response(null, { status: 500 })) as unknown as typeof fetch;
    const response = await handleWeather(new Request("http://localhost/api/weather"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ connected: false, weather: null });
  });

  it("sets the 15-minute edge cache header", async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify(SAMPLE), { status: 200 })) as unknown as typeof fetch;
    const response = await handleWeather(new Request("http://localhost/api/weather"));
    expect(response.headers.get("cache-control")).toBe("public, max-age=0, s-maxage=900, stale-while-revalidate=3600");
  });
});
