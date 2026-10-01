import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Guard for a defect class that hit five shaders across three lanes: a
 * `<shaderMaterial uniforms={u}>` PROP is shallow-copied by R3F at mount
 * (applyProps: `uniforms[name] = { ...uniform }`), so a texture swapped in
 * later, or any float written per frame, never reaches the GPU. It stayed
 * invisible because in-place Vector3 edits DO propagate, and because e2e
 * fixtures load before the mesh mounts. Night lights, sea ice, the 4K
 * upgrade, the Moon's map, the aurora grid and the star twinkle were all
 * silently dead. Every globe shader is constructed WITH its uniforms
 * (`args={[{ vertexShader, fragmentShader, uniforms }]}`) instead.
 */
const DIR = new URL(".", import.meta.url).pathname;

function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? tsxFiles(p) : e.name.endsWith(".tsx") ? [p] : [];
  });
}

/** Pure so the break-it case below can feed it a fixture. */
export function propUniformMaterials(source: string): number {
  return (source.match(/<shaderMaterial\b[^>]*?\buniforms=\{/gs) ?? []).length;
}

describe("globe shader materials bind their uniforms by construction", () => {
  it("no <shaderMaterial> under src/world/globe takes uniforms as a prop", () => {
    const offenders = tsxFiles(DIR).filter((f) => propUniformMaterials(readFileSync(f, "utf8")) > 0);
    expect(offenders.map((f) => f.slice(DIR.length))).toEqual([]);
  });

  it("break-it: the matcher catches the prop form, multi-line included, and passes args", () => {
    expect(propUniformMaterials(`<shaderMaterial vertexShader={V} uniforms={u} />`)).toBe(1);
    expect(propUniformMaterials(`<shaderMaterial\n  vertexShader={V}\n  uniforms={u}\n/>`)).toBe(1);
    expect(propUniformMaterials(`<shaderMaterial args={[{ vertexShader: V, uniforms }]} />`)).toBe(0);
  });
});

/**
 * WAVE 7 LANE V2 (city-light bloom): `uNightGain` has to be a real uniform,
 * not a literal multiplier baked into the shader string — GlobePost.tsx's
 * plain Bloom pass needs a floor (luminanceThreshold) it can share with
 * whatever pushes the night term over it, and a hardcoded `* 1.6` can't be
 * tuned from outside the shader source. This also guards that EarthImagery's
 * uniforms object (constructed WITH the material via `args`, this file's own
 * house rule above) actually carries it, not just the shader declaration.
 */
describe("uNightGain is a real, constructed uniform", () => {
  it("earthImageryShader.ts declares uNightGain and multiplies the night-lights term by it, not a literal", () => {
    const source = readFileSync(join(DIR, "layers/earthImageryShader.ts"), "utf8");
    expect(source).toMatch(/uniform float uNightGain;/);
    expect(source).toMatch(/texture2D\(uNight,\s*vUv\)\.rgb\s*\*\s*uNightGain/);
  });

  it("EarthImagery.tsx's uniforms object (the one passed via args) includes uNightGain", () => {
    const source = readFileSync(join(DIR, "layers/EarthImagery.tsx"), "utf8");
    expect(source).toMatch(/uNightGain:\s*\{\s*value:/);
  });
});

/**
 * render.md finding 6 (P1, 2026-09-30): the atmosphere shell and inner-limb
 * haze are both additive exponential-falloff gradients over near-black — the
 * textbook 8-bit banding case, per the audit's own grep (`dithering` had no
 * matches outside test files before this fix). Both fragment shaders now
 * apply a per-pixel ordered dither to their final colour before output.
 */
describe("atmosphere and haze gradients dither their output", () => {
  it("sun.ts's ATMO_FRAG applies dither() to its final colour", () => {
    const source = readFileSync(join(DIR, "layers/sun.ts"), "utf8");
    expect(source).toMatch(/gl_FragColor\s*=\s*vec4\(dither\(/);
  });

  it("earthImageryShader.ts's INNER_HAZE_FRAG applies dither() to its final colour", () => {
    const source = readFileSync(join(DIR, "layers/earthImageryShader.ts"), "utf8");
    expect(source).toMatch(/gl_FragColor\s*=\s*vec4\(dither\(/);
  });
});
