import { describe, it, expect } from "vitest";
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildCheckFixture, buildEarthMask, LAND_SUM_THRESHOLD } from "./gen-globe-earth.mjs";

const OUT_PATH = fileURLToPath(new URL("../heavy/globe/earth-720x360.bin", import.meta.url));

describe("buildEarthMask", () => {
  const { rgb, width, height } = buildCheckFixture();

  it("is deterministic: two runs over the same input are byte-identical", () => {
    const a = buildEarthMask(rgb, width, height, 4, 2);
    const b = buildEarthMask(rgb, width, height, 4, 2);
    expect(a.equals(b)).toBe(true);
  });

  it("writes an 8-byte header (magic + width + height LE) before the cell data", () => {
    const buf = buildEarthMask(rgb, width, height, 4, 2);
    expect(buf.length).toBe(8 + 4 * 2);
    expect(buf.toString("ascii", 0, 4)).toBe("GLOB");
    expect(buf.readUInt16LE(4)).toBe(4);
    expect(buf.readUInt16LE(6)).toBe(2);
  });

  it("classifies the fixture's four quadrants correctly: ocean, land, ocean, lit land", () => {
    // 40x20 fixture -> 4x2 output: each output cell is exactly one quadrant.
    const buf = buildEarthMask(rgb, width, height, 4, 2);
    const cell = (ox, oy) => buf[8 + oy * 4 + ox];
    const isLand = (byte) => (byte & 0x80) !== 0;
    const radiance = (byte) => byte & 0x0f;

    // Row 0 (top): left half ocean, right half unlit land.
    expect(isLand(cell(0, 0))).toBe(false);
    expect(isLand(cell(3, 0))).toBe(true);
    // Row 1 (bottom): left half ocean again, right half a lit city.
    expect(isLand(cell(0, 1))).toBe(false);
    expect(isLand(cell(3, 1))).toBe(true);

    // The lit city cell reads brighter than the unlit-land cell.
    expect(radiance(cell(3, 1))).toBeGreaterThan(radiance(cell(3, 0)));
    // Ocean never carries a radiance value above the noise floor.
    expect(radiance(cell(0, 0))).toBe(0);
  });

  it("the ocean fill colour sums well under LAND_SUM_THRESHOLD", () => {
    expect(5 + 5 + 15).toBeLessThan(LAND_SUM_THRESHOLD);
  });
});

describe("heavy/globe/earth-720x360.bin (committed)", () => {
  it("exists, is <= 72,000 bytes, and matches the 360x180 header", () => {
    const stat = statSync(OUT_PATH);
    expect(stat.size).toBeLessThanOrEqual(72_000);
    const buf = readFileSync(OUT_PATH);
    expect(buf.toString("ascii", 0, 4)).toBe("GLOB");
    expect(buf.readUInt16LE(4)).toBe(360);
    expect(buf.readUInt16LE(6)).toBe(180);
    expect(buf.length).toBe(8 + 360 * 180);
  });
});
