import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isBehindEarth, raDecToXyz, rotateY, toSegmentPairs, type ConstellationRaw } from "./skyConstellations.ts";

describe("public/sky/constellations.json (shipped trim)", () => {
  // Guards the Serpens Caput/Cauda regression: the only IAU id (`Ser`) that
  // legitimately appears twice in the trim (two disconnected figures). A
  // future re-trim that collapses their name or centroid back together
  // would silently mislabel one figure and give React two identical
  // <Html key> siblings (ConstellationLabels.tsx) - catch it here instead
  // of a visitor noticing a wrong label in ground view.
  const path = fileURLToPath(new URL("../../../../public/sky/constellations.json", import.meta.url));
  const data = JSON.parse(readFileSync(path, "utf8")) as { constellations: ConstellationRaw[] };
  const byId = new Map<string, ConstellationRaw[]>();
  for (const c of data.constellations) {
    const list = byId.get(c.id) ?? [];
    list.push(c);
    byId.set(c.id, list);
  }

  it("every constellation id maps to distinct names when it repeats (Serpens Caput vs Cauda)", () => {
    for (const [id, entries] of byId) {
      const names = new Set(entries.map((e) => e.name));
      expect(names.size, `id "${id}" has ${entries.length} entries but only ${names.size} distinct name(s)`).toBe(entries.length);
    }
  });

  it("every constellation id maps to distinct centroids when it repeats (never two figures sharing one ra/dec)", () => {
    for (const [id, entries] of byId) {
      const centroids = new Set(entries.map((e) => `${e.ra},${e.dec}`));
      expect(centroids.size, `id "${id}" has ${entries.length} entries but only ${centroids.size} distinct centroid(s)`).toBe(entries.length);
    }
  });

  it("Serpens splits into Caput and Cauda specifically (not just \"distinct\", the right two names)", () => {
    const ser = byId.get("Ser") ?? [];
    expect(ser.map((e) => e.name).sort()).toEqual(["Serpens Caput", "Serpens Cauda"]);
  });
});

describe("toSegmentPairs", () => {
  it("turns a single 4-point polyline into 3 adjacent segment pairs", () => {
    const c: ConstellationRaw = { id: "Test", name: "Test", ra: 0, dec: 0, lines: [[0, 0, 10, 10, 20, 20, 30, 30]] };
    expect(toSegmentPairs(c)).toEqual([0, 0, 10, 10, 10, 10, 20, 20, 20, 20, 30, 30]);
  });

  it("never draws a connecting segment between two separate polylines (a constellation with a detached second figure)", () => {
    const c: ConstellationRaw = { id: "Test", name: "Test", ra: 0, dec: 0, lines: [[0, 0, 10, 10], [50, 50, 60, 60]] };
    // 2 points per polyline -> exactly 1 segment each, never a 3rd segment
    // bridging (10,10) to (50,50).
    expect(toSegmentPairs(c)).toEqual([0, 0, 10, 10, 50, 50, 60, 60]);
  });

  it("break-it: a degenerate single-point polyline yields zero segments, not a NaN one", () => {
    const c: ConstellationRaw = { id: "Test", name: "Test", ra: 0, dec: 0, lines: [[5, 5]] };
    expect(toSegmentPairs(c)).toEqual([]);
  });
});

describe("raDecToXyz", () => {
  it("RA=0, Dec=0 points toward +X (the same (0,0) anchor geoMath.ts's own latLonToXyz uses)", () => {
    const [x, y, z] = raDecToXyz(0, 0, 10);
    expect(x).toBeCloseTo(10, 9);
    expect(y).toBeCloseTo(0, 9);
    expect(z).toBeCloseTo(0, 9);
  });

  it("Dec=90 points toward +Y regardless of RA", () => {
    const [x, y, z] = raDecToXyz(123, 90, 10);
    expect(x).toBeCloseTo(0, 6);
    expect(y).toBeCloseTo(10, 9);
    expect(z).toBeCloseTo(0, 6);
  });

  it("returns the y component untouched by RA (sanity: y depends on Dec only)", () => {
    const [, y1] = raDecToXyz(0, 30, 10);
    const [, y2] = raDecToXyz(200, 30, 10);
    expect(y1).toBeCloseTo(y2, 9);
  });

  it("RA=90, Dec=0 points toward -Z (skyStars.tsx's own lon=RA*15 deg encoding sign)", () => {
    const [x, , z] = raDecToXyz(90, 0, 10);
    expect(x).toBeCloseTo(0, 6);
    expect(z).toBeCloseTo(-10, 6);
  });
});

describe("rotateY", () => {
  it("matches THREE.Object3D's own rotation.y transform (verified against three directly, scratchpad probe)", () => {
    // A 90-degree turn sends +X to -Z, the same result a live
    // `new THREE.Group(); group.rotation.y = Math.PI/2` applied to a child
    // at (6,0,0) produces (checked once against the real three.js Euler
    // application, not just re-derived algebra).
    const [x, y, z] = rotateY(6, 0, 0, Math.PI / 2);
    expect(x).toBeCloseTo(0, 9);
    expect(y).toBeCloseTo(0, 9);
    expect(z).toBeCloseTo(-6, 9);
  });

  it("a full turn (2*PI) is the identity", () => {
    const [x, y, z] = rotateY(3, 4, 5, Math.PI * 2);
    expect(x).toBeCloseTo(3, 6);
    expect(y).toBeCloseTo(4, 9);
    expect(z).toBeCloseTo(5, 6);
  });
});

describe("isBehindEarth", () => {
  const GLOBE_RADIUS = 6;

  it("a point in the same direction as the camera (the near sky) is never behind the earth", () => {
    expect(isBehindEarth(0, 0, 400, 0, 0, 20, GLOBE_RADIUS)).toBe(false);
  });

  it("a point in the exact opposite direction from the camera (straight through the globe's centre) is behind it", () => {
    expect(isBehindEarth(0, 0, -400, 0, 0, 20, GLOBE_RADIUS)).toBe(true);
  });

  it("break-it: a camera somehow inside the globe (camDist <= radius) never reports an occlusion — nothing to hide behind", () => {
    expect(isBehindEarth(0, 0, 400, 0, 0, 3, GLOBE_RADIUS)).toBe(false);
  });
});
