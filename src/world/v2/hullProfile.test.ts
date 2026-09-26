import { describe, expect, it } from "vitest";
import hullProfile from "./hullProfile.json" with { type: "json" };

/**
 * master-plan.md#M44: hullProfile.json is the analytic half-beam single
 * source, read by the water shader here (waterShader.glsl.ts's wake term)
 * and, later, by P2-07d's Blender hull script. This test only pins the
 * two properties every reader relies on — a real hull boundary curve is
 * exactly this: widest at midship, tapering to both ends, mirror-symmetric
 * because nothing in this lane gives bow and stern different widths.
 */
describe("hullProfile.json", () => {
  const samples = hullProfile.samples as unknown as readonly [number, number][];

  it("has samples spanning the full [-1, 1] hull length", () => {
    expect(samples.length).toBeGreaterThan(10);
    expect(samples[0][0]).toBe(-1);
    expect(samples[samples.length - 1][0]).toBe(1);
    // Sorted ascending by t — every reader (this shader, the Blender script)
    // can walk it in order without re-sorting.
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i][0]).toBeGreaterThan(samples[i - 1][0]);
    }
  });

  it("is symmetric about midship (t=0)", () => {
    for (const [t, halfBeam] of samples) {
      const mirror = samples.find((s) => Math.abs(s[0] + t) < 1e-9);
      expect(mirror).toBeDefined();
      expect(mirror![1]).toBeCloseTo(halfBeam, 9);
    }
  });

  it("is non-increasing from midship to both ends", () => {
    const positiveHalf = samples.filter(([t]) => t >= 0).sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < positiveHalf.length; i++) {
      expect(positiveHalf[i][1]).toBeLessThanOrEqual(positiveHalf[i - 1][1]);
    }
    const negativeHalf = samples.filter(([t]) => t <= 0).sort((a, b) => a[0] - b[0]);
    // Walking from z=0 outward (i.e. reverse order, |t| increasing) must
    // also be non-increasing.
    for (let i = negativeHalf.length - 2; i >= 0; i--) {
      expect(negativeHalf[i][1]).toBeLessThanOrEqual(negativeHalf[i + 1][1]);
    }
  });

  it("never goes negative or wider than midship", () => {
    const midshipHalfBeam = samples.find(([t]) => t === 0)![1];
    for (const [, halfBeam] of samples) {
      expect(halfBeam).toBeGreaterThanOrEqual(0);
      expect(halfBeam).toBeLessThanOrEqual(midshipHalfBeam);
    }
  });

  it("break-it: a monotonicity violation fails the non-increasing check (G15)", () => {
    const broken: [number, number][] = [
      [0, 0.85],
      [0.05, 0.9], // wider further from midship — must be caught
      [1, 0],
    ];
    const positiveHalf = broken.filter(([t]) => t >= 0).sort((a, b) => a[0] - b[0]);
    let violated = false;
    for (let i = 1; i < positiveHalf.length; i++) {
      if (positiveHalf[i][1] > positiveHalf[i - 1][1]) violated = true;
    }
    expect(violated).toBe(true);
  });
});
