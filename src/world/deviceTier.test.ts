import { describe, expect, it } from "vitest";
import { computeTier, tierBudget, deviceTier, resetDeviceTierForTest } from "./deviceTier.ts";

// computeTier is the pure §10 test — asserted as relationships (a throttled
// desktop still lands at tier 3; a fast phone lands at tier 2; a fast
// desktop lands at tier 1) rather than pinned to one literal input, so this
// never needs updating if THROTTLE_BUDGET_MS is ever retuned.
describe("computeTier", () => {
  it("throttle dominates viewport — a slow desktop is still tier 3", () => {
    expect(computeTier({ phone: false, benchMs: 500 })).toBe(3);
  });

  it("a slow phone is also tier 3, not tier 2 — the drops are cumulative", () => {
    expect(computeTier({ phone: true, benchMs: 500 })).toBe(3);
  });

  it("a fast phone is tier 2", () => {
    expect(computeTier({ phone: true, benchMs: 5 })).toBe(2);
  });

  it("a fast desktop is tier 1", () => {
    expect(computeTier({ phone: false, benchMs: 5 })).toBe(1);
  });
});

describe("tierBudget", () => {
  it("escalates every budget monotonically from tier 1 to tier 3 — never a tier 3 that is LESS conservative than tier 2", () => {
    const b1 = tierBudget(1);
    const b2 = tierBudget(2);
    const b3 = tierBudget(3);
    expect(b2.speckleCount).toBeLessThanOrEqual(b1.speckleCount);
    expect(b3.speckleCount).toBeLessThanOrEqual(b2.speckleCount);
    expect(b3.groundSegments[0] * b3.groundSegments[1]).toBeLessThanOrEqual(b1.groundSegments[0] * b1.groundSegments[1]);
    expect(b3.dprMax).toBeLessThanOrEqual(b2.dprMax);
    // Fog is pulled in (both numbers shrink), never pushed out.
    expect(b2.fogNearFar[1]).toBeLessThanOrEqual(b1.fogNearFar[1]);
  });

  it("never returns a non-positive budget", () => {
    for (const tier of [1, 2, 3] as const) {
      const b = tierBudget(tier);
      expect(b.speckleCount).toBeGreaterThan(0);
      expect(b.dprMax).toBeGreaterThan(0);
      for (const v of b.groundSegments) expect(v).toBeGreaterThan(0);
      for (const v of b.fogNearFar) expect(v).toBeGreaterThan(0);
    }
  });
});

describe("deviceTier()", () => {
  it("memoises — a second call in the same session never re-probes", () => {
    resetDeviceTierForTest();
    const first = deviceTier();
    const second = deviceTier();
    expect(second).toBe(first);
  });

  it("falls back to tier 1 off-browser rather than throwing (vitest's default node environment)", () => {
    resetDeviceTierForTest();
    expect(() => deviceTier()).not.toThrow();
    expect(deviceTier()).toBe(1);
  });
});
