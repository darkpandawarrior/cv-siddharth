import { describe, expect, test, it, afterEach, vi } from "vitest";
import { Vector3 } from "three";
import { entityPositions, useGlobe } from "../globeStore.ts";
import type { Quake } from "../layers/quake.ts";
import { sunTimes } from "../../../lib/sky.ts";
import type { MapsPlace } from "../../../data/generated/mapsPlaces.ts";
import { biggestQuakeCandidate, chooseCandidate, issCandidate, launchCandidate, mapsPlaceCandidate, sunsetCandidate, surpriseCandidates } from "./surpriseMe.ts";

import { getLiveSignalSnapshot } from "../../../lib/useLiveSignal.ts";
vi.mock("../../../lib/useLiveSignal.ts", () => ({ getLiveSignalSnapshot: vi.fn(() => ({ data: null, error: false, nextPollAt: null })) }));

afterEach(() => {
  vi.mocked(getLiveSignalSnapshot).mockReset();
  vi.mocked(getLiveSignalSnapshot).mockReturnValue({ data: null, error: false, nextPollAt: null });
  entityPositions.clear();
  useGlobe.getState().setTimeOffset(0);
  useGlobe.getState().setStatus("satellites", undefined);
});

describe("issCandidate", () => {
  test("null when SatelliteLayer hasn't registered a position -- never invented", () => {
    expect(issCandidate()).toBeNull();
  });

  test("rejects failed feeds and time travel even if a tracked position remains", () => {
    entityPositions.set("sat:25544", () => new Vector3(6, 0, 0));
    useGlobe.getState().setTimeOffset(-60);
    expect(issCandidate()).toBeNull();
    useGlobe.getState().setTimeOffset(0);
    useGlobe.getState().setStatus("satellites", { state: "failed" });
    expect(issCandidate()).toBeNull();
  });

  test("flies to the entity, not a computed lat/lon, when the ISS is tracked", () => {
    entityPositions.set("sat:25544", () => new Vector3(6, 0, 0));
    const result = issCandidate();
    expect(result?.selection.kind).toBe("satellite");
    expect(result?.selection.focus).toEqual({ kind: "entity", id: "sat:25544" });
    expect(result?.reason).toContain("ISS");
  });
});

describe("launchCandidate", () => {
  const nowMs = 1_700_000_000_000;
  test("null with no storage and null with an empty/expired cache", () => {
    expect(launchCandidate(nowMs, undefined)).toBeNull();
    const empty = { getItem: () => null, setItem: () => {} };
    expect(launchCandidate(nowMs, empty)).toBeNull();
  });

  test("names the next launch's pad and countdown from the cache HazardLayer already wrote", () => {
    const cached = JSON.stringify({
      fetchedAtMs: nowMs,
      launches: [{ id: "l1", name: "Falcon 9 | Starlink", provider: "SpaceX", netMs: nowMs + 3_600_000, padName: "SLC-40", locationName: "Cape Canaveral", lat: 28.5, lon: -80.6, within24h: true }],
    });
    const storage = { getItem: () => cached, setItem: () => {} };
    const result = launchCandidate(nowMs, storage);
    expect(result?.selection.title).toBe("Falcon 9 | Starlink");
    expect(result?.selection.focus).toEqual({ kind: "latlon", lat: 28.5, lon: -80.6 });
    expect(result?.reason).toContain("Cape Canaveral");
  });
});

describe("biggestQuakeCandidate", () => {
  test("null on no quakes", () => {
    expect(biggestQuakeCandidate(null)).toBeNull();
    expect(biggestQuakeCandidate([])).toBeNull();
  });

  test("picks the highest magnitude, not the first in the list", () => {
    const quakes: Quake[] = [
      { id: "a", mag: 3.1, place: "near A", lat: 1, lon: 2, depthKm: 10, timeMs: 0, url: "" },
      { id: "b", mag: 5.7, place: "near B", lat: 3, lon: 4, depthKm: 20, timeMs: 0, url: "" },
    ];
    const result = biggestQuakeCandidate(quakes);
    expect(result?.selection.id).toBe("quake:b");
    expect(result?.selection.focus).toEqual({ kind: "latlon", lat: 3, lon: 4 });
    expect(result?.reason).toContain("M5.7");
  });
});

describe("sunsetCandidate", () => {
  test("is honest that it is computed, not observed", () => {
    const atSunset = sunTimes(new Date("2026-09-29T12:00:00Z"), 19.08, 72.88).sunset;
    const result = sunsetCandidate(atSunset)!;
    expect(result.selection.live).toBe(false);
    expect(result.selection.source).toContain("computed");
    expect(result.reason).toContain("computed");
  });
});

describe("mapsPlaceCandidate", () => {
  const places: MapsPlace[] = [{ slug: "pune-1", city: "Pune", country: "IN", lat: 18.5, lon: 73.9, reviews: 4, photos: 10, photoViews: 100, years: [2022] }];

  test("null on an empty list", () => {
    expect(mapsPlaceCandidate([], () => 0)).toBeNull();
  });

  test("uses the injected rand to pick an index, not Math.random directly", () => {
    const result = mapsPlaceCandidate(places, () => 0.999);
    expect(result?.selection.title).toBe("Pune");
    expect(result?.selection.focus).toEqual({ kind: "latlon", lat: 18.5, lon: 73.9 });
  });
});

describe("chooseCandidate", () => {
  test("null on an empty pool", () => {
    expect(chooseCandidate([])).toBeNull();
  });

  test("the injected rand deterministically selects a slot", () => {
    const pool = [
      { selection: { id: "1", kind: "surprise", title: "one", rows: [], source: "", live: false }, reason: "one" },
      { selection: { id: "2", kind: "surprise", title: "two", rows: [], source: "", live: false }, reason: "two" },
    ];
    expect(chooseCandidate(pool, () => 0)?.reason).toBe("one");
    expect(chooseCandidate(pool, () => 0.999)?.reason).toBe("two");
  });
});


it("reuses only recent loaded quakes and excludes a failed last-good snapshot", () => {
  const now = Date.parse("2026-09-29T12:00:00Z");
  const feature = (id: string, mag: number, time: number) => ({ id, properties: { mag, time, place: id }, geometry: { coordinates: [70, 20, 10] } });
  const data = { features: [feature("recent", 3, now - 1000), feature("old", 9, now - 2 * 86_400_000), feature("future", 10, now + 1000)] };
  vi.mocked(getLiveSignalSnapshot).mockReturnValue({ data, error: false, nextPollAt: null });
  expect(surpriseCandidates(now, undefined).find((candidate) => candidate.selection.id.startsWith("quake:"))?.selection.id).toBe("quake:recent");
  vi.mocked(getLiveSignalSnapshot).mockReturnValue({ data, error: true, nextPollAt: null });
  expect(surpriseCandidates(now, undefined).some((candidate) => candidate.selection.id.startsWith("quake:"))).toBe(false);
});
