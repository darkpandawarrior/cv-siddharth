import { describe, expect, it, vi } from "vitest";
import {
  loadStations,
  freshWater,
  noaaTime,
  fetchPredictions,
  fetchTide,
  fetchWaterLevel,
  nearestStationWithin,
  nextTide,
  parsePredictions,
  parseStations,
  parseWaterLevel,
  predictionsUrl,
  tideLabel,
  waterLevelUrl,
  type TideStation,
} from "./tides.ts";

describe("parseStations", () => {
  it("keeps only rows with a full id/name/lat/lng shape", () => {
    const json = { stations: [{ id: "8518750", name: "The Battery, NY", lat: 40.7, lng: -74.01 }, { id: "bad" }] };
    expect(parseStations(json)).toEqual([{ id: "8518750", name: "The Battery, NY", lat: 40.7, lon: -74.01 }]);
  });

  it("returns an empty list for a shape that isn't the real response", () => {
    expect(parseStations(null)).toEqual([]);
    expect(parseStations({})).toEqual([]);
  });
});

describe("nearestStationWithin", () => {
  const stations: TideStation[] = [
    { id: "near", name: "Near", lat: 40.71, lon: -74.0 },
    { id: "far", name: "Far", lat: 51.5, lon: -0.1 },
  ];

  it("picks the closest station inside the radius", () => {
    const result = nearestStationWithin(stations, { lat: 40.7, lon: -74.01 });
    expect(result?.station.id).toBe("near");
  });

  it("returns null when nothing is within range", () => {
    expect(nearestStationWithin(stations, { lat: 18.95, lon: 72.6 })).toBeNull();
  });
});

describe("parseWaterLevel", () => {
  it("reads the single latest row", () => {
    expect(parseWaterLevel({ data: [{ t: "2026-09-30 12:06", v: "1.234" }] })).toEqual({ meters: 1.234, time: "2026-09-30 12:06" });
  });

  it("returns null for a missing or malformed row", () => {
    expect(parseWaterLevel(null)).toBeNull();
    expect(parseWaterLevel({ data: [] })).toBeNull();
    expect(parseWaterLevel({ data: [{ t: "x" }] })).toBeNull();
  });
});

describe("waterLevelUrl", () => {
  it("builds the latest-reading request for a station", () => {
    expect(waterLevelUrl("8518750")).toBe(
      "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?date=latest&station=8518750&product=water_level&datum=MLLW&units=metric&time_zone=gmt&format=json&application=cv-siddharth",
    );
  });
});

describe("predictionsUrl", () => {
  it("spans a 48h GMT window from the given instant", () => {
    expect(predictionsUrl("8518750", new Date("2026-09-30T12:00:00Z"))).toBe(
      "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?begin_date=20260930&end_date=20261001&station=8518750&product=predictions&datum=MLLW&units=metric&time_zone=gmt&interval=hilo&format=json&application=cv-siddharth",
    );
  });
});

describe("parsePredictions and nextTide", () => {
  const json = {
    predictions: [
      { t: "2026-09-30 08:00", v: "1.1", type: "H" },
      { t: "2026-09-30 14:00", v: "0.2", type: "L" },
      { t: "2026-09-30 20:00", v: "1.3", type: "H" },
    ],
  };

  it("parses every hi/lo row as a GMT instant", () => {
    const preds = parsePredictions(json);
    expect(preds).toHaveLength(3);
    expect(preds[0]).toEqual({ time: new Date("2026-09-30T08:00:00Z"), type: "H", meters: 1.1 });
  });

  it("picks the soonest prediction strictly after now", () => {
    const preds = parsePredictions(json);
    expect(nextTide(preds, new Date("2026-09-30T09:00:00Z"))?.time).toEqual(new Date("2026-09-30T14:00:00Z"));
  });

  it("returns null once every prediction is in the past", () => {
    const preds = parsePredictions(json);
    expect(nextTide(preds, new Date("2026-09-30T23:00:00Z"))).toBeNull();
  });
});

describe("tideLabel", () => {
  it("names both the current level and the next tide, sourced and scoped to US coastal", () => {
    const label = tideLabel({ water: { meters: 1.23, time: "2026-09-30 12:00" }, next: { time: new Date("2026-09-30T14:00:00Z"), type: "L", meters: 0.2 } });
    expect(label).toContain("1.23 m MLLW");
    expect(label).toContain("next low");
    expect(label).toContain("NOAA CO-OPS tides (US coastal)");
  });

  it("says plainly when there is no current reading", () => {
    expect(tideLabel({ water: null, next: null })).toBe("no current reading · NOAA CO-OPS tides (US coastal)");
  });
});

describe("fetchWaterLevel / fetchPredictions / fetchTide", () => {
  it("fetches and combines both, calling the right URLs", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes("product=water_level")) return new Response(JSON.stringify({ data: [{ t: "2026-09-30 12:00", v: "1.0" }] }), { status: 200 });
      return new Response(JSON.stringify({ predictions: [{ t: "2026-09-30 20:00", v: "1.3", type: "H" }] }), { status: 200 });
    });
    const reading = await fetchTide("8518750", new Date("2026-09-30T12:00:00Z"), fetchImpl as unknown as typeof fetch);
    expect(reading.water).toEqual({ meters: 1.0, time: "2026-09-30 12:00" });
    expect(reading.next?.type).toBe("H");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("rejects unavailable upstreams so callers can report failure", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 500 }));
    await expect(fetchWaterLevel("8518750", fetchImpl as unknown as typeof fetch)).rejects.toThrow();
    await expect(fetchPredictions("8518750", new Date(), fetchImpl as unknown as typeof fetch)).rejects.toThrow();
  });
});

it("validates coordinate ranges, station IDs, UTC dates and reading freshness", () => {
  expect(parseStations({ stations: [null, { id: "8518750", name: "A", lat: Infinity, lng: 2 }, { id: "8518750", name: "A", lat: 1, lng: 181 }] })).toEqual([]);
  expect(() => waterLevelUrl("8518750&product=other")).toThrow();
  expect(Number.isNaN(noaaTime("2026-02-30 12:00"))).toBe(true);
  expect(parsePredictions({ predictions: [{ t: "not a date", v: "1", type: "H" }] })).toEqual([]);
  expect(freshWater({ meters: 1, time: "2026-09-30 00:00" }, new Date("2026-09-30T03:00:00Z"))).toBeNull();
});
it("retries a failed station-index HTTP response instead of caching an empty list", async () => {
  const get = vi.fn().mockResolvedValueOnce(new Response(null, { status: 503 })).mockResolvedValueOnce(Response.json({ stations: [{ id: "8518750", name: "Battery", lat: 40.7, lng: -74 }] }));
  await expect(loadStations(get)).rejects.toThrow();
  expect(await loadStations(get)).toHaveLength(1);
  expect(get).toHaveBeenCalledTimes(2);
});
