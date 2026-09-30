import { afterEach, expect, test, vi } from "vitest";
import { debounce, distanceAndBearing, greatCircle, localDate, localTime, rateLimit } from "./exploreMath.ts";
import { latLonToXyz } from "./geoMath.ts";

afterEach(() => vi.useRealTimers());
test("London to New York distance, nautical miles and initial bearing", () => {
  const trip = distanceAndBearing({ lat: 51.5074, lon: -0.1278 }, { lat: 40.7128, lon: -74.006 });
  expect(trip.km).toBeCloseTo(5570.22, 1); expect(trip.nauticalMiles).toBeCloseTo(3007.68, 1); expect(trip.bearing).toBeCloseTo(288.33, 1);
});
test("Sydney to Tokyo crosses hemispheres with a northerly bearing", () => {
  const trip = distanceAndBearing({ lat: -33.8688, lon: 151.2093 }, { lat: 35.6762, lon: 139.6503 });
  expect(trip.km).toBeGreaterThan(7800); expect(trip.km).toBeLessThan(7830); expect(trip.bearing).toBeCloseTo(350.05, 1);
});
test("dateline uses the shorter arc; coincident and antipodal bearings are undefined", () => {
  expect(distanceAndBearing({ lat: 0, lon: 179 }, { lat: 0, lon: -179 }).km).toBeCloseTo(222.39, 1);
  expect(distanceAndBearing({ lat: 1, lon: 2 }, { lat: 1, lon: 2 })).toEqual({ km: 0, nauticalMiles: 0, bearing: null });
  expect(distanceAndBearing({ lat: 0, lon: 0 }, { lat: 0, lon: 180 }).bearing).toBeNull();
});
test("great-circle vertices stay on the sphere and reach both endpoints", () => {
  for (const end of [{ lat: 30, lon: 45 }, { lat: 0, lon: 180 }, { lat: 0, lon: 0 }]) {
    const line = greatCircle({ lat: 0, lon: 0 }, end, 32), b = latLonToXyz(end.lat, end.lon);
    expect(line[0]).toBeCloseTo(1); expect(line[1]).toBeCloseTo(0); expect(line[2]).toBeCloseTo(0);
    expect(line.at(-3)).toBeCloseTo(b.x); expect(line.at(-2)).toBeCloseTo(b.y); expect(line.at(-1)).toBeCloseTo(b.z);
    for (let i = 0; i < line.length; i += 3) expect(Math.hypot(line[i], line[i + 1], line[i + 2])).toBeCloseTo(1);
  }
});
test("local time uses timezone DST and labels longitude fallback and polar events", () => {
  expect(localTime(new Date("2026-07-01T12:00:00Z"), 2, "Europe/Paris")).toBe("14:00 (Europe/Paris)");
  expect(localTime(new Date("2026-01-01T12:00:00Z"), 2, "Europe/Paris")).toBe("13:00 (Europe/Paris)");
  expect(localTime(new Date("2026-01-01T23:00:00Z"), 90)).toBe("05:00 solar (approx.)");
  expect(localTime(new Date("2026-01-01T12:00:00Z"), -30, "bad zone")).toBe("10:00 solar (approx.)");
  expect(localTime(new Date(NaN), 0)).toContain("polar");
  expect(localDate(new Date("2026-07-01T22:30:00Z"), 2, "Europe/Paris").toISOString()).toBe("2026-07-02T00:00:00.000Z");
  expect(localDate(new Date("2026-07-01T23:00:00Z"), 90, "bad zone").toISOString()).toBe("2026-07-02T00:00:00.000Z");
});
test("debounce cancels superseded work and spaces dispatches by 350ms", () => {
  vi.useFakeTimers(); const run = vi.fn(); const queue = debounce(run);
  queue.schedule("Par"); vi.advanceTimersByTime(349); expect(run).not.toHaveBeenCalled();
  queue.schedule("Paris"); vi.advanceTimersByTime(349); expect(run).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1); expect(run).toHaveBeenCalledExactlyOnceWith("Paris");
  queue.schedule("Berlin"); vi.advanceTimersByTime(349); expect(run).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(1); expect(run).toHaveBeenCalledTimes(2);
  queue.schedule("cancelled"); queue.cancel(); vi.advanceTimersByTime(1000); expect(run).toHaveBeenCalledTimes(2);
});
test("point rate limiter admits one click each second without extending on rejection", () => {
  const allow = rateLimit(1000);
  expect(allow(0)).toBe(true); expect(allow(999)).toBe(false); expect(allow(1000)).toBe(true); expect(allow(1500)).toBe(false); expect(allow(2000)).toBe(true);
});
