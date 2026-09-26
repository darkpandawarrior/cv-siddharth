import { describe, it, expect, vi } from "vitest";
import { classifyWeather, computeSkyState, type WeatherEnvelope } from "./useSky";
import { subscribeLiveSignal } from "./useLiveSignal";
import type { Weather } from "./sky";

// ponytail: @testing-library/react isn't a devDependency (same note as
// useLiveSignal.test.ts), so useNow/useWeather/useSky's pure combinators —
// classifyWeather and computeSkyState — are tested directly rather than via
// renderHook. Both hooks are thin wrappers over these with no branching of
// their own.

const SAMPLE: Weather = {
  at: "2026-09-24T03:15",
  intervalSec: 900,
  tempC: 22.9,
  code: 3,
  cloudPct: 97,
  precipMmH: 0,
  windKmh: 10.3,
  windFromDeg: 263,
  humidityPct: 94,
  visibilityM: 11420,
};

describe("classifyWeather", () => {
  const connected: WeatherEnvelope = { connected: true, weather: SAMPLE, air: null, river: null, season: null, rain6hMm: null };

  it("is pending before the first fetch resolves", () => {
    expect(classifyWeather(null, false)).toEqual({
      weather: null, air: null, river: null, season: null, rain6hMm: null, state: "pending",
    });
  });

  it("is live with the reading once connected", () => {
    expect(classifyWeather(connected, false)).toEqual({
      weather: SAMPLE, air: null, river: null, season: null, rain6hMm: null, state: "live",
    });
  });

  it("is unavailable, with no stale reading, on a fetch error", () => {
    // Even if a stale reading were still cached from a prior successful
    // fetch, `error: true` must win — no weatherFallback.ts, ever.
    expect(classifyWeather(connected, true)).toEqual({
      weather: null, air: null, river: null, season: null, rain6hMm: null, state: "unavailable",
    });
  });

  it("is unavailable when the upstream itself reported disconnected", () => {
    const data: WeatherEnvelope = { connected: false, weather: null, air: null, river: null, season: null, rain6hMm: null };
    expect(classifyWeather(data, false)).toEqual({
      weather: null, air: null, river: null, season: null, rain6hMm: null, state: "unavailable",
    });
  });

  it("on weather-noair: air is null while weather stays non-null", () => {
    const noAir: WeatherEnvelope = { connected: true, weather: SAMPLE, air: null, river: null, season: null, rain6hMm: null };
    const result = classifyWeather(noAir, false);
    expect(result.air).toBeNull();
    expect(result.weather).not.toBeNull();
  });
});

describe("computeSkyState", () => {
  const now = new Date("2026-09-24T12:27:00+05:30");

  it("is null before now is mounted", () => {
    expect(computeSkyState(null, null)).toBeNull();
  });

  it("computes off the real clock when no preview is set", () => {
    const s = computeSkyState(now, null);
    expect(s).not.toBeNull();
    expect(s?.preview).toBe(false);
    expect(s?.now).toEqual(now);
    expect(s?.daypart).toBe("day");
  });

  it("substitutes the preview clock and marks preview:true, independent of now", () => {
    const previewAt = new Date("2026-09-24T03:15:00+05:30");
    const s = computeSkyState(now, null, previewAt);
    expect(s?.preview).toBe(true);
    expect(s?.now).toEqual(previewAt);
    expect(s?.daypart).toBe("night");
  });

  it("keeps live weather during preview — only the clock is simulated", () => {
    const previewAt = new Date("2026-09-24T18:30:00+05:30");
    const s = computeSkyState(now, SAMPLE, previewAt);
    expect(s?.weather).toEqual(SAMPLE);
    expect(s?.preview).toBe(true);
  });
});

// useWeather() is `useLiveSignal("/api/weather", WEATHER_INTERVAL_MS)` plus a
// pure classifier with no branching of its own — the "one fetch per URL no
// matter how many mounted callers" contract it inherits is exercised here at
// the same non-React primitive level useLiveSignal.test.ts already covers,
// standing in for the footer + two other consumers all calling useWeather().
describe("useWeather's shared poll", () => {
  it("costs exactly one fetch of /api/weather per interval across three consumers", async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ connected: true }), { status: 200 }));
      const footer = subscribeLiveSignal("/api/weather-usesky-test", 900_000, vi.fn(), fetchImpl as unknown as typeof fetch);
      const pulse = subscribeLiveSignal("/api/weather-usesky-test", 900_000, vi.fn(), fetchImpl as unknown as typeof fetch);
      const studioRig = subscribeLiveSignal("/api/weather-usesky-test", 900_000, vi.fn(), fetchImpl as unknown as typeof fetch);

      await vi.advanceTimersByTimeAsync(0);
      expect(fetchImpl).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(900_000);
      expect(fetchImpl).toHaveBeenCalledTimes(2);

      footer();
      pulse();
      studioRig();
    } finally {
      vi.useRealTimers();
    }
  });
});
