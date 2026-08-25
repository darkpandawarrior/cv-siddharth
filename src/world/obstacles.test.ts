import { describe, it, expect } from "vitest";
import { worldObstacles } from "./obstacles.ts";
import { employerBlocks, caseStudyMonuments, projectTowers } from "./districtWest.ts";
import { excelsiorEditionBlocks } from "./corpusData.ts";
import { CAR_RADIUS } from "./drive.ts";
import { SPAWN_POSITION, WORLD_BOUNDS } from "./craftPhysics.ts";

describe("worldObstacles", () => {
  it("covers every solid structure the renderers draw — no silent gap", () => {
    // The drift guard. If a new structure family is added to districtWest or
    // corpusData and not derived here, it becomes a building you drive
    // through, and no visual test would catch it.
    const expected =
      employerBlocks().length + caseStudyMonuments().length + projectTowers().length + excelsiorEditionBlocks().length;
    expect(worldObstacles()).toHaveLength(expected);
  });

  it("gives every obstacle a positive footprint and a unique id", () => {
    const list = worldObstacles();
    const ids = new Set<string>();
    for (const o of list) {
      expect(o.rx).toBeGreaterThan(0);
      expect(o.rz).toBeGreaterThan(0);
      for (const v of [o.x, o.z, o.rx, o.rz]) expect(Number.isFinite(v)).toBe(true);
      expect(ids.has(o.id!), `duplicate id ${o.id}`).toBe(false);
      ids.add(o.id!);
    }
  });

  it("leaves the spawn point clear — the car must not start inside a wall", () => {
    const [sx, , sz] = SPAWN_POSITION;
    for (const o of worldObstacles()) {
      const clear = Math.abs(sx - o.x) >= o.rx + CAR_RADIUS || Math.abs(sz - o.z) >= o.rz + CAR_RADIUS;
      expect(clear, `spawn is inside ${o.id}`).toBe(true);
    }
  });

  it("keeps every obstacle inside the world bounds", () => {
    for (const o of worldObstacles()) {
      expect(o.x - o.rx).toBeGreaterThanOrEqual(WORLD_BOUNDS.minX - 1);
      expect(o.x + o.rx).toBeLessThanOrEqual(WORLD_BOUNDS.maxX + 1);
      expect(o.z - o.rz).toBeGreaterThanOrEqual(WORLD_BOUNDS.minZ - 1);
      expect(o.z + o.rz).toBeLessThanOrEqual(WORLD_BOUNDS.maxZ + 1);
    }
  });

  it("never fully blocks the corridor — some lateral gap exists at every depth", () => {
    // Reachability, stated as a property: if obstacles ever spanned the full
    // width at some z, the north half of the world would be unreachable and
    // every "can you get there" test that only checks one route would still
    // pass.
    const list = worldObstacles();
    for (let z = WORLD_BOUNDS.minZ; z <= WORLD_BOUNDS.maxZ; z += 2) {
      const blocking = list
        .filter((o) => z >= o.z - o.rz - CAR_RADIUS && z <= o.z + o.rz + CAR_RADIUS)
        .map((o) => [o.x - o.rx - CAR_RADIUS, o.x + o.rx + CAR_RADIUS] as const)
        .sort((a, b) => a[0] - b[0]);
      let edge = WORLD_BOUNDS.minX;
      let widest = 0;
      for (const [lo, hi] of blocking) {
        widest = Math.max(widest, lo - edge);
        edge = Math.max(edge, hi);
      }
      widest = Math.max(widest, WORLD_BOUNDS.maxX - edge);
      expect(widest, `corridor sealed at z=${z}`).toBeGreaterThan(0);
    }
  });
});
