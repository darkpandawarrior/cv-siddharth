import { afterEach, describe, expect, it, vi } from "vitest";
import { computeTier, isSoftwareRenderer, tierBudget, deviceTier, resetDeviceTierForTest } from "./deviceTier.ts";

// computeTier is the pure §10 test — asserted as relationships (a throttled
// desktop still lands at tier 3; a fast phone lands at tier 2; a fast
// desktop lands at tier 1) rather than pinned to one literal input, so this
// never needs updating if THROTTLE_BUDGET_MS is ever retuned.
describe("computeTier", () => {
  it("throttle dominates viewport — a slow desktop is still tier 3", () => {
    expect(computeTier({ phone: false, benchMs: 500, softwareRenderer: false })).toBe(3);
  });

  it("a slow phone is also tier 3, not tier 2 — the drops are cumulative", () => {
    expect(computeTier({ phone: true, benchMs: 500, softwareRenderer: false })).toBe(3);
  });

  it("a fast phone is tier 2", () => {
    expect(computeTier({ phone: true, benchMs: 5, softwareRenderer: false })).toBe(2);
  });

  it("a fast desktop is tier 1", () => {
    expect(computeTier({ phone: false, benchMs: 5, softwareRenderer: false })).toBe(1);
  });
});

describe("isSoftwareRenderer", () => {
  it.each([
    "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)",
    "llvmpipe (LLVM 15.0.7, 256 bits)", "Microsoft Basic Render Driver",
    "SOFTPIPE", "Mesa swrast", "lavapipe", "Software Rasterizer", "Microsoft WARP",
  ])("recognises %s", (renderer) => {
    expect(isSoftwareRenderer(renderer)).toBe(true);
  });

  it.each(["", "ANGLE (NVIDIA GeForce RTX 4070)", "Apple M3", "Mesa Intel(R) UHD Graphics", "AMD Radeon RX 6800"])("keeps %s on hardware budgets", (renderer) => {
    expect(isSoftwareRenderer(renderer)).toBe(false);
  });

  it.each([false, true])("software rendering dominates a fast CPU (phone=%s)", (phone) => {
    expect(computeTier({ phone, benchMs: 5, softwareRenderer: true })).toBe(3);
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
    // §10 drop 2 — the lit map halves (both dimensions) and its upload rate
    // drops, on the phone tier, and tier 3 never re-inflates it.
    expect(b2.litMapSize[0] * b2.litMapSize[1]).toBeLessThanOrEqual(b1.litMapSize[0] * b1.litMapSize[1]);
    expect(b3.litMapSize[0] * b3.litMapSize[1]).toBeLessThanOrEqual(b2.litMapSize[0] * b2.litMapSize[1]);
    expect(b2.litMapHz).toBeLessThanOrEqual(b1.litMapHz);
    expect(b3.litMapHz).toBeLessThanOrEqual(b2.litMapHz);
    // Phase 5 — ghost read-lines drop from 4 to 2 on the phone tier (§10),
    // and tier 3 keeps that drop rather than re-inflating it.
    expect(b2.ghostReadlineCap).toBeLessThanOrEqual(b1.ghostReadlineCap);
    expect(b3.ghostReadlineCap).toBeLessThanOrEqual(b2.ghostReadlineCap);
  });

  it("never returns a non-positive budget", () => {
    for (const tier of [1, 2, 3] as const) {
      const b = tierBudget(tier);
      expect(b.speckleCount).toBeGreaterThan(0);
      expect(b.dprMax).toBeGreaterThan(0);
      for (const v of b.groundSegments) expect(v).toBeGreaterThan(0);
      for (const v of b.fogNearFar) expect(v).toBeGreaterThan(0);
      for (const v of b.litMapSize) expect(v).toBeGreaterThan(0);
      expect(b.litMapHz).toBeGreaterThan(0);
      expect(b.ghostReadlineCap).toBeGreaterThan(0);
    }
  });
});

describe("deviceTier()", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetDeviceTierForTest();
  });

  it.each([1, 2, 3] as const)("honours an explicit test tier %s before probing", (tier) => {
    vi.stubGlobal("window", { __DEVICE_TIER_TEST__: tier });
    resetDeviceTierForTest();
    expect(deviceTier()).toBe(tier);
    expect(deviceTier()).toBe(tier);
  });

  it.each([true, false])("reads the renderer once and releases the probe (debug extension=%s)", (debugAvailable) => {
    const loseContext = vi.fn();
    const getParameter = vi.fn(() => "SwiftShader");
    const getExtension = vi.fn((name: string) => name === "WEBGL_debug_renderer_info"
      ? debugAvailable ? { UNMASKED_RENDERER_WEBGL: 37446 } : null
      : { loseContext });
    const getContext = vi.fn(() => ({ RENDERER: 7937, getParameter, getExtension }));
    const createElement = vi.fn(() => ({ getContext }));
    vi.stubGlobal("document", { createElement });
    vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) });
    vi.stubGlobal("performance", { now: () => 0 });
    resetDeviceTierForTest();
    expect(deviceTier()).toBe(3);
    expect(deviceTier()).toBe(3);
    expect(createElement).toHaveBeenCalledOnce();
    expect(getParameter).toHaveBeenCalledExactlyOnceWith(debugAvailable ? 37446 : 7937);
    expect(loseContext).toHaveBeenCalledOnce();
  });

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
