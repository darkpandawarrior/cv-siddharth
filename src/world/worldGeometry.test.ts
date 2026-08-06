import { describe, expect, it } from "vitest";
import { PLACEMENTS, TERRAIN } from "./worldData.ts";
import { CHASSIS_RESTING_HEIGHT, SPAWN_POSITION, WORLD_BOUNDS } from "./craftPhysics.ts";

/**
 * Geometry invariants: relationships between numbers, never the numbers.
 *
 * This world once passed a typecheck, a lint, 494 unit tests, 48 end-to-end
 * tests and a production build while being impossible to play — a trench across
 * the only route south, a sea narrower than the box the craft could move in,
 * updraft columns buried inside the islands they fed. Every one was a
 * relationship between two values that each looked reasonable in its own file,
 * which is exactly what a per-module test and a "did the canvas mount" e2e test
 * both miss.
 *
 * Most of those relationships no longer exist, because the geometry they lived
 * in was cut. What remains is the set that still governs whether a visitor can
 * drive to a room.
 */
describe("the craft starts somewhere it can survive", () => {
  const [sx, sy, sz] = SPAWN_POSITION;

  it("spawns clear of its own suspension travel", () => {
    // At 1.5 it spawned 0.23m above its resting height, penetrated the ground
    // on the first physics step and came to rest UNDER the world: upright, in
    // bounds, invisible to every recovery check it had.
    expect(sy - TERRAIN.mainland.groundY).toBeGreaterThan(CHASSIS_RESTING_HEIGHT * 1.5);
  });

  it("spawns on the desk, not over an edge", () => {
    expect(Math.abs(sx)).toBeLessThan(TERRAIN.mainland.halfWidth);
    expect(sz).toBeGreaterThan(TERRAIN.mainland.z0);
    expect(sz).toBeLessThan(TERRAIN.mainland.z1);
  });
});

describe("the bounds contain the desk", () => {
  it("never recovers a craft that is still on the surface", () => {
    // A bounds box tighter than the ground would teleport a driver mid-corner.
    expect(WORLD_BOUNDS.minX).toBeLessThan(-TERRAIN.mainland.halfWidth);
    expect(WORLD_BOUNDS.maxX).toBeGreaterThan(TERRAIN.mainland.halfWidth);
    expect(WORLD_BOUNDS.minZ).toBeLessThan(TERRAIN.mainland.z0);
    expect(WORLD_BOUNDS.maxZ).toBeGreaterThan(TERRAIN.mainland.z1);
  });
});

describe("every room is somewhere a car can reach", () => {
  it("places all eight on the desk, inside the kerb", () => {
    // The whole job of this world. A room off the surface is a room that
    // cannot be entered, and the grid view would still list it — the exact
    // silent-divergence failure worldData.test.ts guards from the other side.
    for (const p of PLACEMENTS) {
      const [x, , z] = p.position;
      expect(Math.abs(x), p.to).toBeLessThan(TERRAIN.mainland.halfWidth - 1);
      expect(z, p.to).toBeGreaterThan(TERRAIN.mainland.z0 + 1);
      expect(z, p.to).toBeLessThan(TERRAIN.mainland.z1 - 1);
    }
  });

  it("spaces them so one pavilion's approach cannot sit inside another's", () => {
    for (let i = 0; i < PLACEMENTS.length; i++) {
      for (let j = i + 1; j < PLACEMENTS.length; j++) {
        const a = PLACEMENTS[i].position;
        const b = PLACEMENTS[j].position;
        const gap = Math.hypot(a[0] - b[0], a[2] - b[2]);
        expect(gap, `${PLACEMENTS[i].to} vs ${PLACEMENTS[j].to}`).toBeGreaterThan(8);
      }
    }
  });
});
