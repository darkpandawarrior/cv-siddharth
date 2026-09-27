import { describe, expect, it } from "vitest";
import type { Feature } from "./worldModel.ts";
import {
  BAORI_GATE_IDS,
  BELL_ARCHETYPES,
  baoriInnermostReady,
  bellTotal,
  bellToranBinding,
  bridgeBinding,
  dooriBinding,
  facetsFor,
  gaddiBinding,
  twinChhatriBinding,
  yantraBinding,
} from "./landmarkBindings.ts";

/** A minimal `landmark-facet` feature - only the fields these bindings
 *  actually read (`id`, `rule`, `scalar`), the rest padded to satisfy
 *  `Feature`'s shape. */
function facet(landmark: string, field: string, scalar: number): Feature {
  return {
    id: `landmark-facet:${landmark}:${field}`,
    rule: "landmark-facet",
    form: "landmark-facet",
    pos: [0, 0, 0],
    scalar,
    state: "lit",
    label: `${landmark} ${field}: ${scalar}`,
    date: null,
  };
}

describe("facetsFor", () => {
  it("reads only the named landmark's own facets, never src/data (WorldModel features only)", () => {
    const features = [facet("bridge", "voussoirs", 18), facet("doori", "steps", 13)];
    expect(facetsFor(features, "bridge").get("voussoirs")).toBe(18);
    expect(facetsFor(features, "bridge").get("steps")).toBeUndefined();
  });

  it("break-it: a feature under a different rule id is never picked up as a landmark facet", () => {
    const notAFacet: Feature = { ...facet("bridge", "voussoirs", 99), rule: "pr-stone" };
    expect(facetsFor([notAFacet], "bridge").size).toBe(0);
  });
});

describe("bridgeBinding", () => {
  it("reads voussoirs/piers/deckLamps off the bridge's own G14 facets", () => {
    const features = [facet("bridge", "voussoirs", 18), facet("bridge", "piers", 20), facet("bridge", "deckLamps", 43)];
    expect(bridgeBinding(features)).toEqual({ voussoirs: 18, piers: 20, deckLamps: 43 });
  });

  it("defaults every field to 0 when grammar.ts has not run yet (no facets present)", () => {
    expect(bridgeBinding([])).toEqual({ voussoirs: 0, piers: 0, deckLamps: 0 });
  });
});

describe("dooriBinding", () => {
  it("reads steps/pillarBands, and stays honestly unmeasured for the schema ring", () => {
    const features = [facet("doori", "steps", 13), facet("doori", "pillarBands", 12)];
    const binding = dooriBinding(features);
    expect(binding.steps).toBe(13);
    expect(binding.pillarBands).toBe(12);
    expect(binding.schemaMeasured).toBe(false);
    expect(binding.schemaVersion).toBeNull();
  });
});

describe("gaddiBinding", () => {
  it("reads steps off gaddi's own facet", () => {
    expect(gaddiBinding([facet("gaddi", "steps", 15)])).toEqual({ steps: 15 });
  });
});

describe("bellToranBinding / bellTotal", () => {
  it("maps every archetype's own facet field and sums to the total", () => {
    const features = [
      facet("paymentslab-kmp", "bellsNative", 15),
      facet("paymentslab-kmp", "bellsHosted", 44),
      facet("paymentslab-kmp", "bellsMobileMoney", 7),
      facet("paymentslab-kmp", "bellsInternal", 1),
      facet("paymentslab-kmp", "bellsStub", 3),
    ];
    const bells = bellToranBinding(features);
    for (const a of BELL_ARCHETYPES) expect(typeof bells[a]).toBe("number");
    expect(bells).toEqual({ native: 15, hosted: 44, mobileMoney: 7, internal: 1, stub: 3 });
    expect(bellTotal(bells)).toBe(70);
  });
});

describe("twinChhatriBinding", () => {
  it("is unmeasured (null) when no facet exists - the documented ledger gap", () => {
    expect(twinChhatriBinding([])).toEqual({ inlayTiles: null });
  });

  it("reads a real count the day a landmark-facet:portfolio:testFiles feature exists", () => {
    expect(twinChhatriBinding([facet("portfolio", "testFiles", 231)])).toEqual({ inlayTiles: 231 });
  });
});

describe("yantraBinding", () => {
  it("carries the azimuth through unchanged", () => {
    expect(yantraBinding(123.45, 8).azimuthDeg).toBe(123.45);
  });

  it("sunUp is true only above the horizon", () => {
    expect(yantraBinding(0, 8).sunUp).toBe(true);
    expect(yantraBinding(0, 0).sunUp).toBe(false);
    expect(yantraBinding(0, -5).sunUp).toBe(false);
  });
});

describe("baoriInnermostReady", () => {
  const [level1, level2, level3] = BAORI_GATE_IDS;

  it("is false with nothing touched yet", () => {
    expect(baoriInnermostReady([])).toBe(false);
  });

  it("is true once all three gate levels were touched in the documented order", () => {
    expect(baoriInnermostReady([level1, level2, level3])).toBe(true);
  });

  it("stays true with unrelated touches interleaved, as long as relative order holds", () => {
    expect(baoriInnermostReady(["something-else", level1, "another", level2, level3])).toBe(true);
  });

  it("break-it: is false when the levels are touched out of order (WORLD-9's own 'reversing is the bug')", () => {
    expect(baoriInnermostReady([level2, level1, level3])).toBe(false);
    expect(baoriInnermostReady([level1, level3, level2])).toBe(false);
  });

  it("is false when only some levels were touched", () => {
    expect(baoriInnermostReady([level1, level2])).toBe(false);
  });

  it("re-touching an earlier level after a later one breaks the order (touch() moves it to the end)", () => {
    // useTouched()'s own semantics move a re-touched id to the end of the
    // list - simulated here directly rather than through sessionRipple.ts's
    // module-scope state, which this pure test has no browser to run in.
    expect(baoriInnermostReady([level1, level2, level3, level1])).toBe(true); // innermost already fired once; still holds
    expect(baoriInnermostReady([level2, level1, level3])).toBe(false);
  });
});
