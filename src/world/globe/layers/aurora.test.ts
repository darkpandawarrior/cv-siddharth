import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { parseOvationGrid, auroraGridIndex, parseLatestKp, kpDetail, AURORA_GRID_WIDTH, AURORA_GRID_HEIGHT } from "./aurora.ts";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "../../../../e2e/fixtures/hazards");
const ovationFixture = JSON.parse(readFileSync(join(FIXTURES, "ovation.json"), "utf8"));
const kpFixture = JSON.parse(readFileSync(join(FIXTURES, "kp.json"), "utf8"));

describe("auroraGridIndex", () => {
  it("wraps longitude both directions", () => {
    expect(auroraGridIndex(0, 0)).toBe(auroraGridIndex(360, 0));
    expect(auroraGridIndex(-1, 0)).toBe(auroraGridIndex(359, 0));
  });
  it("maps the latitude extremes to the grid's first and last row", () => {
    expect(auroraGridIndex(0, -90)).toBe(0);
    expect(auroraGridIndex(0, 90)).toBe((AURORA_GRID_HEIGHT - 1) * AURORA_GRID_WIDTH);
  });
  it("clamps an out-of-range latitude instead of indexing off the array", () => {
    expect(auroraGridIndex(0, 91)).toBe(auroraGridIndex(0, 90));
  });
});

describe("parseOvationGrid", () => {
  it("parses the committed OVATION fixture into a full grid, unlisted cells at 0", () => {
    const grid = parseOvationGrid(ovationFixture);
    expect(grid).not.toBeNull();
    expect(grid!.data.length).toBe(AURORA_GRID_WIDTH * AURORA_GRID_HEIGHT);
    expect(Math.max(...grid!.data)).toBeGreaterThan(0);
    // a texel nowhere near this fixture's sampled points stays at the "feed
    // said nothing here" default
    expect(grid!.data[auroraGridIndex(1, 1)]).toBe(0);
  });

  it("scales the feed's 0-100 probability into a 0-255 byte", () => {
    const grid = parseOvationGrid({ coordinates: [[10, 20, 100]] })!;
    expect(grid.data[auroraGridIndex(10, 20)]).toBe(255);
  });

  it("returns null on a malformed feed", () => {
    expect(parseOvationGrid(null)).toBeNull();
    expect(parseOvationGrid({ coordinates: "nope" })).toBeNull();
  });
});

describe("Kp", () => {
  it("reads the feed's last row as the latest reading", () => {
    const reading = parseLatestKp(kpFixture);
    expect(reading).not.toBeNull();
    expect(reading!.kp).toBeCloseTo(3.33, 2);
  });

  it("formats the health-detail row verbatim", () => {
    expect(kpDetail({ kp: 3.33, timeIso: "x" })).toBe("Kp 3.33, aurora oval live");
  });

  it("returns null on an empty or malformed feed", () => {
    expect(parseLatestKp([])).toBeNull();
    expect(parseLatestKp(null)).toBeNull();
  });
});
