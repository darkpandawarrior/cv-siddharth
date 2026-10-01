import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import {
  parseQuakes,
  filterQuakesForTier,
  magnitudeToRadius,
  depthToColor,
  formatTimeAgo,
  quakesAtTime,
  quakeFadeAlpha,
} from "./quake.ts";

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), "../../../../e2e/fixtures/hazards/quakes.json");
const fixture = JSON.parse(readFileSync(FIXTURE, "utf8"));

describe("parseQuakes", () => {
  it("parses the committed USGS fixture", () => {
    const quakes = parseQuakes(fixture);
    expect(quakes).not.toBeNull();
    expect(quakes!.length).toBe(5);
    const first = quakes!.find((q) => q.place.includes("Karluk"))!;
    expect(first.mag).toBe(0.7);
    expect(first.depthKm).toBeCloseTo(5.7, 5);
  });

  it("returns null on a malformed feed rather than throwing", () => {
    expect(parseQuakes(null)).toBeNull();
    expect(parseQuakes({})).toBeNull();
    expect(parseQuakes({ features: "nope" })).toBeNull();
  });

  it("drops a feature missing coordinates or magnitude instead of crashing", () => {
    const bad = { features: [{ id: "x", properties: { mag: null, place: "p", time: 0, url: "u" }, geometry: null }] };
    expect(parseQuakes(bad)).toEqual([]);
  });
});

describe("filterQuakesForTier", () => {
  const quakes = parseQuakes(fixture)!;
  it("T1 keeps everything", () => {
    expect(filterQuakesForTier(quakes, 1).length).toBe(quakes.length);
  });
  it("T2 keeps M2.5+", () => {
    const t2 = filterQuakesForTier(quakes, 2);
    expect(t2.every((q) => q.mag >= 2.5)).toBe(true);
    expect(t2.length).toBeLessThan(quakes.length);
  });
  it("T3 keeps M4.5+ only", () => {
    const t3 = filterQuakesForTier(quakes, 3);
    expect(t3.every((q) => q.mag >= 4.5)).toBe(true);
    expect(t3.length).toBeLessThan(filterQuakesForTier(quakes, 2).length);
  });
});

describe("magnitudeToRadius", () => {
  it("is monotonically increasing with magnitude", () => {
    const radii = [0, 2.5, 4.5, 6, 9].map(magnitudeToRadius);
    for (let i = 1; i < radii.length; i++) expect(radii[i]).toBeGreaterThan(radii[i - 1]);
  });
});

describe("depthToColor", () => {
  it("is warm at the surface and cool at 300km+", () => {
    expect(depthToColor(0)).toBe("#ffb703");
    expect(depthToColor(300)).toBe("#3a0ca3");
    expect(depthToColor(700)).toBe("#3a0ca3"); // clamped, not extrapolated
  });
  it("is a real interpolation partway down, not a snap", () => {
    const mid = depthToColor(150);
    expect(mid).not.toBe("#ffb703");
    expect(mid).not.toBe("#3a0ca3");
  });
});

describe("formatTimeAgo", () => {
  it("steps through minutes, hours, days", () => {
    const now = Date.UTC(2026, 0, 2, 0, 0, 0);
    expect(formatTimeAgo(now, now - 30_000)).toBe("just now");
    expect(formatTimeAgo(now, now - 5 * 60_000)).toBe("5 min ago");
    expect(formatTimeAgo(now, now - 3 * 3600_000)).toBe("3 hr ago");
    expect(formatTimeAgo(now, now - 2 * 86_400_000)).toBe("2 d ago");
  });
});

describe("time filtering (task 7)", () => {
  const quakes = parseQuakes(fixture)!;
  it("drops quakes after the simulated instant", () => {
    const earliest = Math.min(...quakes.map((q) => q.timeMs));
    expect(quakesAtTime(quakes, earliest - 1)).toEqual([]);
  });
  it("fades toward the floor as an event ages, never past it", () => {
    const now = Date.now();
    expect(quakeFadeAlpha(now, now)).toBe(1);
    expect(quakeFadeAlpha(now, now - 12 * 3600_000)).toBeCloseTo(0.5, 1);
    expect(quakeFadeAlpha(now, now - 30 * 24 * 3600_000)).toBe(0.15);
  });
});
