import { describe, expect, it } from "vitest";
import { AircraftTrailBuffer, AircraftTrails, trailCapacityForTier } from "./aircraftTrail.ts";

describe("AircraftTrailBuffer", () => {
  it("drops its oldest sample at capacity", () => {
    const buf = new AircraftTrailBuffer(3);
    buf.push(0, 0, 0, 0);
    buf.push(1, 0, 0, 1);
    buf.push(2, 0, 0, 2);
    expect(buf.count).toBe(3);
    expect(buf.oldest()!.t).toBe(0);

    buf.push(3, 0, 0, 3); // over capacity: the t=0 sample must go
    expect(buf.count).toBe(3);
    expect(buf.oldest()!.t).toBe(1);
    expect(buf.newest()!.t).toBe(3);

    buf.push(4, 0, 0, 4);
    expect(buf.oldest()!.t).toBe(2);
    expect(buf.newest()!.t).toBe(4);
  });

  it("keeps every sample below capacity, oldest to newest", () => {
    const buf = new AircraftTrailBuffer(5);
    buf.push(10, 0, 0, 100);
    buf.push(11, 0, 0, 101);
    expect(buf.count).toBe(2);
    expect(buf.sampleAt(0)).toEqual({ x: 10, y: 0, z: 0, t: 100 });
    expect(buf.sampleAt(1)).toEqual({ x: 11, y: 0, z: 0, t: 101 });
  });

  it("a zero-capacity buffer (T3: no trail) accepts pushes as no-ops", () => {
    const buf = new AircraftTrailBuffer(0);
    buf.push(1, 2, 3, 4);
    expect(buf.count).toBe(0);
    expect(buf.oldest()).toBeNull();
  });

  it("sampleAt throws past the current count, not past capacity", () => {
    const buf = new AircraftTrailBuffer(4);
    buf.push(0, 0, 0, 0);
    expect(() => buf.sampleAt(1)).toThrow(RangeError);
  });
});

describe("trailCapacityForTier", () => {
  it("T1=32, T2=10, T3=0", () => {
    expect(trailCapacityForTier(1)).toBe(32);
    expect(trailCapacityForTier(2)).toBe(10);
    expect(trailCapacityForTier(3)).toBe(0);
  });
});

describe("AircraftTrails (per-callsign manager)", () => {
  it("creates a buffer per callsign lazily and lets it drop its oldest sample", () => {
    const trails = new AircraftTrails(2);
    trails.sample("IGO6140", 0, 0, 0, 0);
    trails.sample("IGO6140", 1, 0, 0, 1);
    trails.sample("IGO6140", 2, 0, 0, 2);
    const buf = trails.get("IGO6140")!;
    expect(buf.count).toBe(2);
    expect(buf.oldest()!.t).toBe(1);
  });

  it("prune drops trails for callsigns no longer live", () => {
    const trails = new AircraftTrails(4);
    trails.sample("A", 0, 0, 0, 0);
    trails.sample("B", 0, 0, 0, 0);
    trails.prune(new Set(["A"]));
    expect(trails.get("A")).toBeDefined();
    expect(trails.get("B")).toBeUndefined();
  });

  it("setCapacity to the same value is a no-op; a real change clears every trail", () => {
    const trails = new AircraftTrails(4);
    trails.sample("A", 0, 0, 0, 0);
    trails.setCapacity(4);
    expect(trails.get("A")!.count).toBe(1);
    trails.setCapacity(10);
    expect(trails.get("A")).toBeUndefined();
  });
});
