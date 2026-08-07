import { describe, it, expect } from "vitest";
import {
  BASE_LINEAR_DAMPING,
  CHASSIS_MASS,
  CHASSIS_RESTING_HEIGHT,
  ENGINE_FORCE,
  SPAWN_POSITION,
  TERMINAL_WHEEL_SPEED,
  WORLD_BOUNDS,
} from "./craftPhysics.ts";

/**
 * What is left to test once the world is a desk you drive a car on.
 *
 * This file held a four-mode state machine, a lift model and a buoyancy model,
 * and most of the world's soft-locks lived in the states those created. There
 * is no mode to be in now, so there is no transition table to assert — only the
 * handful of constants that mean something in relation to each other.
 */
describe("the car's numbers hang together", () => {
  it("reaches a speed worth having on a boulevard this long", () => {
    // Tightened to [18, 22] now that the slab is a 168m, ten-year traverse
    // rather than a 30m desk: too slow and the drive is tedious, too fast and
    // ten years of city blur past in a couple of seconds — the design doc's
    // own bar is an 8.6s flat-out crossing, which needs a speed in this band.
    expect(TERMINAL_WHEEL_SPEED).toBeGreaterThan(18);
    expect(TERMINAL_WHEEL_SPEED).toBeLessThan(22);
  });

  it("derives top speed from the two constants that set it", () => {
    expect(TERMINAL_WHEEL_SPEED).toBeCloseTo(
      (2 * ENGINE_FORCE) / (CHASSIS_MASS * BASE_LINEAR_DAMPING),
      5,
    );
  });

  it("spawns clear of the craft's own suspension travel", () => {
    // The bug this remembers: at 1.5 the craft spawned inside its own
    // suspension, penetrated the ground on the first physics step and came to
    // rest UNDER the world — upright, in bounds, invisible to every recovery
    // check it had.
    expect(SPAWN_POSITION[1]).toBeGreaterThan(CHASSIS_RESTING_HEIGHT * 1.5);
  });

  it("spawns inside the bounds that would otherwise recover it", () => {
    const [x, y, z] = SPAWN_POSITION;
    expect(x).toBeGreaterThan(WORLD_BOUNDS.minX);
    expect(x).toBeLessThan(WORLD_BOUNDS.maxX);
    expect(z).toBeGreaterThan(WORLD_BOUNDS.minZ);
    expect(z).toBeLessThan(WORLD_BOUNDS.maxZ);
    expect(y).toBeLessThan(WORLD_BOUNDS.maxY);
  });
});
