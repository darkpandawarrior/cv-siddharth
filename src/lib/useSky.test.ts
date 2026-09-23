import { describe, it, expect } from "vitest";
import { classifyWeather, computeSkyState, type WeatherEnvelope } from "./useSky";
import type { Weather } from "./sky";

// ponytail: @testing-library/react isn't a devDependency (same note as
// useLiveSignal.test.ts), so useNow/useWeather/useSky's pure combinators —
// classifyWeather and computeSkyState — are tested directly rather than via
// renderHook. Both hooks are thin wrappers over these with no branching of
// their own.

describe("classifyWeather", () => {
  const sample: Weather = { at: "2026-09-24T03:15", tempC: 22.9, code: 3, cloudPct: 97, precipMm: 0, windKmh: 10.3, windFromDeg: 263 };

  it("is pending before the first fetch resolves", () => {
    expect(classifyWeather(null, false)).toEqual({ weather: null, state: "pending" });
  });

  it("is live with the reading once connected", () => {
    const data: WeatherEnvelope = { connected: true, weather: sample };
    expect(classifyWeather(data, false)).toEqual({ weather: sample, state: "live" });
  });

  it("is unavailable, with no stale reading, on a fetch error", () => {
    // Even if a stale reading were still cached from a prior successful
    // fetch, `error: true` must win — no weatherFallback.ts, ever.
    const stale: WeatherEnvelope = { connected: true, weather: sample };
    expect(classifyWeather(stale, true)).toEqual({ weather: null, state: "unavailable" });
  });

  it("is unavailable when the upstream itself reported disconnected", () => {
    const data: WeatherEnvelope = { connected: false, weather: null };
    expect(classifyWeather(data, false)).toEqual({ weather: null, state: "unavailable" });
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
    const weather: Weather = { at: "now", tempC: 20, code: 1, cloudPct: 10, precipMm: 0, windKmh: 5, windFromDeg: 90 };
    const previewAt = new Date("2026-09-24T18:30:00+05:30");
    const s = computeSkyState(now, weather, previewAt);
    expect(s?.weather).toEqual(weather);
    expect(s?.preview).toBe(true);
  });
});
