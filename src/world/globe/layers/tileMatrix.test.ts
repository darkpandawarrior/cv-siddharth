import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EOX_LEVELS, groundResolutionMetersPerPixel, levelDef, latStepDeg, lonStepDeg, tileBounds, tileKey, tileRowColForLatLon, wrapLon } from "./tileMatrix.ts";

describe("wrapLon", () => {
  it("leaves in-range values alone", () => {
    expect(wrapLon(0)).toBe(0);
    expect(wrapLon(-179)).toBe(-179);
    expect(wrapLon(179)).toBe(179);
  });

  it("wraps past +180 back around to negative", () => {
    expect(wrapLon(181)).toBeCloseTo(-179);
    expect(wrapLon(360)).toBeCloseTo(0);
    expect(wrapLon(200)).toBeCloseTo(-160);
  });

  it("wraps past -180 back around to positive", () => {
    expect(wrapLon(-181)).toBeCloseTo(179);
    expect(wrapLon(-540)).toBeCloseTo(180 - 360); // -540 -> -180 -> wraps to -180, not +180 (boundary)
  });
});

describe("tileRowColForLatLon / tileBounds round-trip", () => {
  it("a point at a tile's own centre maps back into that same tile, every level 0-8", () => {
    for (let level = 0; level <= 8; level++) {
      const { row, col } = tileRowColForLatLon(19.5, 73.9, level); // roughly Pune
      const b = tileBounds(level, row, col);
      const midLat = (b.lat0 + b.lat1) / 2;
      const midLon = (b.lon0 + b.lon1) / 2;
      const back = tileRowColForLatLon(midLat, midLon, level);
      expect(back).toEqual({ level, row, col });
    }
  });

  it("level 0 clips the two padded 288-degree WMTS tiles to the globe", () => {
    expect(tileBounds(0, 0, 0)).toEqual({ lat0: 90, lat1: -90, lon0: -180, lon1: 108 });
    expect(tileBounds(0, 0, 1)).toEqual({ lat0: 90, lat1: -90, lon0: 108, lon1: 180 });
  });

  it("clamps latitude at the poles instead of wrapping", () => {
    const north = tileRowColForLatLon(95, 0, 3);
    const south = tileRowColForLatLon(-95, 0, 3);
    expect(north.row).toBe(0);
    expect(south.row).toBe(4); // matrixHeight(3) - 1 = 4
  });

  it("wraps longitude across the antimeridian onto a real tile, not off the grid", () => {
    const justPast = tileRowColForLatLon(0, 181, 4); // level 4: matrixWidth 20, tile step 18deg
    const justBefore = tileRowColForLatLon(0, -179, 4);
    expect(justPast).toEqual(justBefore);
    expect(justPast.col).toBeGreaterThanOrEqual(0);
    expect(justPast.col).toBeLessThan(20);
  });
});

describe("lonStepDeg / latStepDeg", () => {
  it("level 3 is exactly 36deg square tiles (the first level GIBS's own table regularises)", () => {
    expect(lonStepDeg(3)).toBeCloseTo(36);
    expect(latStepDeg(3)).toBeCloseTo(36);
  });

  it("level 1 tiles span 144 degrees square before edge clipping", () => {
    expect(lonStepDeg(1)).toBeCloseTo(144);
    expect(latStepDeg(1)).toBeCloseTo(144);
  });
});

describe("groundResolutionMetersPerPixel", () => {
  it("halves each level (a real WMTS pyramid), and 250m's own top level reads close to its own name", () => {
    const r0 = groundResolutionMetersPerPixel(0);
    const r1 = groundResolutionMetersPerPixel(1);
    expect(r1).toBeCloseTo(r0 / 2, 3);
    // "250m" caps at level 8; GIBS names its sets by the resolution at the
    // EQUATOR at that cap, and the WMTS pixel-size convention (0.28mm) reads
    // a bit finer than that nominal name — 244m here, not 250m on the nose.
    expect(groundResolutionMetersPerPixel(8)).toBeGreaterThan(200);
    expect(groundResolutionMetersPerPixel(8)).toBeLessThan(260);
  });
});

describe("tileKey", () => {
  it("is stable and distinguishes matrix set, level, row and col", () => {
    expect(tileKey("250m", 3, 2, 5)).toBe("250m/3/2/5");
    expect(tileKey("250m", 3, 2, 5)).not.toBe(tileKey("500m", 3, 2, 5));
  });
});

// Break-it: prove tileRowColForLatLon actually clamps rather than silently
// returning an out-of-range index a texture fetch would 400 on.
describe("break-it: out-of-range inputs are clamped, not passed through raw", () => {
  it("a col of exactly matrixWidth would be off the end of the real matrix", () => {
    const { col } = tileRowColForLatLon(0, 180, 3); // exactly the east edge
    expect(col).toBeLessThan(10); // level 3 matrixWidth is 10 — col 10 would 400
  });
});

