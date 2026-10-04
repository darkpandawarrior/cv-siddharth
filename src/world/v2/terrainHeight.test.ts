import { beforeAll, describe, expect, it } from "vitest";
import sharp from "sharp";
import { readFileSync } from "node:fs";
import { terrainHeight, groundPosition, type Heightmap } from "./terrainHeight.ts";
import { spawnPose } from "./spawn.ts";
import { landmarkPositions } from "./landmarkPositions.ts";
import { LANDMARK_OPENS } from "./landmarkBindings.ts";
import { landOf } from "./worldModel.ts";
import { ledger } from "./ledger.ts";

let hm: Heightmap;
beforeAll(async () => {
  const meta = JSON.parse(readFileSync("heavy/world/terrain/valley-h-513.json", "utf8"));
  const pixels = await sharp("heavy/world/terrain/valley-h-513.png").greyscale().raw().toBuffer();
  hm = { meta, heights: Float32Array.from(pixels, (p) => meta.min + p / 255 * (meta.max - meta.min)) };
});
const heightAt = (x: number, z: number) => terrainHeight(x, z, hm);
const above = ([x, y, z]: readonly number[]) => {
  expect(Number.isFinite(y)).toBe(true);
  expect(y).toBeGreaterThan(heightAt(x, z));
};

describe("placements sample the terrain mesh's height function", () => {
  it("every default daypart camera and look target clears the actual heightmap", () => {
    for (const daypart of ["night", "dawn", "day", "dusk", "golden"] as const) {
      for (const az of [90, 270]) {
        const pose = spawnPose(daypart, az, heightAt);
        above(pose.pos);
        above(pose.look);
      }
    }
  });
  it("every LANDMARK_OPENS position clears ground", () => {
    const positions = landmarkPositions(heightAt);
    for (const id of Object.keys(LANDMARK_OPENS)) {
      expect(positions[id], id).toBeDefined();
      above(positions[id]);
    }
  });
  it("every rendered grammar placement clears ground without changing its ledger coordinates", () => {
    for (const feature of landOf(ledger)) {
      const placed = groundPosition(feature.pos, heightAt);
      above(placed);
      expect([placed[0], placed[2]]).toEqual([feature.pos[0], feature.pos[2]]);
    }
  });
  it("the sampler reads grid corners and clamps outside the map", () => {
    const map: Heightmap = { heights: new Float32Array([1, 3, 5, 7]), meta: { grid: 2, metresPerTexel: 2, min: 1, max: 7, bounds: { xMin: 0, xMax: 2, zMin: 0, zMax: 2 } } };
    expect(terrainHeight(1, 1, map)).toBe(4);
    expect(terrainHeight(-1, -1, map)).toBe(1);
    expect(terrainHeight(3, 3, map)).toBe(7);
  });
});
