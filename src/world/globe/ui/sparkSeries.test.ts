import { describe, expect, it } from "vitest";
import { parseKpSeries, regionQuakeCounts } from "./sparkSeries.ts";

const NOW = Date.parse("2026-09-27T12:00:00Z");

describe("parseKpSeries", () => {
  it("returns null on a malformed feed", () => {
    expect(parseKpSeries(null, NOW)).toBeNull();
    expect(parseKpSeries({}, NOW)).toBeNull();
  });

  it("keeps only rows inside the last N hours, oldest first as given", () => {
    const json = [
      { time_tag: "2026-09-25T00:00:00", Kp: 1 }, // > 24h before NOW, dropped
      { time_tag: "2026-09-27T09:00:00", Kp: 2.33 },
      { time_tag: "2026-09-27T12:00:00", Kp: 3.67 },
    ];
    expect(parseKpSeries(json, NOW, 24)).toEqual([2.33, 3.67]);
  });

  it("returns null when nothing falls in the window", () => {
    const json = [{ time_tag: "2026-09-20T00:00:00", Kp: 1 }];
    expect(parseKpSeries(json, NOW, 24)).toBeNull();
  });

  it("skips malformed rows without throwing", () => {
    const json = [{ time_tag: "2026-09-27T11:00:00" }, { Kp: 2 }, { time_tag: "2026-09-27T11:30:00", Kp: 2.67 }];
    expect(parseKpSeries(json, NOW, 24)).toEqual([2.67]);
  });
});

function usgsFeature(lat: number, lon: number, mag: number, time: number) {
  return { properties: { mag, time }, geometry: { coordinates: [lon, lat, 10] } };
}

describe("regionQuakeCounts", () => {
  const PUNE = { lat: 18.52, lon: 73.86 };

  it("returns null on a malformed feed", () => {
    expect(regionQuakeCounts(null, PUNE.lat, PUNE.lon, NOW)).toBeNull();
    expect(regionQuakeCounts({ features: "nope" }, PUNE.lat, PUNE.lon, NOW)).toBeNull();
  });

  it("bins by day, nearby M4.5+ only, oldest day first", () => {
    const dayMs = 86_400_000;
    const windowStart = NOW - 7 * dayMs;
    const json = {
      features: [
        usgsFeature(PUNE.lat + 0.1, PUNE.lon, 4.6, windowStart + 0.5 * dayMs), // day 0
        usgsFeature(PUNE.lat, PUNE.lon + 0.1, 5.1, windowStart + 0.5 * dayMs), // day 0
        usgsFeature(PUNE.lat, PUNE.lon, 5.0, NOW), // day 6 (today)
        usgsFeature(PUNE.lat, PUNE.lon, 3.9, NOW), // below 4.5, excluded
        usgsFeature(-33, 151, 6.0, NOW), // far away (Sydney), excluded
      ],
    };
    const counts = regionQuakeCounts(json, PUNE.lat, PUNE.lon, NOW);
    expect(counts).toHaveLength(7);
    expect(counts![0]).toBe(2);
    expect(counts![6]).toBe(1);
    expect(counts!.reduce((a, b) => a + b, 0)).toBe(3);
  });

  it("is all zeros, not null, for a real feed with nothing nearby", () => {
    const json = { features: [usgsFeature(-33, 151, 6.0, NOW)] };
    const counts = regionQuakeCounts(json, PUNE.lat, PUNE.lon, NOW);
    expect(counts).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });
});
