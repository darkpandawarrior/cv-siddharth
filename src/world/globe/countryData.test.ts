import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { countryAt, inCountry, parseCountries, pointInRing, type Ring } from "./countryData.ts";
const outer: Ring = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
const index = parseCountries(readFileSync(new URL("../../../public/geo/countries-110m.json", import.meta.url), "utf8"));
test("point-in-polygon handles boundary points and excludes holes", () => {
  expect(pointInRing({ lat: 5, lon: 5 }, outer)).toBe(true);
  expect(pointInRing({ lat: 0, lon: 5 }, outer)).toBe(true);
  expect(pointInRing({ lat: 5, lon: 15 }, outer)).toBe(false);
  const hole: Ring = [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]];
  expect(inCountry({ lat: 5, lon: 5 }, { name: "test", iso: "XX", polygons: [[outer, hole]] })).toBe(false);
});
test("5 degree index finds known cities, islands and both dateline sides", () => {
  for (const [lat, lon, iso] of [[48.8566, 2.3522, "FR"], [18.52, 73.85, "IN"], [40.7128, -74.006, "US"], [-17.8, 178, "FJ"], [-16.25, -179.95, "FJ"], [-16.25, 179.95, "FJ"], [-29.6, 28.3, "LS"]] as const) {
    expect(index.countries[countryAt(index, { lat, lon })]?.iso).toBe(iso);
  }
  expect(countryAt(index, { lat: 0, lon: -140 })).toBe(-1);
  expect(countryAt(index, { lat: NaN, lon: 0 })).toBe(-1);
  expect(countryAt(index, { lat: 91, lon: 0 })).toBe(-1);
});
test("country artifact stays below 250 KB and malformed coordinates are rejected", () => {
  expect(readFileSync(new URL("../../../public/geo/countries-110m.json", import.meta.url)).byteLength).toBeLessThan(250_000);
  expect(index.countries).toHaveLength(177);
  expect(() => parseCountries('[{"name":"x","iso":"X","polygons":[[[[99999,0],[0,0],[0,1],[0,0]]]]}]')).toThrow("Invalid coordinate");
});
