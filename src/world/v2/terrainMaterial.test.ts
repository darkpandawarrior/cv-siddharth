import { describe, expect, it, vi } from "vitest";
import {
  buildTerrainMaterial,
  LOD_NEAR_M,
  LOD_MID_M,
  LOD_FAR_M,
  SLOPE_BAND_LO_DEG,
  SLOPE_BAND_HI_DEG,
  STRATA_FREQ,
  STRATA_JITTER,
} from "./terrainMaterial.ts";

/** A minimal stand-in for the `WebGLProgramParametersWithUniforms` object
 *  three.js hands `onBeforeCompile` — just enough of the real
 *  `MeshStandardMaterial` template's `#include` markers for this material's
 *  own `.replace()` calls to actually fire, so the assertions below are
 *  reading the REAL patched output, not a string this test made up. */
function mockShader() {
  return {
    uniforms: {} as Record<string, { value: unknown }>,
    vertexShader: "void main() {\n#include <begin_vertex>\n}",
    fragmentShader: [
      "void main() {",
      "#include <map_fragment>",
      "#include <roughnessmap_fragment>",
      "#include <metalnessmap_fragment>",
      "#include <emissivemap_fragment>",
      "}",
    ].join("\n"),
  };
}

/** A crude, dependency-free "did this at least parse as GLSL" proxy: brace
 *  and paren balance. Real GPU compilation needs a WebGL context this
 *  vitest environment does not have; this catches the class of bug an
 *  injected template string is actually at risk of (an unbalanced
 *  `${cond ? a : b}` or a missing closing brace in a `.replace()` block). */
function isBalanced(src: string): boolean {
  const pairs: Record<string, string> = { "{": "}", "(": ")" };
  const stack: string[] = [];
  for (const ch of src) {
    if (ch === "{" || ch === "(") stack.push(pairs[ch]);
    else if (ch === "}" || ch === ")") {
      if (stack.pop() !== ch) return false;
    }
  }
  return stack.length === 0;
}

function compile(tier: 1 | 2 | 3) {
  const { material } = buildTerrainMaterial({ tier });
  const shader = mockShader();
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  material.onBeforeCompile!(shader as never, undefined as never);
  warn.mockRestore();
  return { shader, warnCalls: warn.mock.calls };
}

describe("terrainMaterial.ts", () => {
  it("the patched shader contains uGrassWet and the three LOD distances", () => {
    const { shader } = compile(1);
    expect(shader.fragmentShader).toContain("uGrassWet");
    expect(shader.fragmentShader).toContain(LOD_NEAR_M.toFixed(1));
    expect(shader.fragmentShader).toContain(LOD_MID_M.toFixed(1));
    expect(shader.fragmentShader).toContain(LOD_FAR_M.toFixed(1));
  });

  it("the patched shader contains uStrataFreq, uStrataJitter and a 28-36deg smoothstep band, and no hard slope>32 branch", () => {
    const { shader } = compile(1);
    expect(shader.fragmentShader).toContain("uStrataFreq");
    expect(shader.fragmentShader).toContain("uStrataJitter");
    expect(shader.fragmentShader).toContain(`smoothstep(${SLOPE_BAND_LO_DEG.toFixed(1)}, ${SLOPE_BAND_HI_DEG.toFixed(1)}`);
    expect(shader.fragmentShader).not.toMatch(/slope\s*>\s*32/);
    // The named constants really are named constants, not inlined magic numbers.
    expect(STRATA_FREQ).toBeGreaterThan(0);
    expect(STRATA_JITTER).toBeGreaterThan(0);
  });

  it("compiles under the T3 path without a console warning, and the output still balances", () => {
    const { shader, warnCalls } = compile(3);
    expect(warnCalls).toHaveLength(0);
    expect(isBalanced(shader.fragmentShader)).toBe(true);
    expect(isBalanced(shader.vertexShader)).toBe(true);
    // T3 skips the macro-noise anti-tile term (the documented drop) but
    // still carries every other required uniform/band.
    expect(shader.fragmentShader).toContain("nsMacro = 0.0");
    expect(shader.fragmentShader).toContain("uGrassWet");
  });

  it("break-it: an unbalanced GLSL template would fail isBalanced (the checker actually fires)", () => {
    expect(isBalanced("void main() { if (x > 0.0) { doThing(); }")).toBe(false);
    expect(isBalanced("void main() { if (x > 0.0) { doThing(); } }")).toBe(true);
  });

  it("every tier compiles and every vertex attribute the worker bakes is read", () => {
    for (const tier of [1, 2, 3] as const) {
      const { shader } = compile(tier);
      expect(shader.vertexShader).toContain("aSplat");
      expect(shader.vertexShader).toContain("aAux");
      expect(shader.fragmentShader).toContain("vSplat");
    }
  });
});