// LANE V1 (wave 7, step B): EOX's own WGS84 matrix (256px tiles, a real
// quadtree unlike GIBS_LEVELS) — every leveled function accepts EOX_LEVELS
// explicitly and must read IT, not silently fall back to GIBS_LEVELS.
describe("EOX_LEVELS (WGS84 / GoogleCRS84Quad)", () => {
  it("level 0 is 2x1, matching GIBS at level 0 (coincidence — the doubling diverges from level 1 on)", () => {
    expect(EOX_LEVELS[0]).toMatchObject({ matrixWidth: 2, matrixHeight: 1 });
  });

  it("is a real quadtree: matrixWidth exactly doubles every level, unlike GIBS_LEVELS' own irregular 0-2", () => {
    for (let level = 1; level < EOX_LEVELS.length; level++) {
      expect(EOX_LEVELS[level].matrixWidth).toBe(EOX_LEVELS[level - 1].matrixWidth * 2);
      expect(EOX_LEVELS[level].matrixHeight).toBe(EOX_LEVELS[level - 1].matrixHeight * 2);
    }
  });

  it("lonStepDeg/latStepDeg read the EOX table when passed explicitly, not GIBS_LEVELS", () => {
    // GIBS level 1 is 144deg x 144deg (padded); EOX level 1 is 90deg x 90deg
    // (regular quadtree) — a real behavioural difference, not just a renamed
    // constant, so this proves the `levels` param actually routes.
    expect(lonStepDeg(1, EOX_LEVELS)).toBeCloseTo(90);
    expect(latStepDeg(1, EOX_LEVELS)).toBeCloseTo(90);
  });

  it("a Pune-ish point round-trips through tileBounds at a deep EOX level (13, ~10m/px)", () => {
    const { row, col } = tileRowColForLatLon(18.52, 73.84, 13, EOX_LEVELS);
    const b = tileBounds(13, row, col, EOX_LEVELS);
    expect(b.lon0).toBeLessThanOrEqual(73.84);
    expect(b.lon1).toBeGreaterThanOrEqual(73.84);
    expect(b.lat1).toBeLessThanOrEqual(18.52);
    expect(b.lat0).toBeGreaterThanOrEqual(18.52);
  });

  it("groundResolutionMetersPerPixel reads close to 10m at EOX level 13 (deep-zoom target)", () => {
    const res = groundResolutionMetersPerPixel(13, EOX_LEVELS);
    expect(res).toBeGreaterThan(8);
    expect(res).toBeLessThan(11);
  });

  // Break-it: without the `levels` default staying GIBS_LEVELS, every existing
  // GIBS caller (tileSelect.ts, unowned by this lane) would silently read the
  // wrong table the moment EOX_LEVELS existed alongside it.
  it("break-it: omitting the levels param still reads GIBS_LEVELS, not EOX_LEVELS", () => {
    expect(lonStepDeg(1)).not.toBeCloseTo(lonStepDeg(1, EOX_LEVELS));
  });
});

describe("NASA WMTS geometry from the trimmed GetCapabilities fixture", () => {
  const xml = readFileSync(new URL("./__fixtures__/gibs-epsg4326-matrices.xml", import.meta.url), "utf8");
  const tag = (text: string, name: string) => text.match(new RegExp(`<${name}>(.*?)</${name}>`))![1];
  const sets = [...xml.matchAll(/<TileMatrixSet>([\s\S]*?)<\/TileMatrixSet>/g)];
  it("derives every published level for 250m, 500m, 1km and 2km from scale, tile pixels and origin", () => {
    expect(sets.map(m => tag(m[1], "ows:Identifier")).sort()).toEqual(["1km", "250m", "2km", "500m"]);
    for (const set of sets) for (const matrix of set[1].matchAll(/<TileMatrix>([\s\S]*?)<\/TileMatrix>/g)) {
      const level = Number(tag(matrix[1], "ows:Identifier"));
      const [west, north] = tag(matrix[1], "TopLeftCorner").split(" ").map(Number);
      const span = Number(tag(matrix[1], "ScaleDenominator")) * 0.00028 * Number(tag(matrix[1], "TileWidth")) / (6378137 * Math.PI / 180);
      expect(lonStepDeg(level)).toBeCloseTo(span, 8);
      expect(latStepDeg(level)).toBeCloseTo(span, 8);
      const def = levelDef(level);
      expect(def.matrixWidth).toBe(Number(tag(matrix[1], "MatrixWidth")));
      expect(def.matrixHeight).toBe(Number(tag(matrix[1], "MatrixHeight")));
      const corner = tileBounds(level, def.matrixHeight - 1, def.matrixWidth - 1);
      expect(corner.lon0).toBeCloseTo(west + (def.matrixWidth - 1) * span, 8);
      expect(corner.lat0).toBeCloseTo(north - (def.matrixHeight - 1) * span, 8);
      expect(corner.lon1).toBeCloseTo(Math.min(180, west + def.matrixWidth * span), 8);
      expect(corner.lat1).toBeCloseTo(Math.max(-90, north - def.matrixHeight * span), 8);
    }
  });
});
