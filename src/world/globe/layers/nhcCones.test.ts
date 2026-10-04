import { describe, expect, it } from "vitest";
import { matchConeToGdacs, parseNhcCones, unwrapConeRing } from "./nhcCones.ts";
import type { GdacsAlert } from "./hazardAlerts.ts";

// A trimmed real sample (NHC MapServer layer 8, verified live 2026-09-29):
// one storm, one outer ring, GeoJSON's [lon, lat] point order.
const oneStorm = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      id: 338,
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-54.06, 21.57],
            [-53.7, 22.0],
            [-53.0, 21.8],
            [-54.06, 21.57], // GeoJSON closes the ring by repeating the first point.
          ],
        ],
      },
      properties: { stormname: "Fay", basin: "AL" },
    },
  ],
};

const emptyCollection = { type: "FeatureCollection", features: [] };

it("triangulates a dateline-crossing cone in a narrow continuous longitude strip", () => {
  const ring = [{ lat: 10, lon: 179 }, { lat: 10, lon: -179 }, { lat: 12, lon: -178 }, { lat: 12, lon: 178 }];
  expect(unwrapConeRing(ring).map((p) => p.lon)).toEqual([179, 181, 182, 178]);
  expect(unwrapConeRing(ring.map((p) => ({ ...p, lon: -p.lon }))).map((p) => p.lon)).toEqual([-179, -181, -182, -178]);
  expect(unwrapConeRing([])).toEqual([]);
});

describe("parseNhcCones", () => {
  it("parses at least one polygon and keeps GeoJSON's [lon, lat] order", () => {
    const cones = parseNhcCones(oneStorm);
    expect(cones).not.toBeNull();
    expect(cones!.length).toBeGreaterThanOrEqual(1);
    const [cone] = cones!;
    expect(cone.stormName).toBe("Fay");
    expect(cone.rings[0][0]).toEqual({ lon: -54.06, lat: 21.57 }); // not { lon: 21.57, lat: -54.06 }
  });

  it("an empty FeatureCollection parses to an empty array, not null", () => {
    expect(parseNhcCones(emptyCollection)).toEqual([]);
  });

  it("a malformed feed (not a FeatureCollection) parses to null", () => {
    expect(parseNhcCones({ oops: true })).toBeNull();
    expect(parseNhcCones(null)).toBeNull();
  });

  it("drops a feature with a degenerate ring (fewer than 3 points)", () => {
    const degenerate = {
      type: "FeatureCollection",
      features: [{ type: "Feature", geometry: { type: "Polygon", coordinates: [[[1, 1], [2, 2]]] }, properties: {} }],
    };
    expect(parseNhcCones(degenerate)).toEqual([]);
  });
});

const gdacsAlert = (over: Partial<GdacsAlert>): GdacsAlert => ({
  id: "TC-1", eventType: "TC", alertLevel: "orange", name: "FAY", lat: 21.6, lon: -53.9, url: "https://gdacs.org", ...over,
});

describe("matchConeToGdacs", () => {
  const cone = parseNhcCones(oneStorm)![0];

  it("matches by name first", () => {
    const far = gdacsAlert({ id: "TC-far", name: "FAY", lat: 0, lon: 0 }); // outside distance threshold, still named right
    expect(matchConeToGdacs(cone, [far])).toBe(far);
  });

  it("falls back to distance when the name does not match", () => {
    const near = gdacsAlert({ id: "TC-near", name: "SOMETHING-ELSE", lat: 21.6, lon: -53.9 });
    expect(matchConeToGdacs(cone, [near])).toBe(near);
  });

  it("returns null when nothing is close or named right", () => {
    const far = gdacsAlert({ id: "TC-far", name: "UNRELATED", lat: -40, lon: 140 });
    expect(matchConeToGdacs(cone, [far])).toBeNull();
  });

  it("ignores non-TC alerts entirely", () => {
    const wildfire = gdacsAlert({ id: "WF-1", eventType: "WF", name: "FAY", lat: 21.6, lon: -53.9 });
    expect(matchConeToGdacs(cone, [wildfire])).toBeNull();
  });
});
