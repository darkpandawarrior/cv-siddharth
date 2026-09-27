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
