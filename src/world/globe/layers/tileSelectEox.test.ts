import { describe, expect, it } from "vitest";
import { latLonToXyz, GLOBE_RADIUS } from "../geoMath.ts";
import { MAX_SELECTED_TILES } from "./tileSelect.ts";
import { selectEoxLevel, selectVisibleEoxTiles } from "./tileSelectEox.ts";
import type { CameraSample } from "./tileSelect.ts";

function cameraOver(lat: number, lon: number, distance: number): CameraSample {
  const dir = latLonToXyz(lat, lon);
  const position = { x: dir.x * distance, y: dir.y * distance, z: dir.z * distance };
  return { position, forward: { x: -dir.x, y: -dir.y, z: -dir.z }, fovRadians: (42 * Math.PI) / 180, canvasHeightPx: 900 };
}

describe("selectEoxLevel", () => {
  it("picks a finer level up close than far away, using EOX's OWN resolutions (not GIBS')", () => {
    const far = selectEoxLevel(42, (42 * Math.PI) / 180, 900, 17);
    const near = selectEoxLevel(9, (42 * Math.PI) / 180, 900, 17);
    expect(near).toBeGreaterThan(far);
  });

  it("never exceeds maxLevel even extremely close", () => {
    expect(selectEoxLevel(6.001, (42 * Math.PI) / 180, 900, 13)).toBeLessThanOrEqual(13);
  });
});

describe("selectVisibleEoxTiles", () => {
  it("the tile directly under the camera, over Pune, is always in the result", () => {
    const cam = cameraOver(18.52, 73.84, 9); // Pune, min zoom distance
    const tiles = selectVisibleEoxTiles(13, cam);
    expect(tiles.length).toBeGreaterThan(0);
    const hit = tiles.find((t) => t.bounds.lat1 <= 18.52 && t.bounds.lat0 >= 18.52 && t.bounds.lon0 <= 73.84 && t.bounds.lon1 >= 73.84);
    expect(hit).toBeDefined();
  });

  it("every returned tile key carries the WGS84 matrix set id (not a GIBS one)", () => {
    const tiles = selectVisibleEoxTiles(13, cameraOver(18.52, 73.84, 9));
    for (const t of tiles) expect(t.key.startsWith("WGS84/")).toBe(true);
  });

  it("zooming in selects a finer level than zooming out", () => {
    const far = selectVisibleEoxTiles(17, cameraOver(0, 0, 42));
    const near = selectVisibleEoxTiles(17, cameraOver(0, 0, 9));
    expect(near[0]?.level ?? 0).toBeGreaterThan(far[0]?.level ?? 0);
  });

  it("respects the hard tile cap even at a coarse level with a wide effective cap angle", () => {
    const tiles = selectVisibleEoxTiles(17, cameraOver(0, 0, 42));
    expect(tiles.length).toBeLessThanOrEqual(MAX_SELECTED_TILES);
  });

  it("returns no duplicate (row, col) pairs near the pole, where the wrap can revisit a column", () => {
    const tiles = selectVisibleEoxTiles(17, cameraOver(89, 0, 42));
    const keys = tiles.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  // Break-it: prove the horizon cull actually excludes most of the deep-zoom
  // matrix at min distance, not a no-op that happens to pass the smaller
  // tests above by coincidence.
  it("break-it: at min distance and a deep level, far fewer tiles pass the cull than the raw matrix contains", () => {
    const cam = cameraOver(0, 0, 9);
    const culled = selectVisibleEoxTiles(13, cam); // level 13: matrixWidth 16384, matrixHeight 8192
    expect(culled.length).toBeGreaterThan(0);
    expect(culled.length).toBeLessThan(16384 * 8192 * 0.0001);
  });

  it("sanity: GLOBE_RADIUS import is the real shared constant (6), not a local guess", () => {
    expect(GLOBE_RADIUS).toBe(6);
  });
});
