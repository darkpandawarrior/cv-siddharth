import { describe, expect, it } from "vitest";
import { CANVAS_LAYERS, HUD_LAYERS, resolveLayers } from "./layers.ts";

function FixtureA() {
  return null;
}
function FixtureB() {
  return null;
}
function FixtureNoContract() {
  return null;
}

describe("resolveLayers: a fixture layer file is discovered and ordered", () => {
  it("picks up every module exporting both default and layer, sorted by order", () => {
    const modules = {
      "./layers/second.tsx": { default: FixtureB, layer: { id: "b", order: 20 } },
      "./layers/first.tsx": { default: FixtureA, layer: { id: "a", order: 5 } },
      // A stray file with no `layer` export — glob-matched but not a real
      // layer (e.g. a shared helper co-located under the directory). Must
      // be skipped, not thrown on.
      "./layers/helper.tsx": { default: FixtureNoContract },
    };
    const layers = resolveLayers(modules, "canvas");
    expect(layers.map((l) => l.id)).toEqual(["a", "b"]);
    expect(layers.map((l) => l.order)).toEqual([5, 20]);
    expect(layers[0].kind).toBe("canvas");
    expect(layers[0].Component).toBe(FixtureA);
  });

  it("returns an empty array for an empty glob result", () => {
    expect(resolveLayers({}, "hud")).toEqual([]);
  });

  it("throws on two layers sharing an id (a real authoring mistake, not a runtime condition to hide)", () => {
    const modules = {
      "./layers/one.tsx": { default: FixtureA, layer: { id: "dup", order: 1 } },
      "./layers/two.tsx": { default: FixtureB, layer: { id: "dup", order: 2 } },
    };
    expect(() => resolveLayers(modules, "canvas")).toThrow(/duplicate layer id "dup"/);
  });
});

describe("the real glob wiring", () => {
  it("CANVAS_LAYERS and HUD_LAYERS are arrays (empty until a phase-3/4 lane or P2-10b adds a file)", () => {
    expect(Array.isArray(CANVAS_LAYERS)).toBe(true);
    expect(Array.isArray(HUD_LAYERS)).toBe(true);
  });
});
