import { describe, it, expect } from "vitest";
import {
  baselineTicks,
  deviationsFor,
  hitTest,
  decayAlpha,
  rippleY,
  withRipple,
  pruneRipples,
  hazeFromAqi,
  ambientAlpha,
  didChange,
  didRise,
  didIncrease,
  stateFlips,
  didNewPush,
  didAircraftArrive,
  MAX_RIPPLES,
  type Ripple,
} from "./railGeometry";
import type { Facet } from "../data/facets";

const f = (id: string, authored: string): Facet => ({
  id, label: id, to: `/${id}`, authored, discovered: authored,
  paths: ["deep"], kind: "work",
});

describe("baselineTicks", () => {
  it("spaces ticks evenly down the height", () => {
    expect(baselineTicks(100, 25)).toEqual([0, 25, 50, 75, 100]);
  });

  it("returns a single tick when the rail is shorter than one spacing", () => {
    expect(baselineTicks(10, 25)).toEqual([0]);
  });

  it("refuses a non-positive spacing rather than looping forever", () => {
    expect(() => baselineTicks(100, 0)).toThrow();
  });

  it("stops at the last exact multiple when spacing does not divide height", () => {
    expect(baselineTicks(100, 30)).toEqual([0, 30, 60, 90]);
  });

  it("handles float spacing without silent rounding errors", () => {
    expect(baselineTicks(100, 0.1).length).toBe(1001);
  });

  it("returns a single tick for negative height", () => {
    expect(baselineTicks(-5, 25)).toEqual([0]);
  });
});

describe("deviationsFor", () => {
  it("places the oldest facet at the top pad and the newest at height minus pad", () => {
    const out = deviationsFor([f("new", "2026-01-01"), f("old", "2020-01-01")], 200, 20);
    expect(out[0]).toEqual({ id: "old", y: 20 });
    expect(out[1]).toEqual({ id: "new", y: 180 });
  });

  it("centres a lone facet", () => {
    expect(deviationsFor([f("only", "2020-01-01")], 200, 20)).toEqual([{ id: "only", y: 100 }]);
  });

  it("returns nothing for no facets", () => {
    expect(deviationsFor([], 200, 20)).toEqual([]);
  });
});

describe("hitTest", () => {
  const devs = [{ id: "a", y: 50 }, { id: "b", y: 150 }];

  it("returns the id within tolerance", () => {
    expect(hitTest(devs, 54, 8)).toBe("a");
  });

  it("returns null outside tolerance", () => {
    expect(hitTest(devs, 100, 8)).toBe(null);
  });

  it("returns the nearest when two are in range", () => {
    expect(hitTest([{ id: "a", y: 50 }, { id: "b", y: 56 }], 55, 8)).toBe("b");
  });

  it("returns the earlier entry when two are equidistant", () => {
    expect(hitTest([{ id: "first", y: 50 }, { id: "second", y: 60 }], 55, 8)).toBe("first");
  });
});

const ripple = (over: Partial<Ripple> = {}): Ripple => ({
  id: "r", bornAtMs: 0, colorToken: "--color-signal", label: "CI: pass", y: 10, ...over,
});

describe("decayAlpha", () => {
  it("is 1 at birth and 0 once fully decayed", () => {
    expect(decayAlpha(0, 1800)).toBe(1);
    expect(decayAlpha(1800, 1800)).toBe(0);
  });

  it("never goes negative past its decay window", () => {
    expect(decayAlpha(5000, 1800)).toBe(0);
  });

  it("fades linearly in between", () => {
    expect(decayAlpha(900, 1800)).toBeCloseTo(0.5);
  });
});

describe("rippleY", () => {
  it("holds a fixed y when there is no yTo", () => {
    expect(rippleY(ripple({ y: 40 }), 900, 1800)).toBe(40);
  });

  it("interpolates toward yTo across the decay window for a travelling ripple", () => {
    expect(rippleY(ripple({ y: 0, yTo: 100 }), 900, 1800)).toBeCloseTo(50);
    expect(rippleY(ripple({ y: 0, yTo: 100 }), 0, 1800)).toBe(0);
    expect(rippleY(ripple({ y: 0, yTo: 100 }), 1800, 1800)).toBe(100);
  });
});

