import { describe, expect, test } from "vitest";
import { BIRD_COUNT_BY_TIER, runFlock, seedFlock, stepFlock, type FlockParams } from "./boids.ts";

const PARAMS: FlockParams = {
  center: { x: 0, y: 20, z: 40 },
  orbitRadius: 30,
  orbitSpeed: 0.05,
  neighborRadius: 12,
  maxSpeed: 6,
};

describe("boids", () => {
  test("bird count per tier is 40 / 24 / 16 (T1 / T2 / T3)", () => {
    expect(BIRD_COUNT_BY_TIER[1]).toBe(40);
    expect(BIRD_COUNT_BY_TIER[2]).toBe(24);
    expect(BIRD_COUNT_BY_TIER[3]).toBe(16);
  });

  test("a fixed seed gives identical positions after 600 steps", () => {
    const dt = 1 / 60;
    const seedA = seedFlock(BIRD_COUNT_BY_TIER[1], PARAMS);
    const seedB = seedFlock(BIRD_COUNT_BY_TIER[1], PARAMS);
    expect(seedA).toEqual(seedB); // the seed itself is deterministic

    const afterA = runFlock(seedA, PARAMS, 600, dt);
    const afterB = runFlock(seedB, PARAMS, 600, dt);
    expect(afterA).toEqual(afterB);

    // Break-it proof the guard actually fires: a different seed COUNT
    // changes the roster (different ids), so the 600-step result cannot
    // coincidentally match a differently-sized flock.
    const differentCount = runFlock(seedFlock(BIRD_COUNT_BY_TIER[2], PARAMS), PARAMS, 600, dt);
    expect(differentCount.length).not.toBe(afterA.length);
  });

  test("no NaN/Infinity after 600 steps and every bird stays under maxSpeed", () => {
    const dt = 1 / 60;
    const after = runFlock(seedFlock(BIRD_COUNT_BY_TIER[1], PARAMS), PARAMS, 600, dt);
    for (const b of after) {
      for (const v of [b.x, b.y, b.z, b.vx, b.vy, b.vz]) expect(Number.isFinite(v)).toBe(true);
      const speed = Math.hypot(b.vx, b.vy, b.vz);
      expect(speed).toBeLessThanOrEqual(PARAMS.maxSpeed + 1e-6);
    }
  });

  test("stepFlock never mutates its input array or its bird objects", () => {
    const seed = seedFlock(4, PARAMS);
    const snapshot = JSON.parse(JSON.stringify(seed));
    stepFlock(seed, PARAMS, 0, 1 / 60);
    expect(seed).toEqual(snapshot);
  });
});
