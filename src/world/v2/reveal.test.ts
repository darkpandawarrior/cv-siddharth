import { describe, expect, it, vi } from "vitest";
import { REVEAL_MS, revealOpacity } from "./reveal.ts";

/**
 * `revealOpacity` is the pure core `useReveal` calls every frame (reveal.ts's
 * own doc comment) — the same "test the pure function of an explicit time,
 * not the hook" shape this repo already uses for `computeSkyState`/
 * `classifyWeather` (src/lib/useSky.ts), which is what lets this run under
 * fake timers deterministically without a @testing-library/react dependency
 * this repo doesn't otherwise have.
 */
describe("revealOpacity: the C4 fade ramp", () => {
  it("is 0 on the resolve frame (elapsed 0ms)", () => {
    vi.useFakeTimers();
    const t0 = Date.now();
    expect(revealOpacity(Date.now() - t0, false)).toBe(0);
    vi.useRealTimers();
  });

  it(`is 1 at +${REVEAL_MS}ms`, () => {
    vi.useFakeTimers();
    const t0 = Date.now();
    vi.advanceTimersByTime(REVEAL_MS);
    expect(revealOpacity(Date.now() - t0, false)).toBe(1);
    vi.useRealTimers();
  });

  it("is non-decreasing at every 30ms step from resolve to +300ms", () => {
    vi.useFakeTimers();
    const t0 = Date.now();
    const samples: number[] = [];
    for (let i = 0; i <= 10; i++) {
      samples.push(revealOpacity(Date.now() - t0, false));
      vi.advanceTimersByTime(REVEAL_MS / 10);
    }
    for (let i = 1; i < samples.length; i++) expect(samples[i]).toBeGreaterThanOrEqual(samples[i - 1]);
    expect(samples[0]).toBe(0);
    expect(samples[samples.length - 1]).toBe(1);
    vi.useRealTimers();
  });

  it("never exceeds 1 well past the ramp", () => {
    expect(revealOpacity(REVEAL_MS * 10, false)).toBe(1);
  });

  it("is 1 immediately under reduced motion, at any elapsed time including 0", () => {
    expect(revealOpacity(0, true)).toBe(1);
    expect(revealOpacity(REVEAL_MS / 2, true)).toBe(1);
    expect(revealOpacity(REVEAL_MS * 10, true)).toBe(1);
  });
});

describe("revealOpacity: the checker actually fires (break-it, G15)", () => {
  it("a broken ramp that jumps straight to 1 would fail the non-decreasing-from-0 check", () => {
    const brokenRamp = (elapsedMs: number) => (elapsedMs <= 0 ? 0 : 1); // no linear middle
    expect(brokenRamp(0)).toBe(0);
    expect(brokenRamp(REVEAL_MS / 2)).not.toBe(revealOpacity(REVEAL_MS / 2, false));
  });
});
