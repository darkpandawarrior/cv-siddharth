import { describe, expect, it } from "vitest";
import { DynamicResolution, SCALE_CEIL, SCALE_FLOOR } from "./dynamicResolution.ts";

/**
 * world-v2-spec.md §8's own hysteresis, pinned by feeding scripted
 * frame-time sequences and checking the exact scale/action/cooldown this
 * file's own algorithm produces. Every sequence below is worked out by
 * hand against `dynamicResolution.ts`'s rules (never against a second,
 * parallel reimplementation of the same formula) so a real regression in
 * the source, not just a drifted test, is what would fail this file.
 */

describe("warm-up: no action inside the first 90 frames, at any frame time", () => {
  it("stays at scale 1 for 90 terrible frames", () => {
    const dr = new DynamicResolution();
    let last;
    for (let i = 0; i < 90; i++) last = dr.tick(200);
    expect(last).toEqual({ scale: 1, frame: 90, action: "none", cooldownMs: 0 });
  });
});

describe("a sustained bad average triggers downscale-high (avg > 45 ms) as soon as the window is real", () => {
  it("frame 91: window is 91 frames of 50 ms, avg 50 > 45 -> x0.84", () => {
    const dr = new DynamicResolution();
    let last;
    for (let i = 0; i < 91; i++) last = dr.tick(50);
    expect(last).toEqual({ scale: 0.84, frame: 91, action: "downscale-high", cooldownMs: 8000 });
  });

  it("the 8 s cooldown blocks re-evaluation until it drains, then the same bad average triggers again", () => {
    const dr = new DynamicResolution();
    for (let i = 0; i < 91; i++) dr.tick(50); // triggers at frame 91, cooldownMs = 8000
    // 8000 ms / 50 ms per frame = 160 frames of cooldown, so frames 92-250
    // (159 of them) all decrement the cooldown and stay "none".
    for (let i = 0; i < 159; i++) {
      const snap = dr.tick(50);
      expect(snap.action).toBe("none");
      expect(snap.scale).toBe(0.84);
    }
    // Frame 251 is the 160th cooldown tick: it drains the last 50 ms
    // (cooldown was 50, becomes 0) but STILL returns "none" -- the cooldown
    // check runs before the decrement, so hitting exactly 0 this tick does
    // not yet re-arm evaluation for THIS tick.
    const frame251 = dr.tick(50);
    expect(frame251).toEqual({ scale: 0.84, frame: 251, action: "none", cooldownMs: 0 });
    // Frame 252: cooldownMs is 0 on entry, so it re-evaluates. The window
    // is still 60 frames of 50 ms (avg 50), so it fires again -- and
    // 0.84*0.84 = 0.7056 is already below the 0.72 floor, so this second
    // hit is clamped there rather than reaching the raw product.
    const frame252 = dr.tick(50);
    expect(frame252).toEqual({ scale: SCALE_FLOOR, frame: 252, action: "downscale-high", cooldownMs: 8000 });
  });

  it("scale never drops below the 0.72 floor, and once pinned there a further bad frame is a no-op (no wasted cooldown)", () => {
    const dr = new DynamicResolution();
    // Enough 50 ms frames to blow well past the floor across several
    // trigger-then-cooldown cycles: warm-up (90) + several hundred more.
    let last;
    for (let i = 0; i < 2000; i++) last = dr.tick(50);
    expect(last!.scale).toBe(SCALE_FLOOR);
    // Pinned at the floor with a constant bad average: every further frame
    // is a guarded no-op, so the cooldown is never re-armed and the action
    // reads "none" (not a repeating "downscale-high" that never actually
    // moves the number).
    expect(last!.action).toBe("none");
    expect(last!.cooldownMs).toBe(0);
  });
});

describe("a scripted mixed sequence: warm-up, a gradual regression into downscale-low, then recovery via upscale", () => {
  it("produces the exact scale/action/cooldown at every hand-checked frame", () => {
    const dr = new DynamicResolution();

    // Phase 1 -- 150 frames at 16 ms. Warm-up (1-90) is always "none".
    // 91-150 evaluate a window that is ALL 16 ms (avg 16 < 17.6, which
    // would normally upscale) but the scale is already at the 1.0 ceiling,
    // so every one of these is a guarded no-op: "none", scale stays 1.
    let last;
    for (let i = 0; i < 150; i++) last = dr.tick(16);
    expect(last).toEqual({ scale: SCALE_CEIL, frame: 150, action: "none", cooldownMs: 0 });

    // Phase 2 -- 60 frames at 50 ms. The 60-frame window drains its 16 ms
    // history one frame at a time, so the rolling average climbs linearly:
    // after k phase-2 frames, avg = ((60-k)*16 + k*50) / 60. It first
    // crosses the 23.5 ms low threshold at k = 14 (avg = 1436/60 =
    // 23.9333...), landing in the LOW branch (avg < 45): x0.92.
    for (let k = 1; k <= 13; k++) {
      const snap = dr.tick(50);
      expect(snap.action, `k=${k}`).toBe("none");
      expect(snap.scale, `k=${k}`).toBe(1);
    }
    const k14 = dr.tick(50);
    expect(k14).toEqual({ scale: 0.92, frame: 164, action: "downscale-low", cooldownMs: 8000 });

    // The remaining 46 frames of phase 2 (k=15..60) are cooldown-blocked:
    // scale holds at 0.92, cooldownMs counts down by 50 ms per frame.
    let cooldown = 8000;
    for (let k = 15; k <= 60; k++) {
      cooldown -= 50;
      const snap = dr.tick(50);
      expect(snap.action, `k=${k}`).toBe("none");
      expect(snap.scale, `k=${k}`).toBe(0.92);
      expect(snap.cooldownMs, `k=${k}`).toBe(cooldown);
    }
    expect(cooldown).toBe(5700); // 8000 - 46*50

    // Phase 3 -- fast 10 ms frames. The remaining 5700 ms of cooldown
    // drains in 570 more frames (5700 / 10); the window is also fully
    // refilled with 10 ms values well before that. The 571st phase-3 frame
    // is the first with cooldownMs == 0 on entry, so it re-evaluates: avg
    // 10 < 17.6 -> upscale, +0.05.
    for (let n = 1; n <= 570; n++) {
      const snap = dr.tick(10);
      expect(snap.action, `n=${n}`).toBe("none");
      expect(snap.scale, `n=${n}`).toBe(0.92);
    }
    const n571 = dr.tick(10);
    expect(n571.frame).toBe(781);
    expect(n571.action).toBe("upscale");
    expect(n571.cooldownMs).toBe(2500);
    // 0.92 + 0.05 in IEEE-754 double precision is 0.9700000000000001, not a
    // literal 0.97 -- the same float this file's own `+=` produces, so this
    // is the honest comparison rather than a rounded one.
    expect(n571.scale).toBeCloseTo(0.97, 10);
  });
});

describe("reset()", () => {
  it("returns to frame 0, scale 1, no cooldown", () => {
    const dr = new DynamicResolution();
    for (let i = 0; i < 200; i++) dr.tick(60);
    dr.reset();
    expect(dr.currentScale).toBe(SCALE_CEIL);
    expect(dr.frameCount).toBe(0);
    const snap = dr.tick(60);
    expect(snap).toEqual({ scale: 1, frame: 1, action: "none", cooldownMs: 0 });
  });
});
