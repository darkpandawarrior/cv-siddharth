import { describe, expect, it } from "vitest";
import {
  PLACEMENTS,
  TERRAIN,
  WATER_PLANE,
  WATER_SENSOR_HALF_EXTENTS,
  atollWaterlineRadius,
  tiltedSlabCenterY,
} from "./worldData.ts";
import {
  CHASSIS_RESTING_HEIGHT,
  SPAWN_POSITION,
  WORLD_BOUNDS,
  hullTerminalSpeed,
} from "./craftPhysics.ts";

/**
 * Geometry invariants — the checks that would have caught every bug this world
 * shipped with.
 *
 * The world passed a typecheck, a lint, 494 unit tests, 48 end-to-end tests and
 * a production build while being physically impossible to play: a trench across
 * the only route south, a sea narrower than the box the craft may move in,
 * updraft columns buried inside the islands they were meant to lift you off,
 * and room sensors sunk inside rock no craft could climb. Every one of those is
 * a relationship BETWEEN two numbers that each looked perfectly reasonable in
 * its own file, which is precisely the class of defect a per-module unit test
 * cannot see and a "does the canvas mount" e2e test cannot see either.
 *
 * So these tests assert relationships, never values. None of them care that the
 * mainland is 42m wide; they care that the shore starts exactly where it ends.
 */

const waterZ0 = WATER_PLANE.centerZ - WATER_PLANE.depth / 2;
const waterZ1 = WATER_PLANE.centerZ + WATER_PLANE.depth / 2;
const waterHalfWidth = WATER_PLANE.width / 2;

const atolls = PLACEMENTS.filter((p) => p.medium === "water");

describe("the ground is continuous", () => {
  it("hands off from mainland to shore with no gap and no overlap", () => {
    // A gap is a trench that swallows the craft; an overlap is a lip it hits
    // nose-first. Equality is the only value that is neither.
    expect(TERRAIN.shore.z0).toBe(TERRAIN.mainland.z1);
  });

  it("surfaces the full width of the coast", () => {
    // Shore strips narrower than the mainland leave notches at each end where
    // a craft hugging the edge drives into open air instead of down a slope.
    expect(TERRAIN.shore.xMin).toBeLessThanOrEqual(-TERRAIN.mainland.halfWidth);
    expect(TERRAIN.shore.xMax).toBeGreaterThanOrEqual(TERRAIN.mainland.halfWidth);
  });

  it("keeps the launch ramp inside the shore it is cut into", () => {
    const rampX0 = TERRAIN.shore.rampCenterX - TERRAIN.shore.rampWidth / 2;
    const rampX1 = TERRAIN.shore.rampCenterX + TERRAIN.shore.rampWidth / 2;
    expect(rampX0).toBeGreaterThanOrEqual(TERRAIN.shore.xMin);
    expect(rampX1).toBeLessThanOrEqual(TERRAIN.shore.xMax);
  });
});

describe("the ground has no steps in it", () => {
  const THICKNESS = 1; // Terrain's BOX_THICKNESS

  it("starts the shore's driving surface exactly at the mainland's height", () => {
    // The bug this exists for: the shore slabs were positioned by their CENTRE
    // line, which put the surface you drive on half a slab higher than the
    // layout said — a 0.5m step across the whole map at z=12, where every run
    // south crosses. It flipped the craft at speed and it was invisible to the
    // z-extent checks above, which is exactly why surface height needs its own
    // assertion.
    const { groundY } = TERRAIN.mainland;
    const run = TERRAIN.shore.z1 - TERRAIN.shore.z0;
    const centerY = tiltedSlabCenterY(groundY, 0, run, THICKNESS);
    const angle = -Math.atan2(0 - groundY, run);
    const topAtStart = centerY + (THICKNESS / 2) * Math.cos(angle) + (run / 2) * Math.sin(angle);
    expect(topAtStart).toBeCloseTo(groundY, 2);
  });

  it("meets the water at sea level, not above it", () => {
    const run = TERRAIN.shore.z1 - TERRAIN.shore.z0;
    const centerY = tiltedSlabCenterY(TERRAIN.mainland.groundY, 0, run, THICKNESS);
    const angle = -Math.atan2(0 - TERRAIN.mainland.groundY, run);
    const topAtEnd = centerY + (THICKNESS / 2) * Math.cos(angle) - (run / 2) * Math.sin(angle);
    expect(topAtEnd).toBeCloseTo(0, 2);
  });
});

