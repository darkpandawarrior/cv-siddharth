import { describe, expect, it } from "vitest";
import { newBigQuakes, cueForPulse, isNewFly } from "./soundTriggers.ts";

describe("newBigQuakes", () => {
  it("keeps only mag>=5 quakes not already seen", () => {
    const seen = new Set(["a"]);
    const quakes = [
      { id: "a", mag: 6.2 }, // already seen, dropped
      { id: "b", mag: 4.9 }, // too small, dropped
      { id: "c", mag: 5.0 }, // exactly the floor, kept
      { id: "d", mag: 7.1 }, // new and big, kept
    ];
    expect(newBigQuakes(seen, quakes).map((q) => q.id)).toEqual(["c", "d"]);
  });

  it("is empty for no quakes or an empty seen set with nothing big", () => {
    expect(newBigQuakes(new Set(), [])).toEqual([]);
    expect(newBigQuakes(new Set(), [{ id: "x", mag: 3 }])).toEqual([]);
  });
});

describe("cueForPulse", () => {
  it("maps the two CI outcomes only", () => {
    expect(cueForPulse("ci-pass")).toBe("chime");
    expect(cueForPulse("ci-fail")).toBe("thud");
  });
  it("is silent for every other pulse kind", () => {
    for (const kind of ["push", "devto", "lichess", "downloads"] as const) {
      expect(cueForPulse(kind)).toBeNull();
    }
  });
});

describe("isNewFly", () => {
  it("never fires on the very first check (no baseline yet)", () => {
    expect(isNewFly(undefined, { kind: "latlon", lat: 1, lon: 2 })).toBe(false);
    expect(isNewFly(undefined, null)).toBe(false);
  });

  it("fires when a real focus first lands after a null baseline", () => {
    expect(isNewFly(null, { kind: "latlon", lat: 1, lon: 2 })).toBe(true);
  });

  it("never fires when the flight ends (next is null)", () => {
    expect(isNewFly({ kind: "latlon", lat: 1, lon: 2 }, null)).toBe(false);
  });

  it("never fires on a re-set to the exact same latlon", () => {
    const a = { kind: "latlon" as const, lat: 18.5, lon: 73.8 };
    const b = { kind: "latlon" as const, lat: 18.5, lon: 73.8 };
    expect(isNewFly(a, b)).toBe(false);
  });

  it("fires on a different latlon, or a different entity id", () => {
    expect(isNewFly({ kind: "latlon", lat: 1, lon: 2 }, { kind: "latlon", lat: 3, lon: 4 })).toBe(true);
    expect(isNewFly({ kind: "entity", id: "sat:1" }, { kind: "entity", id: "sat:2" })).toBe(true);
    expect(isNewFly({ kind: "entity", id: "sat:1" }, { kind: "entity", id: "sat:1" })).toBe(false);
  });

  it("fires when the focus kind itself changes", () => {
    expect(isNewFly({ kind: "latlon", lat: 1, lon: 2 }, { kind: "entity", id: "sat:1" })).toBe(true);
  });
});
