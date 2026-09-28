import { describe, expect, it } from "vitest";
import { latLonToXyz, GLOBE_RADIUS } from "../geoMath.ts";
import { MAX_SELECTED_TILES, selectVisibleTiles, type CameraSample } from "./tileSelect.ts";

function cameraOver(lat: number, lon: number, distance: number): CameraSample {
  const dir = latLonToXyz(lat, lon);
  const position = { x: dir.x * distance, y: dir.y * distance, z: dir.z * distance };
  return { position, forward: { x: -dir.x, y: -dir.y, z: -dir.z }, fovRadians: (42 * Math.PI) / 180, canvasHeightPx: 900 };
}

describe("selectVisibleTiles", () => {
  it("the tile directly under the camera is always in the result", () => {
    const cam = cameraOver(19.5, 73.9, 9); // Pune, min zoom distance
    const tiles = selectVisibleTiles("250m", 8, cam);
    expect(tiles.length).toBeGreaterThan(0);
    const hit = tiles.find((t) => t.bounds.lat1 <= 19.5 && t.bounds.lat0 >= 19.5 && t.bounds.lon0 <= 73.9 && t.bounds.lon1 >= 73.9);
    expect(hit).toBeDefined();
  });

  it("zooming in (shorter distance) selects a finer level than zooming out", () => {
    const far = selectVisibleTiles("250m", 8, cameraOver(0, 0, 42));
    const near = selectVisibleTiles("250m", 8, cameraOver(0, 0, 9));
    expect(near[0]?.level ?? 0).toBeGreaterThan(far[0]?.level ?? 0);
  });

  it("never returns a tile from the far side of the globe (opposite hemisphere)", () => {
    const cam = cameraOver(0, 0, 9);
    const tiles = selectVisibleTiles("250m", 8, cam);
    for (const t of tiles) {
      const midLon = (t.bounds.lon0 + t.bounds.lon1) / 2;
      // Camera is over lon 0 at min distance: the antipodal band (~180deg
      // away) must never appear.
      expect(Math.abs(midLon)).toBeLessThan(170);
    }
  });

  it("respects the hard cap even at a coarse level with a wide effective cap angle (max distance)", () => {
    const cam = cameraOver(0, 0, 42);
    const tiles = selectVisibleTiles("2km", 5, cam);
    expect(tiles.length).toBeLessThanOrEqual(MAX_SELECTED_TILES);
  });

  it("returns no duplicate (row, col) pairs even when the wrap can revisit a column", () => {
    const cam = cameraOver(89, 0, 42); // near the pole, wide angular cap: colSpan can exceed matrixWidth at low levels
    const tiles = selectVisibleTiles("2km", 5, cam);
    const keys = tiles.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("a camera over the antimeridian (lon ~180) still selects tiles, not an empty result from falling off the grid", () => {
    const cam = cameraOver(0, 179.5, 9);
    const tiles = selectVisibleTiles("250m", 8, cam);
    expect(tiles.length).toBeGreaterThan(0);
  });

  // Break-it: prove the horizon cull is actually excluding something, not a
  // no-op that happens to pass the "no far side" test above by coincidence
  // of the test's own geometry.
  it("break-it: at min distance, far fewer tiles pass the horizon cull than the raw lat/lon box would contain", () => {
    const cam = cameraOver(0, 0, 9); // GLOBE_RADIUS=6, distance 9: horizon cull should bite hard
    const culled = selectVisibleTiles("250m", 8, cam);
    // The full level-8 matrix is 320x160 = 51,200 tiles; a real horizon cull
    // at this distance keeps only a small visible cap of it.
    expect(culled.length).toBeGreaterThan(0);
    expect(culled.length).toBeLessThan(320 * 160 * 0.1);
  });

  it("sanity: GLOBE_RADIUS import is the real shared constant (6), not a local guess", () => {
    expect(GLOBE_RADIUS).toBe(6);
  });
});
