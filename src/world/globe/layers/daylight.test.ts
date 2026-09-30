import { describe, expect, it } from "vitest";
import { subsolarPoint } from "../../../lib/sky.ts";
import {
  GOLDEN_MAX_ALT,
  GOLDEN_MIN_ALT,
  WAKE_END_MIN,
  WAKE_HALF_WIDTH_DEG,
  WAKE_START_MIN,
  altitudeDeg,
  goldenBandWeight,
  isWakingBand,
  localSolarMinutes,
  risingAndSettingCities,
  wakeBandCenterLonDeg,
} from "./daylight.ts";
import type { DaylightCity } from "./daylightCities.ts";

const RAD = Math.PI / 180;

/** Standard spherical "destination given distance and bearing" formula
 *  (test-only fixture helper): guarantees the returned point is EXACTLY
 *  `distDeg` of great-circle angular separation from (lat, lon), so
 *  altitudeDeg of the result is exactly 90 - distDeg by construction --
 *  the cleanest way to put a point at a known altitude without depending
 *  on subLat/subLon's own numeric value. */
function destinationPoint(lat: number, lon: number, bearingDeg: number, distDeg: number): { lat: number; lon: number } {
  const lat1 = lat * RAD, lon1 = lon * RAD, brng = bearingDeg * RAD, d = distDeg * RAD;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng));
  const lon2 = lon1 + Math.atan2(Math.sin(brng) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return { lat: lat2 / RAD, lon: lon2 / RAD };
}

// Two 2026 instants far enough from each other's declination that a broken
// "always use lat 0" or "always use +23.4" shortcut would fail one of them.
const MARCH_EQUINOX_2026 = new Date("2026-03-20T08:46:00Z");
const JUNE_SOLSTICE_2026 = new Date("2026-06-21T02:24:00Z");

describe("subsolarPoint sanity at the two picked instants (2026)", () => {
  it("March equinox: subsolar latitude near the equator", () => {
    expect(Math.abs(subsolarPoint(MARCH_EQUINOX_2026).lat)).toBeLessThan(1);
  });
  it("June solstice: subsolar latitude near the Tropic of Cancer (23.44deg)", () => {
    const lat = subsolarPoint(JUNE_SOLSTICE_2026).lat;
    expect(lat).toBeGreaterThan(22);
    expect(lat).toBeLessThan(24);
  });
});

describe.each([
  ["March equinox 2026", MARCH_EQUINOX_2026],
  ["June solstice 2026", JUNE_SOLSTICE_2026],
])("golden-hour band maths at %s", (_label, now) => {
  const sub = subsolarPoint(now);

  it("altitudeDeg is exact at the subsolar point itself", () => {
    expect(altitudeDeg(now, sub.lat, sub.lon)).toBeCloseTo(90, 6);
  });

  it("altitudeDeg matches the band's own lower/upper bound exactly", () => {
    const atLowerBound = destinationPoint(sub.lat, sub.lon, 90, 90 - GOLDEN_MIN_ALT);
    const atUpperBound = destinationPoint(sub.lat, sub.lon, 90, 90 - GOLDEN_MAX_ALT);
    expect(altitudeDeg(now, atLowerBound.lat, atLowerBound.lon)).toBeCloseTo(GOLDEN_MIN_ALT, 6);
    expect(altitudeDeg(now, atUpperBound.lat, atUpperBound.lon)).toBeCloseTo(GOLDEN_MAX_ALT, 6);
  });

  it("goldenBandWeight is 1 across the plateau and 0 two degrees outside it", () => {
    expect(goldenBandWeight(GOLDEN_MIN_ALT)).toBeCloseTo(1, 6);
    expect(goldenBandWeight(GOLDEN_MAX_ALT)).toBeCloseTo(1, 6);
    expect(goldenBandWeight(GOLDEN_MIN_ALT - 2)).toBeCloseTo(0, 6);
    expect(goldenBandWeight(GOLDEN_MAX_ALT + 2)).toBeCloseTo(0, 6);
    expect(goldenBandWeight(0)).toBe(1);
  });

  it("break-it: a point well past the terminator (altitude -20deg, deep night) sits outside the band", () => {
    const deepNight = destinationPoint(sub.lat, sub.lon, 45, 110);
    expect(goldenBandWeight(altitudeDeg(now, deepNight.lat, deepNight.lon))).toBe(0);
  });
});

describe.each([
  ["March equinox 2026", MARCH_EQUINOX_2026],
  ["June solstice 2026", JUNE_SOLSTICE_2026],
])("waking-band longitude maths at %s", (_label, now) => {
  it("local solar time at the subsolar longitude is exactly noon (720min)", () => {
    const subLon = subsolarPoint(now).lon;
    expect(localSolarMinutes(now, subLon)).toBeCloseTo(720, 6);
  });

  it("the band centre reads as 07:30 local solar time", () => {
    const center = wakeBandCenterLonDeg(now);
    const minutes = localSolarMinutes(now, center);
    expect(minutes).toBeCloseTo((WAKE_START_MIN + WAKE_END_MIN) / 2, 6);
    expect(isWakingBand(minutes)).toBe(true);
  });

  it("the band's edges land exactly on 06:00 and 09:00", () => {
    const center = wakeBandCenterLonDeg(now);
    const westEdge = localSolarMinutes(now, center - WAKE_HALF_WIDTH_DEG);
    const eastEdge = localSolarMinutes(now, center + WAKE_HALF_WIDTH_DEG);
    expect(westEdge).toBeCloseTo(WAKE_START_MIN, 6);
    expect(eastEdge).toBeCloseTo(WAKE_END_MIN, 6);
  });

  it("break-it: noon's longitude is never inside the waking band", () => {
    const subLon = subsolarPoint(now).lon;
    expect(isWakingBand(localSolarMinutes(now, subLon))).toBe(false);
  });
});

describe("risingAndSettingCities", () => {
  const now = MARCH_EQUINOX_2026;
  const sub = subsolarPoint(now);

  function cityAt(name: string, bearingDeg: number, distDeg: number): DaylightCity {
    const p = destinationPoint(sub.lat, sub.lon, bearingDeg, distDeg);
    return { name, lat: p.lat, lon: p.lon, pop: 1 };
  }

  it("classifies a city west of the subsolar point as rising, east as setting", () => {
    const west = cityAt("West Dawn", 270, 94); // -4deg altitude, morning side
    const east = cityAt("East Dusk", 90, 94); // -4deg altitude, evening side
    const { rising, setting } = risingAndSettingCities(now, [west, east]);
    expect(rising.map((r) => r.city.name)).toEqual(["West Dawn"]);
    expect(setting.map((r) => r.city.name)).toEqual(["East Dusk"]);
  });

  it("orders each group by closeness to the horizon and caps at max", () => {
    const near = cityAt("Near Horizon", 270, 91); // altitude -1
    const far = cityAt("Far Horizon", 270, 97); // altitude -7
    const { rising } = risingAndSettingCities(now, [far, near], 5);
    expect(rising.map((r) => r.city.name)).toEqual(["Near Horizon", "Far Horizon"]);
  });

  it("drops cities well outside the readout's horizon band", () => {
    const noon = cityAt("High Noon", 270, 0); // altitude 90, nowhere near a terminator
    const { rising, setting } = risingAndSettingCities(now, [noon]);
    expect(rising).toHaveLength(0);
    expect(setting).toHaveLength(0);
  });

  it("break-it: raising max above the pool size never invents extra cities", () => {
    const west = cityAt("Solo Dawn", 270, 94);
    const { rising } = risingAndSettingCities(now, [west], 5);
    expect(rising).toHaveLength(1);
  });
});