describe("the craft starts somewhere it can survive", () => {
  const [sx, sy, sz] = SPAWN_POSITION;

  it("spawns clear of its own suspension travel", () => {
    // At 1.5 the craft spawned 0.23m above its own resting height, penetrated
    // the mainland on the first physics step, fell through, and came to rest
    // pinned under the map by buoyancy — upright and in bounds, so no recovery
    // check could see it. The world booted into that state and every gate
    // still passed.
    const clearance = sy - TERRAIN.mainland.groundY;
    expect(clearance).toBeGreaterThan(CHASSIS_RESTING_HEIGHT * 1.5);
  });

  it("spawns on the mainland, not over the edge of it", () => {
    expect(Math.abs(sx)).toBeLessThan(TERRAIN.mainland.halfWidth);
    expect(sz).toBeGreaterThan(TERRAIN.mainland.z0);
    expect(sz).toBeLessThan(TERRAIN.mainland.z1);
  });

  it("spawns far enough from the north edge to survive a held key", () => {
    // Even with the kerb in place, a spawn a couple of metres from a sheer
    // drop means the first thing a visitor does — hold a key to see what
    // happens — is the thing that strands them.
    expect(sz - TERRAIN.mainland.z0).toBeGreaterThan(8);
  });
});

describe("the sea covers everywhere the craft may go", () => {
  it("draws water under the whole bounds box", () => {
    // Buoyancy is a depth test, not a contact test, so a craft floats wherever
    // it is below sea level — including places the water mesh doesn't reach.
    // If the bounds box escapes the mesh, "floating on visible nothing" is
    // reachable and nothing respawns you, because you are still in bounds.
    expect(WORLD_BOUNDS.minZ).toBeGreaterThan(waterZ0);
    expect(WORLD_BOUNDS.maxZ).toBeLessThan(waterZ1);
    expect(WORLD_BOUNDS.minX).toBeGreaterThan(-waterHalfWidth);
    expect(WORLD_BOUNDS.maxX).toBeLessThan(waterHalfWidth);
  });

  it("lets the craft leave the mainland in every direction before it leaves the map", () => {
    expect(WORLD_BOUNDS.minZ).toBeLessThan(TERRAIN.mainland.z0);
    expect(WORLD_BOUNDS.maxZ).toBeGreaterThan(TERRAIN.shore.z1);
    expect(WORLD_BOUNDS.minX).toBeLessThan(-TERRAIN.mainland.halfWidth);
    expect(WORLD_BOUNDS.maxX).toBeGreaterThan(TERRAIN.mainland.halfWidth);
  });
});

describe("the water rooms are enterable", () => {
  it("extends their sensors past the waterline, where a craft can actually be", () => {
    // The atoll flank above the water is far too steep for hull thrust to
    // climb, and hull mode only becomes wheels once the chassis centre clears
    // sea level — which buoyancy alone never achieves. So the craft cannot get
    // on top of an atoll, and a sensor sized to the pavilion sits entirely
    // inside rock the visitor can never reach.
    for (const atoll of atolls) {
      expect(WATER_SENSOR_HALF_EXTENTS[0]).toBeGreaterThan(atollWaterlineRadius(atoll.position[1]));
    }
  });
});

describe("the craft can cross what the course asks it to", () => {
  it("sails fast enough that the strait is a crossing, not a wait", () => {
    // 0.74 m/s made the 35m strait a 47-second hold-W: technically passable,
    // realistically never finished.
    expect(hullTerminalSpeed()).toBeGreaterThan(2);
  });

});
