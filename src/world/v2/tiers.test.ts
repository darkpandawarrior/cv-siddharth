import { describe, expect, it, vi } from "vitest";
import { Material, Object3D, PerspectiveCamera } from "three";
import { TIER_MATRIX, showsCaustics, showsLampShafts, showsVolumetric } from "./tiers.ts";
import { VOLUMETRIC_HG_G, VOLUMETRIC_RESOLUTION_SCALE, VOLUMETRIC_STEPS } from "./Volumetric.ts";
import { warmupScene } from "./layers/Warmup.tsx";

/**
 * This lane's own flexible test file: its `owns` list (master-plan.json)
 * only grants two test files, `tiers.test.ts` and `dynamicResolution.test.ts`
 * — no dedicated `Volumetric.test.ts` or `Warmup.test.ts` exists to add.
 * Every acceptance item that names "a unit test on Volumetric.ts" or
 * exercises `Warmup.tsx`'s pure logic lives here instead, sectioned by
 * module below, rather than in a new file this lane is not allowed to add
 * (master-plan.md's own G2 ownership gate).
 */

describe("TIER_MATRIX matches world-v2-spec.md §8's table, cell for cell", () => {
  it("T1 desktop", () => {
    expect(TIER_MATRIX[1]).toEqual({
      dprMax: 2,
      resScaleMin: 0.72,
      resScaleMax: 1,
      shadowMapSize: 4096,
      terrainGrid: 512,
      terrainHeightmap: 1025,
      textureSize: 1024,
      textureNormalMapMaxDistM: null,
      water: "planar",
      waterNormalLayers: 2,
      volumetrics: "raymarch26",
      bloomMips: 6,
      smaa: true,
      foliagePercent: 100,
      particles: [2400, 1800, 800],
      frameCapFps: null,
    });
  });

  it("T2 phone", () => {
    expect(TIER_MATRIX[2]).toEqual({
      dprMax: 1.5,
      resScaleMin: 0.75,
      resScaleMax: 0.75,
      shadowMapSize: 2048,
      terrainGrid: 256,
      terrainHeightmap: 513,
      textureSize: 512,
      textureNormalMapMaxDistM: null,
      water: "pmrem",
      waterNormalLayers: 1,
      volumetrics: "analytic",
      bloomMips: 4,
      smaa: false,
      foliagePercent: 40,
      particles: [600, 500, 0],
      frameCapFps: null,
    });
  });

  it("T3 throttled", () => {
    expect(TIER_MATRIX[3]).toEqual({
      dprMax: 1,
      resScaleMin: 0.6,
      resScaleMax: 0.6,
      shadowMapSize: null,
      terrainGrid: 256,
      terrainHeightmap: null,
      textureSize: 512,
      textureNormalMapMaxDistM: 18,
      water: "pmrem",
      waterNormalLayers: 1,
      volumetrics: "analytic",
      bloomMips: null,
      smaa: false,
      foliagePercent: 25,
      particles: [0, 200, 0],
      frameCapFps: 30,
    });
  });
});

describe("the three gating cells this lane owns (master-plan.md#M67)", () => {
  it("caustics: T1 only", () => {
    expect(showsCaustics(1)).toBe(true);
    expect(showsCaustics(2)).toBe(false);
    expect(showsCaustics(3)).toBe(false);
  });

  it("volumetric: T1 only", () => {
    expect(showsVolumetric(1)).toBe(true);
    expect(showsVolumetric(2)).toBe(false);
    expect(showsVolumetric(3)).toBe(false);
  });

  it("lamp shafts: T1 only at night, T2/T3 always", () => {
    expect(showsLampShafts(1, false)).toBe(false);
    expect(showsLampShafts(1, true)).toBe(true);
    expect(showsLampShafts(2, false)).toBe(true);
    expect(showsLampShafts(2, true)).toBe(true);
    expect(showsLampShafts(3, false)).toBe(true);
    expect(showsLampShafts(3, true)).toBe(true);
  });
});

describe("Volumetric.ts: 26 steps at half resolution (visual-catalogue.md#L1)", () => {
  it("pins the exact constants the raymarch shader is built from", () => {
    expect(VOLUMETRIC_STEPS).toBe(26);
    expect(VOLUMETRIC_RESOLUTION_SCALE).toBe(0.5);
    expect(VOLUMETRIC_HG_G).toBe(0.78);
  });

  it("TIER_MATRIX's T1 volumetrics cell and Volumetric.ts's own constants never drift apart", () => {
    expect(TIER_MATRIX[1].volumetrics).toBe("raymarch26");
    // T2/T3 fall back to analytic fog, so neither tier ever reads
    // Volumetric.ts's step count at all.
    expect(TIER_MATRIX[2].volumetrics).toBe("analytic");
    expect(TIER_MATRIX[3].volumetrics).toBe("analytic");
  });
});

describe("Warmup.tsx: warmupScene forces every object visible, compiles, then restores", () => {
  it("compiles with a hidden object made visible, then restores its hidden state", () => {
    const scene = new Object3D();
    const hiddenChild = new Object3D();
    hiddenChild.visible = false;
    const visibleChild = new Object3D();
    scene.add(hiddenChild, visibleChild);

    const seenVisibility: boolean[] = [];
    const gl = {
      compile: vi.fn(() => {
        // Captured DURING compile() — this is the moment the spec requires
        // "every object visible", before this file restores anything.
        seenVisibility.push(hiddenChild.visible, visibleChild.visible);
        return new Set<Material>();
      }),
    };
    const camera = new PerspectiveCamera();

    warmupScene(gl, scene, camera);

    expect(gl.compile).toHaveBeenCalledTimes(1);
    expect(gl.compile).toHaveBeenCalledWith(scene, camera);
    expect(seenVisibility).toEqual([true, true]);
    // Restored afterwards to each object's own prior state.
    expect(hiddenChild.visible).toBe(false);
    expect(visibleChild.visible).toBe(true);
  });

  it("covers a nested scene graph via traverse, not just direct children", () => {
    const scene = new Object3D();
    const group = new Object3D();
    const grandchild = new Object3D();
    grandchild.visible = false;
    group.add(grandchild);
    scene.add(group);

    let sawGrandchildVisible = false;
    const gl = {
      compile: vi.fn(() => {
        sawGrandchildVisible = grandchild.visible;
        return new Set<Material>();
      }),
    };
    warmupScene(gl, scene, new PerspectiveCamera());

    expect(sawGrandchildVisible).toBe(true);
    expect(grandchild.visible).toBe(false);
  });
});
