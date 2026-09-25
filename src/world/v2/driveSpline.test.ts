import { describe, expect, it } from "vitest";
import { DRIFT_SPEED, IDLE_TIMEOUT_MS, spawnState, step, type HodiInput } from "./driveSpline.ts";
import { riverWidthAtZ, riverX, sangamBasin } from "./valley.ts";

/** Deterministic PRNG (mulberry32) — a fixed seed makes the 10,000-run
 *  property test reproducible across CI runs, the same reason hash.ts's own
 *  tests pin their inputs rather than using Math.random. */
function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function distanceToSpline(x: number, z: number): number {
  return Math.abs(x - riverX(z));
}

/** Independent of driveSpline.ts's own (private) clampToChannel — reads the
 *  same valley.ts geometry the implementation does, but recomputes
 *  containment from scratch so this isn't a tautology about the clamp
 *  running, it's a check against the real polygon definition. */
function isInsidePolygon(x: number, z: number): boolean {
  const basin = sangamBasin();
  if (Math.hypot(x - basin.x, z - basin.z) <= basin.r) return true;
  return distanceToSpline(x, z) <= riverWidthAtZ(z) / 2;
}

const NO_REDUCED_MOTION = { reducedMotion: false };
const REDUCED_MOTION = { reducedMotion: true };
const DT = 1 / 20;

describe("driveSpline: containment", () => {
  it("10,000 seeded random input sequences never leave the spline polygon", () => {
    const rand = mulberry32(20260924);
    for (let run = 0; run < 10_000; run++) {
      let state = spawnState(-100);
      for (let i = 0; i < 6; i++) {
        const input: HodiInput = { steer: rand() * 2 - 1, throttle: rand() * 2 - 1 };
        state = step(state, input, DT, NO_REDUCED_MOTION);
        expect(isInsidePolygon(state.x, state.z)).toBe(true);
      }
    }
  });

  it("break-it: an unclamped position off the centreline fails containment (G15)", () => {
    // Proves isInsidePolygon (and so the property test above) actually
    // fails on a real violation, not just on nothing to catch.
    const z = -100;
    const wayOffCentre = riverX(z) + riverWidthAtZ(z);
    expect(isInsidePolygon(wayOffCentre, z)).toBe(false);
  });
});

describe("driveSpline: idle drift", () => {
  const idleInput: HodiInput = { steer: 0, throttle: 0 };

  it("idle 6s -> drift speed 1.2 +- 0.05 m/s downstream", () => {
    let state = spawnState(-100);
    let elapsedMs = 0;
    while (elapsedMs < IDLE_TIMEOUT_MS + 500) {
      state = step(state, idleInput, DT, NO_REDUCED_MOTION);
      elapsedMs += DT * 1000;
    }
    expect(state.autopilot).toBe(true);
    expect(state.speed).toBeGreaterThanOrEqual(DRIFT_SPEED - 0.05);
    expect(state.speed).toBeLessThanOrEqual(DRIFT_SPEED + 0.05);
  });

  it("reducedMotion true -> no drift", () => {
    let state = spawnState(-100);
    const z0 = state.z;
    let elapsedMs = 0;
    while (elapsedMs < IDLE_TIMEOUT_MS + 2000) {
      state = step(state, idleInput, DT, REDUCED_MOTION);
      elapsedMs += DT * 1000;
    }
    expect(state.autopilot).toBe(false);
    expect(state.speed).toBe(0);
    expect(state.z).toBe(z0);
  });

  it("a real steer/throttle input resets the idle timer instead of drifting", () => {
    let state = spawnState(-100);
    let elapsedMs = 0;
    while (elapsedMs < IDLE_TIMEOUT_MS - 100) {
      state = step(state, idleInput, DT, NO_REDUCED_MOTION);
      elapsedMs += DT * 1000;
    }
    // One real keystroke just before the timeout — must not have engaged
    // autopilot, and idleMs must have been cut back to (about) zero.
    state = step(state, { steer: 1, throttle: 0 }, DT, NO_REDUCED_MOTION);
    expect(state.autopilot).toBe(false);
    expect(state.idleMs).toBeLessThan(50);
  });
});

describe("driveSpline: C1 autopilot stays on the spline", () => {
  it("over 60 simulated seconds of autopilot the maximum distance from the boat to the spline stays below the bank half-width at every sample", () => {
    // Spawned well upstream of the Sangam basin: 60s at 1.2 m/s is ~72m of
    // travel, nowhere near the confluence, so this test is purely about the
    // river-band case the acceptance line names ("below the bank
    // half-width"), not the basin's separate polygon.
    let state = spawnState(-150);
    const idleInput: HodiInput = { steer: 0, throttle: 0 };

    let rampMs = 0;
    while (rampMs < IDLE_TIMEOUT_MS) {
      state = step(state, idleInput, DT, NO_REDUCED_MOTION);
      rampMs += DT * 1000;
    }
    expect(state.autopilot).toBe(true);

    let simulatedS = 0;
    let maxDistance = 0;
    while (simulatedS < 60) {
      state = step(state, idleInput, DT, NO_REDUCED_MOTION);
      simulatedS += DT;
      const halfWidth = riverWidthAtZ(state.z) / 2;
      const distance = distanceToSpline(state.x, state.z);
      maxDistance = Math.max(maxDistance, distance);
      expect(distance).toBeLessThan(halfWidth);
    }
    expect(maxDistance).toBeGreaterThanOrEqual(0);
  });
});
