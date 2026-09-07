import { afterEach, describe, expect, it, vi } from "vitest";
import { prefersReducedMotion, resetReducedMotionForTest } from "./reducedMotion.ts";

describe("prefersReducedMotion", () => {
  afterEach(() => {
    resetReducedMotionForTest();
    vi.unstubAllGlobals();
  });

  it("reads matchMedia once and memoises the result across calls", () => {
    const matchMedia = vi.fn().mockReturnValue({ matches: true });
    vi.stubGlobal("window", { matchMedia });

    expect(prefersReducedMotion()).toBe(true);
    expect(prefersReducedMotion()).toBe(true);
    expect(matchMedia).toHaveBeenCalledTimes(1); // memoised — never re-probed
  });

  it("is false when matchMedia reports no reduced-motion preference", () => {
    vi.stubGlobal("window", { matchMedia: vi.fn().mockReturnValue({ matches: false }) });
    expect(prefersReducedMotion()).toBe(false);
  });

  it("resetReducedMotionForTest forces a fresh probe", () => {
    vi.stubGlobal("window", { matchMedia: vi.fn().mockReturnValue({ matches: true }) });
    expect(prefersReducedMotion()).toBe(true);
    resetReducedMotionForTest();
    vi.stubGlobal("window", { matchMedia: vi.fn().mockReturnValue({ matches: false }) });
    expect(prefersReducedMotion()).toBe(false);
  });
});
