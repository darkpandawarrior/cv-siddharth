import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { latLonToXyz, vLen } from "./cameraMath.ts";
import {
  finishIntro,
  getIntroPhase,
  hasSeenIntro,
  introStartDirection,
  introStartDirectionFromLatLon,
  markIntroSeen,
  resetIntroForTest,
  shouldPlayIntro,
  skipIntro,
  startIntro,
  subscribeIntro,
} from "./cameraIntro.ts";

// ponytail: stub localStorage rather than pull in jsdom -- same pattern as
// src/lib/excelsiorProgress.test.ts. vitest's own environment is plain node,
// where `localStorage` is undefined unless stubbed.
const store = new Map<string, string>();
const g = globalThis as Record<string, unknown>;
const had = "localStorage" in g;

beforeEach(() => {
  resetIntroForTest();
  store.clear();
  g.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  };
});

afterAll(() => {
  if (!had) delete g.localStorage;
});

describe("seen-flag", () => {
  it("is false until markIntroSeen, then true", () => {
    expect(hasSeenIntro()).toBe(false);
    markIntroSeen();
    expect(hasSeenIntro()).toBe(true);
  });

  it("survives a broken or absent localStorage without throwing", () => {
    g.localStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
    };
    expect(() => hasSeenIntro()).not.toThrow();
    expect(hasSeenIntro()).toBe(false);

    delete g.localStorage;
    expect(() => markIntroSeen()).not.toThrow();
    expect(hasSeenIntro()).toBe(false);
  });
});

describe("shouldPlayIntro", () => {
  it("plays only at tier 1/2, motion allowed, not yet seen", () => {
    expect(shouldPlayIntro(1, false)).toBe(true);
    expect(shouldPlayIntro(2, false)).toBe(true);
    expect(shouldPlayIntro(3, false)).toBe(false);
    expect(shouldPlayIntro(1, true)).toBe(false);
  });

  it("never replays once seen", () => {
    markIntroSeen();
    expect(shouldPlayIntro(1, false)).toBe(false);
  });
});

describe("intro phase bus", () => {
  it("starts idle, moves to playing, and marks seen on finish", () => {
    expect(getIntroPhase()).toBe("idle");
    startIntro();
    expect(getIntroPhase()).toBe("playing");
    expect(hasSeenIntro()).toBe(false);
    finishIntro();
    expect(getIntroPhase()).toBe("done");
    expect(hasSeenIntro()).toBe(true);
  });

  it("skip marks seen and notifies subscribers exactly once", () => {
    const cb = vi.fn();
    const unsubscribe = subscribeIntro(cb);
    startIntro();
    skipIntro();
    expect(getIntroPhase()).toBe("skipped");
    expect(hasSeenIntro()).toBe(true);
    expect(cb).toHaveBeenCalledTimes(2); // playing, then skipped
    unsubscribe();
    finishIntro(); // no-op from "skipped"; must not notify after unsubscribe either way
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("finish/skip from idle is a no-op", () => {
    finishIntro();
    expect(getIntroPhase()).toBe("idle");
    skipIntro();
    expect(getIntroPhase()).toBe("idle");
  });
});

describe("introStartDirection", () => {
  it("is a unit vector halfway (great-circle) between sun and the end direction", () => {
    const sun: [number, number] = [0, 0];
    const end = latLonToXyz(0, 90);
    const start = introStartDirection(latLonToXyz(...sun), end);
    expect(vLen(start)).toBeCloseTo(1, 6);
    // Halfway on the equator between lon 0 and lon 90 is lon 45.
    const expected = latLonToXyz(0, 45);
    expect(start.x).toBeCloseTo(expected.x, 4);
    expect(start.z).toBeCloseTo(expected.z, 4);
  });

  it("the lat/lon convenience wrapper matches the vector form", () => {
    const end = latLonToXyz(18.52 + 12, 73.86);
    const a = introStartDirectionFromLatLon(-5, 40, end);
    const b = introStartDirection(latLonToXyz(-5, 40), end);
    expect(a).toEqual(b);
  });
});
