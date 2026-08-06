import { describe, expect, it } from "vitest";
import { TrackFilter, accuracyPct, canyonFactor, rawFix, stepDistance } from "./gps.ts";

/**
 * The location lens has to actually be the thing it claims to demonstrate.
 *
 * If the "dead reckoned" trail were not measurably better than the raw one,
 * the world would be illustrating a number the site puts on its front page with
 * a filter that does nothing — which would be worse than not showing it at all.
 * These tests hold the demo to the claim.
 */

const STRUCTURES = [{ x: 10, z: 0 }];

describe("the raw fix behaves like a real receiver", () => {
  it("is deterministic for a given sample, so a parked craft does not shimmer", () => {
    const a = rawFix({ x: 5, z: 5 }, 42, STRUCTURES);
    const b = rawFix({ x: 5, z: 5 }, 42, STRUCTURES);
    expect(a).toEqual(b);
  });

  it("degrades near tall structures, and not in the open", () => {
    expect(canyonFactor(60, 60, STRUCTURES)).toBe(1);
    expect(canyonFactor(10, 0, STRUCTURES)).toBeGreaterThan(3);
    // ...and worsens as you close in, rather than switching on at a boundary.
    expect(canyonFactor(12, 0, STRUCTURES)).toBeLessThan(canyonFactor(10.5, 0, STRUCTURES));
  });
});

describe("the filter earns its place", () => {
  /** Drives a straight line at `speed` m/s and returns each track's errors. */
  function run(speed = 2.5): { raw: number[]; filtered: number[]; rate: number } {
    const filter = new TrackFilter();
    const raw: number[] = [];
    const filtered: number[] = [];
    let previous = { x: 0, z: 0 };
    for (let i = 0; i < 240; i++) {
      const step = speed * 0.1;
      const truth = { x: 0, z: i * step };
      const fix = rawFix(truth, i, STRUCTURES);
      // Dead reckoning with a DELIBERATELY IMPERFECT prediction — a small
      // heading bias and a speed error, which is what the real thing has.
      //
      // The first version of this test carried the estimate forward at the
      // exact true velocity, so the prediction was flawless and the filter
      // could lean on it entirely. That hid a failure worth more than the test:
      // with a real (drifting) prediction and a weak gain, the track wandered
      // off and scored 1% accuracy in the browser while this file stayed green.
      const predicted = {
        x: previous.x + step * 0.04,
        z: previous.z + step * 0.97,
      };
      const estimate = filter.update(fix, predicted, Math.max(3, step * 2.5));
      previous = estimate;
      raw.push(Math.hypot(fix.x - truth.x, fix.z - truth.z));
      filtered.push(Math.hypot(estimate.x - truth.x, estimate.z - truth.z));
    }
    return { raw, filtered, rate: filter.acceptanceRate() };
  }

  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

  it("makes the track more accurate than the raw fixes", () => {
    const { raw, filtered } = run();
    expect(mean(filtered)).toBeLessThan(mean(raw));
  });

  it("STILL beats the raw fix at speed, where a lagging filter loses", () => {
    // The regression that shipped: a plain low-pass looked excellent at walking
    // pace and was WORSE than doing nothing at driving speed, because its lag
    // grows with velocity while the noise it removes does not. The world drives
    // at 15-20 m/s, so that is where this has to hold.
    for (const speed of [8, 15, 22]) {
      const { raw, filtered } = run(speed);
      expect(mean(filtered), `at ${speed} m/s`).toBeLessThan(mean(raw));
    }
  });

  it("moves accuracy in the direction the site claims", () => {
    // The headline is 50% -> 95%. This does not have to hit those exact
    // numbers — it is a toy world, not the app — but the filtered track must
    // land materially higher than the raw one or the demo is a lie.
    const { raw, filtered } = run();
    const rawPct = accuracyPct(raw);
    const filteredPct = accuracyPct(filtered);
    expect(filteredPct).toBeGreaterThan(rawPct);
    expect(filteredPct).toBeGreaterThanOrEqual(90);
  });

  it("rejects spikes rather than smoothing them in", () => {
    const filter = new TrackFilter();
    filter.update({ x: 0, z: 0 }, { x: 0, z: 0 }, 3);
    const afterSpike = filter.update({ x: 40, z: 0 }, { x: 0, z: 1 }, 3);
    // Coasted on the prediction, nowhere near the 40m outlier.
    expect(afterSpike.x).toBeLessThan(1);
    expect(filter.acceptanceRate()).toBeLessThan(1);
  });

  it("does not let dead-reckoning drift run away", () => {
    // With an imperfect prediction the estimate must stay anchored to reality
    // rather than compounding its own error — the failure that scored 1%.
    const { filtered } = run(15);
    expect(Math.max(...filtered)).toBeLessThan(8);
  });

  it("recovers when it anchors on a bad first fix instead of locking itself out", () => {
    // THE divergence bug, as a test. Anchor the filter on a 20m outlier, then
    // feed it a long run of perfectly good fixes: it must find its way back.
    // Before the re-anchor rule it rejected 96% of fixes forever, because every
    // correct fix looked like an outlier next to its own bad estimate.
    const filter = new TrackFilter();
    filter.update({ x: 20, z: 0 }, { x: 20, z: 0 }, 3); // bad anchor
    let estimate = { x: 20, z: 0 };
    for (let i = 0; i < 40; i++) {
      estimate = filter.update({ x: 0, z: i * 0.2 }, { x: estimate.x, z: estimate.z + 0.2 }, 2);
    }
    expect(Math.abs(estimate.x), "never recovered from the bad anchor").toBeLessThan(2);
    expect(filter.acceptanceRate()).toBeGreaterThan(0.5);
  });

  it("reports 100% accuracy for an empty track rather than dividing by zero", () => {
    expect(accuracyPct([])).toBe(100);
  });
});

describe("the odometer", () => {
  it("measures ground actually covered", () => {
    expect(stepDistance({ x: 0, z: 0 }, { x: 3, z: 4 })).toBe(5);
  });
});
