import { afterEach, expect, test, vi } from "vitest";
import { parsePlaces, placeSelection, pointSelection, searchPlaces } from "./exploreApi.ts";
const paris = { lat: 48.8566, lon: 2.3522, name: "Paris", country: "France", type: "city" };
const now = new Date("2026-09-28T12:00:00Z");
afterEach(() => vi.unstubAllGlobals());
test("Photon parser validates coordinates and caps results", () => {
  const feature = { properties: paris, geometry: { coordinates: [paris.lon, paris.lat] } };
  expect(parsePlaces({ features: Array(9).fill(feature) })).toHaveLength(5);
  expect(parsePlaces({ features: [{ geometry: { coordinates: [500, 90] } }, null] })).toEqual([]);
  expect(() => parsePlaces({})).toThrow();
});
test("place selection has attribution, snapshot and distance by type", () => {
  const selection = placeSelection(paris, now);
  expect(selection.live).toBe(false); expect(selection.source).toBe("Photon (OpenStreetMap, ODbL)");
  expect(selection.focus).toEqual({ kind: "latlon", lat: paris.lat, lon: paris.lon, distance: 10 });
  expect(placeSelection({ ...paris, type: "country" }, now).focus).toHaveProperty("distance", 20);
  expect(selection.rows.find(r => r.label === "Local time")?.value).toContain("solar (approx.)");
});
test("search forwards abort signal and encodes the query", async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ features: [] }) }); vi.stubGlobal("fetch", fetcher);
  const controller = new AbortController(); await searchPlaces("Paris & Lyon", controller.signal);
  expect(fetcher).toHaveBeenCalledExactlyOnceWith("https://photon.komoot.io/api/?q=Paris%20%26%20Lyon&limit=5", { signal: controller.signal });
});
test("point lookup makes one weather call and reports timezone, sun and source", async () => {
  const fetcher = vi.fn(async (url: string) => ({ ok: true, json: async () => url.includes("bigdatacloud") ? { city: "Paris", countryName: "France" } : { timezone: "Europe/Paris", current: { time: "2026-09-28T14:00", temperature_2m: 18, weather_code: 0, wind_speed_10m: 9 } } }));
  vi.stubGlobal("fetch", fetcher);
  const result = await pointSelection(paris, now, new AbortController().signal);
  expect(fetcher).toHaveBeenCalledTimes(2); expect(result.title).toBe("Paris");
  expect(result.rows).toContainEqual({ label: "Local time", value: "14:00 (Europe/Paris)" });
  expect(result.rows).toContainEqual({ label: "Sunlight", value: "day" });
  expect(result.rows.find(r => r.label === "Sunrise")?.value).toMatch(/^07:/);
  expect(result.source).toContain("CC BY 4.0");
});
test("failed feeds stay unavailable and simulated time never requests current weather", async () => {
  const fetcher = vi.fn().mockRejectedValue(new Error("offline")); vi.stubGlobal("fetch", fetcher);
  const result = await pointSelection(paris, now, new AbortController().signal);
  expect(result.rows).toContainEqual({ label: "Weather", value: "Unavailable" }); expect(result.live).toBe(false);
  fetcher.mockClear();
  const simulated = await pointSelection(paris, now, new AbortController().signal, true);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(simulated.rows).toContainEqual({ label: "Weather", value: "Unavailable in time travel" });
});
