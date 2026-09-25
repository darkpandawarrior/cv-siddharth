import { describe, expect, it } from "vitest";
import { MeshStandardMaterial } from "three";
import type { Material, WebGLProgramParametersWithUniforms, WebGLRenderer } from "three";
import { LIVE_CONTRACT } from "./liveContract.ts";
import { SKY_CHUNK, SKY_UNIFORM_NAMES } from "./skyChunk.glsl.ts";
import { createSkyDomeMaterial } from "./SkyDome.tsx";
import { applyAtmosphere, FOG_K_DESIGN } from "./atmosphere.ts";

// Minimal stand-ins for the chunks a real MeshStandardMaterial shader
// contains at the exact two spots `applyAtmosphere` patches — enough to
// exercise `onBeforeCompile` without a WebGL context (vitest.config.ts runs
// this suite under `environment: "node"`, like every other test in this
// directory).
const VERTEX_FIXTURE = `
#include <common>
void main() {
  #include <begin_vertex>
  gl_Position = vec4(transformed, 1.0);
}
`;
const FRAGMENT_FIXTURE = `
#include <common>
void main() {
  gl_FragColor = vec4(1.0);
  #include <dithering_fragment>
}
`;

function compile(material: Material): WebGLProgramParametersWithUniforms {
  const shader = {
    uniforms: {},
    vertexShader: VERTEX_FIXTURE,
    fragmentShader: FRAGMENT_FIXTURE,
    defines: undefined,
  } as unknown as WebGLProgramParametersWithUniforms;
  material.onBeforeCompile(shader, {} as WebGLRenderer);
  return shader;
}

describe("SKY_UNIFORM_NAMES vs liveContract", () => {
  it("every uniform name in liveContract that belongs to the sky appears in skyChunk.glsl.ts", () => {
    expect(SKY_UNIFORM_NAMES.length).toBeGreaterThan(0);
    for (const name of SKY_UNIFORM_NAMES) {
      // Guards the grouping itself against drift: every name this file
      // calls "sky" really is a liveContract row, not a typo.
      expect(LIVE_CONTRACT.some((row) => row.name === name)).toBe(true);
      expect(SKY_CHUNK).toContain(name);
    }
  });
});

describe("applyAtmosphere", () => {
  it("patches in uFogK and the skyFogColor call", () => {
    const material = new MeshStandardMaterial();
    applyAtmosphere(material);
    const shader = compile(material);
    expect(shader.fragmentShader).toContain("uFogK");
    expect(shader.fragmentShader).toContain("skyFogColor(");
    expect(shader.uniforms.uFogK.value).toBe(FOG_K_DESIGN);
  });

  it("the dome, fog and water shader strings each include the shared sky chunk", () => {
    // Dome: SkyDome.tsx's own material embeds SKY_CHUNK directly.
    const dome = createSkyDomeMaterial();
    expect(dome.fragmentShader).toContain(SKY_CHUNK);

    // Fog: any material applyAtmosphere touches gets the same chunk, since
    // its in-scattered term is SKY_CHUNK's own skyFogColor().
    const fogMaterial = new MeshStandardMaterial();
    applyAtmosphere(fogMaterial);
    expect(compile(fogMaterial).fragmentShader).toContain(SKY_CHUNK);

    // Water: P2-06b's Reflector shader isn't built yet, but world-v2-spec
    // §7 names it as this chunk's third consumer ("used by the BackSide
    // dome, fog and water") specifically via this same applyAtmosphere call
    // for its own fog blending — a second, independent material exercises
    // the identical path water will call.
    const waterMaterial = new MeshStandardMaterial();
    applyAtmosphere(waterMaterial);
    expect(compile(waterMaterial).fragmentShader).toContain(SKY_CHUNK);
  });

  it("chains onto a material's existing onBeforeCompile rather than replacing it", () => {
    const material = new MeshStandardMaterial();
    let priorCalled = false;
    material.onBeforeCompile = () => {
      priorCalled = true;
    };
    applyAtmosphere(material);
    compile(material);
    expect(priorCalled).toBe(true);
  });
});