describe("withRipple", () => {
  it("appends without mutating the input buffer", () => {
    const buf: Ripple[] = [];
    const next = withRipple(buf, ripple());
    expect(buf).toEqual([]);
    expect(next).toHaveLength(1);
  });

  it("caps at MAX_RIPPLES, dropping the oldest first", () => {
    let buf: Ripple[] = [];
    for (let i = 0; i < MAX_RIPPLES + 2; i++) buf = withRipple(buf, ripple({ id: `r${i}` }));
    expect(buf).toHaveLength(MAX_RIPPLES);
    expect(buf[0].id).toBe("r2");
  });
});

describe("pruneRipples", () => {
  it("removes only fully-decayed entries, in place", () => {
    const buf = [ripple({ id: "old", bornAtMs: 0 }), ripple({ id: "new", bornAtMs: 1000 })];
    pruneRipples(buf, 2000, 1800);
    expect(buf.map((r) => r.id)).toEqual(["new"]);
  });
});

describe("hazeFromAqi", () => {
  it("contributes nothing when air data is absent", () => {
    expect(hazeFromAqi(null)).toBe(0);
    expect(hazeFromAqi(undefined)).toBe(0);
  });

  it("scales up to its 0.06 ceiling", () => {
    expect(hazeFromAqi(0)).toBe(0);
    expect(hazeFromAqi(300)).toBeCloseTo(0.06);
  });
});

describe("ambientAlpha", () => {
  it("stays within the spec's [0.22, 0.34] band", () => {
    for (let t = 0; t < 40000; t += 1000) {
      const a = ambientAlpha(t, 0, false);
      expect(a).toBeGreaterThanOrEqual(0.22);
      expect(a).toBeLessThanOrEqual(0.34);
    }
  });

  it("freezes at the mean under reduced motion, still haze-dimmed", () => {
    expect(ambientAlpha(12345, 0, true)).toBeCloseTo(0.28);
    expect(ambientAlpha(12345, 0.06, true)).toBeCloseTo(0.22);
  });
});

describe("didChange", () => {
  it("fires only when both sides are known and differ", () => {
    expect(didChange("a", "b")).toBe(true);
    expect(didChange("a", "a")).toBe(false);
    expect(didChange(null, "a")).toBe(false);
    expect(didChange(undefined, "a")).toBe(false);
  });
});

describe("didRise", () => {
  it("fires only on false -> true", () => {
    expect(didRise(false, true)).toBe(true);
    expect(didRise(true, false)).toBe(false);
    expect(didRise(null, true)).toBe(false);
  });
});

describe("didIncrease", () => {
  it("fires only on a strict increase with a known prior value", () => {
    expect(didIncrease(1, 2)).toBe(true);
    expect(didIncrease(2, 2)).toBe(false);
    expect(didIncrease(2, 1)).toBe(false);
    expect(didIncrease(null, 2)).toBe(false);
  });
});

describe("stateFlips", () => {
  it("returns keys whose state differs between snapshots", () => {
    const prev = { a: { state: "pass" }, b: { state: "pass" } };
    const next = { a: { state: "fail" }, b: { state: "pass" } };
    expect(stateFlips(prev, next)).toEqual(["a"]);
  });

  it("ignores a key seen for the first time", () => {
    expect(stateFlips({}, { a: { state: "fail" } })).toEqual([]);
  });

  it("returns nothing without a prior snapshot", () => {
    expect(stateFlips(null, { a: { state: "fail" } })).toEqual([]);
  });
});

describe("didNewPush", () => {
  it("fires when a push timestamp wasn't seen before", () => {
    expect(didNewPush([{ at: "t1" }], [{ at: "t1" }, { at: "t2" }])).toBe(true);
  });

  it("is silent on the first-ever snapshot", () => {
    expect(didNewPush(null, [{ at: "t1" }])).toBe(false);
  });

  it("is silent when nothing new appears", () => {
    expect(didNewPush([{ at: "t1" }], [{ at: "t1" }])).toBe(false);
  });
});

describe("didAircraftArrive", () => {
  it("fires when the count grows", () => {
    expect(didAircraftArrive([{ cs: "A" }], [{ cs: "A" }, { cs: "B" }])).toBe(true);
  });

  it("fires when a new callsign replaces one at the same count", () => {
    expect(didAircraftArrive([{ cs: "A" }], [{ cs: "B" }])).toBe(true);
  });

  it("is silent on a departure", () => {
    expect(didAircraftArrive([{ cs: "A" }, { cs: "B" }], [{ cs: "A" }])).toBe(false);
  });

  it("is silent on the first-ever snapshot", () => {
    expect(didAircraftArrive(null, [{ cs: "A" }])).toBe(false);
  });
});
