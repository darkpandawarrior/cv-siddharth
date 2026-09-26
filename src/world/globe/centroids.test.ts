import { describe, it, expect } from "vitest";
import { centroids } from "./centroids.ts";

describe("centroids", () => {
  it("has roughly 250 country rows (Natural Earth admin-0, ISO-2-matchable only)", () => {
    expect(centroids.length).toBeGreaterThan(200);
    expect(centroids.length).toBeLessThan(260);
  });

  it("every row is a valid ISO-2 code with a lat/lon on the globe", () => {
    for (const c of centroids) {
      expect(c.iso2).toMatch(/^[A-Z]{2}$/);
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.lat).toBeGreaterThanOrEqual(-90);
      expect(c.lat).toBeLessThanOrEqual(90);
      expect(c.lon).toBeGreaterThanOrEqual(-180);
      expect(c.lon).toBeLessThanOrEqual(180);
    }
  });

  it("has no duplicate ISO-2 codes -- one live-presence dot per country", () => {
    const codes = centroids.map((c) => c.iso2);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("is sorted by iso2, for a stable regeneration diff", () => {
    const codes = centroids.map((c) => c.iso2);
    expect(codes).toEqual([...codes].sort());
  });

  it("includes India at Indian coordinates, as a sanity check on the upstream join", () => {
    const india = centroids.find((c) => c.iso2 === "IN");
    expect(india).toBeDefined();
    expect(india?.lat).toBeGreaterThan(6);
    expect(india?.lat).toBeLessThan(36);
    expect(india?.lon).toBeGreaterThan(68);
    expect(india?.lon).toBeLessThan(98);
  });
});
