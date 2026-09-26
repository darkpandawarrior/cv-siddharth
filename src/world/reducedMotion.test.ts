import { afterEach, describe, expect, it, vi } from "vitest";
import { prefersReducedMotion, resetReducedMotionForTest } from "./reducedMotion.ts";

describe("prefersReducedMotion", () => {
  afterEach(() => {
    resetReducedMotionForTest();
    vi.unstubAllGlobals();
  });

  it("reads matchMedia live — no session cache", () => {
    const matchMedia = vi.fn().mockReturnValue({ matches: true });
    vi.stubGlobal("window", { matchMedia });

    expect(prefersReducedMotion()).toBe(true);
    expect(prefersReducedMotion()).toBe(true);
    // Every call is a fresh matchMedia read — the banned pattern this file
    // exists to rule out is exactly a probe that runs once and never again.
    expect(matchMedia).toHaveBeenCalledTimes(2);
  });

  it("is false when matchMedia reports no reduced-motion preference", () => {
    vi.stubGlobal("window", { matchMedia: vi.fn().mockReturnValue({ matches: false }) });
    expect(prefersReducedMotion()).toBe(false);
  });

  it("reflects a preference change on the very next call — no reset needed", () => {
    vi.stubGlobal("window", { matchMedia: vi.fn().mockReturnValue({ matches: true }) });
    expect(prefersReducedMotion()).toBe(true);
    vi.stubGlobal("window", { matchMedia: vi.fn().mockReturnValue({ matches: false }) });
    expect(prefersReducedMotion()).toBe(false);
  });
});
