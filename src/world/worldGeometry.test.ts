import { describe, expect, it } from "vitest";
import {
  CHECKPOINTS,
  PLACEMENTS,
  TERRAIN,
  THERMALS,
  WATER_PLANE,
  WATER_SENSOR_HALF_EXTENTS,
  atollWaterlineRadius,
} from "./worldData.ts";
import {
  CHASSIS_RESTING_HEIGHT,
  LAUNCH_SPEED,
  SPACE_ALTITUDE,
  SPAWN_POSITION,
  STALL_SPEED,
  TERMINAL_WHEEL_SPEED,
  WORLD_BOUNDS,
  hullTerminalSpeed,
  levelFlightSpeed,
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
const skyIslands = PLACEMENTS.filter((p) => p.medium === "air");

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

describe("the air leg is enterable", () => {
  it("stands every thermal column in open water, clear of the atolls", () => {
    // THE regression this file exists for. When each column sat directly on an
    // atoll, every point inside it at sea level was solid rock — and the column
    // is (correctly) disabled while grounded, so the only place it could be
    // entered was the one place it never fires. The air leg was unreachable and
    // the finding that "fixed" it by shrinking the radius made it worse.
    for (const thermal of THERMALS) {
      const [tx, , tz] = thermal.position;
      for (const atoll of atolls) {
        const [ax, ay, az] = atoll.position;
        const gap = Math.hypot(tx - ax, tz - az);
        expect(gap).toBeGreaterThan(thermal.radius + atollWaterlineRadius(ay));
      }
    }
  });

  it("puts a sky island above every column, and stops the column short of it", () => {
    for (const thermal of THERMALS) {
      const [tx, , tz] = thermal.position;
      const island = skyIslands.find((p) => p.position[0] === tx && p.position[2] === tz);
      // A column that feeds no island lifts you into empty sky; an island with
      // no column under it cannot be reached at all.
      expect(island, `no sky island above thermal at ${tx},${tz}`).toBeDefined();
      const underside = island!.position[1] - TERRAIN.skyIsland.thickness;
      // Cutting the force off below the slab lets the craft coast the last
      // metre. Pushing it right up to the underside is a bounce loop, not a
      // landing.
      expect(thermal.ceilingY).toBeLessThan(underside);
    }
  });

  it("keeps each column narrow enough to sit under the island it feeds", () => {
    for (const thermal of THERMALS) {
      expect(thermal.radius).toBeLessThanOrEqual(TERRAIN.skyIsland.half + 4);
    }
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

  it("can stay in the air once it gets there", () => {
    // The launch threshold has to be ABOVE the speed needed to sustain flight,
    // or the craft transitions to wings already sinking and splashes down every
    // time regardless of how it is flown. It was 14 vs 18 — every launch was a
    // guaranteed descent, and the air leg was arithmetically impossible while
    // looking completely implemented.
    expect(levelFlightSpeed()).toBeLessThan(LAUNCH_SPEED);
    // ...and stalling still has to mean something, or "flight" is just hovering.
    expect(STALL_SPEED).toBeLessThan(levelFlightSpeed());
  });

  it("can reach the speed its own ramp demands", () => {
    expect(TERMINAL_WHEEL_SPEED).toBeGreaterThan(LAUNCH_SPEED);
  });

  it("puts space far above anything reachable by accident", () => {
    // Sky islands are the highest ordinary geometry; orbit has to be a
    // deliberate climb beyond them, not somewhere you arrive by mistake.
    const highestIsland = Math.max(...skyIslands.map((p) => p.position[1]));
    expect(SPACE_ALTITUDE).toBeGreaterThan(highestIsland * 1.5);
  });

  it("routes every checkpoint inside the bounds box", () => {
    for (const checkpoint of CHECKPOINTS) {
      const [x, , z] = checkpoint.position;
      expect(x).toBeGreaterThan(WORLD_BOUNDS.minX);
      expect(x).toBeLessThan(WORLD_BOUNDS.maxX);
      expect(z).toBeGreaterThan(WORLD_BOUNDS.minZ);
      expect(z).toBeLessThan(WORLD_BOUNDS.maxZ);
    }
  });

  it("finishes on a sky island, having passed through all three media", () => {
    // The course's whole justification is that no single mode can complete it.
    const finish = CHECKPOINTS[CHECKPOINTS.length - 1];
    const island = skyIslands.find(
      (p) => p.position[0] === finish.position[0] && p.position[2] === finish.position[2],
    );
    expect(island, "the final checkpoint is not on a sky island").toBeDefined();
    expect(CHECKPOINTS.some((c) => c.position[1] < 1)).toBe(true); // a sea-level leg
    expect(CHECKPOINTS.some((c) => c.position[1] > 5 && c.position[1] < 30)).toBe(true); // an airborne leg
  });
});
