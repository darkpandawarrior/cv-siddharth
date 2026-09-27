import { describe, it, expect } from "vitest";
import { deadReckon, clampDeadReckonSec, MAX_DEAD_RECKON_SEC, pushTrail, pruneTrails } from "./aircraftTrack.ts";

describe("deadReckon", () => {
  it("does not move at dt=0", () => {
    const p = deadReckon({ lat: 18.5, lon: 73.8 }, 90, 300, 0);
    expect(p.lat).toBeCloseTo(18.5, 9);
    expect(p.lon).toBeCloseTo(73.8, 9);
  });

  it("advances east along the equator at track 90 by the expected distance", () => {
    // 450 kt for 60s = 7.5 nm = 13.89 km -> at the equator, 1 deg lon ~= 111.19 km.
    const p = deadReckon({ lat: 0, lon: 0 }, 90, 450, 60);
    const expectedDeltaLon = (450 * 1.852 * (60 / 3600)) / 111.195;
    expect(p.lat).toBeCloseTo(0, 3);
    expect(p.lon).toBeCloseTo(expectedDeltaLon, 2);
  });

  it("moves north at track 0", () => {
    const p = deadReckon({ lat: 18.5, lon: 73.8 }, 0, 400, 30);
    expect(p.lat).toBeGreaterThan(18.5);
    expect(p.lon).toBeCloseTo(73.8, 3);
  });
});

describe("clampDeadReckonSec", () => {
  it("clamps to the documented 60s ceiling and never goes negative", () => {
    expect(clampDeadReckonSec(-5)).toBe(0);
    expect(clampDeadReckonSec(45)).toBe(45);
    expect(clampDeadReckonSec(600)).toBe(MAX_DEAD_RECKON_SEC);
  });
});

describe("trail bookkeeping", () => {
  it("caps a callsign's trail to maxLen, oldest dropped first", () => {
    let trails = new Map<string, { lat: number; lon: number }[]>();
    for (let i = 0; i < 6; i++) trails = pushTrail(trails, "AIC864", { lat: i, lon: i }, 4);
    expect(trails.get("AIC864")).toEqual([{ lat: 2, lon: 2 }, { lat: 3, lon: 3 }, { lat: 4, lon: 4 }, { lat: 5, lon: 5 }]);
  });

  it("drops a callsign's trail once it leaves the current poll", () => {
    let trails = new Map<string, { lat: number; lon: number }[]>();
    trails = pushTrail(trails, "GONE123", { lat: 1, lon: 1 });
    trails = pushTrail(trails, "STAY456", { lat: 2, lon: 2 });
    const pruned = pruneTrails(trails, new Set(["STAY456"]));
    expect(pruned.has("GONE123")).toBe(false);
    expect(pruned.has("STAY456")).toBe(true);
  });
});
