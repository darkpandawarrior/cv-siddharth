/**
 * visual-catalogue.md W1 "Synced waterline foam stripe" / world-v2-spec.md
 * §7 "Water": "every material that crosses the water surface gets
 * `foam = 1 - smoothstep(0.0, uFoamW, abs(vWorldPos.y - waterHeight(xz,
 * uTime)))`, added as an emissive-white term. It reuses the SAME uTime/wave
 * uniforms as the water, so the stripe moves in step with the swell."
 *
 * A shared `onBeforeCompile` chunk — same discipline as `atmosphere.ts`'s
 * `applyAtmosphere` — rather than each material re-deriving the contact
 * line from its own copy of the water's wave math. `waterHeight()` and the
 * four wave uniform NAMES come straight from `waterShader.glsl.ts` (not
 * re-typed here), which is what keeps the stripe locked to the water's own
 * swell instead of a second, independently-drifting ripple.
 *
 * Applied here to the hodi hull material (`Hodi.tsx`). `P3-01a` (ghat,
 * stepping-stone) and `P3-01f` (hero-stone) import `applyWaterline` for
 * their own materials once those lanes land (master-plan.md#M67) — this
 * file owns the one shared chunk, not each material's own copy.
 *
 * "Under reduced motion it freezes at `t=0`" (W1's *Accept* line) is the
 * caller's responsibility, not this chunk's: `applyWaterlineFoam` is a pure
 * function of whatever `uTime` value is bound, so pinning it at 0 is just a
 * matter of the frame loop that updates `uTime` not doing so under reduced
 * motion — `Hodi.tsx`'s own `useFrame` is that loop for the hull material.
 */

import type { Material, WebGLProgramParametersWithUniforms, WebGLRenderer } from "three";
import {
  WATER_HEIGHT_FUNCTION,
  WATER_WAVE_UNIFORM_DECLARATIONS,
  createWaterWaveUniforms,
  type WaterWaveUniformName,
} from "./waterShader.glsl.ts";

/** The foam band's half-width around the water surface, metres. Neither
 *  spec gives a literal (only the formula) — this lane's own art-direction
 *  pick, a crisp contact line rather than a wide wash, stated as a named
 *  constant rather than hidden inside the chunk string (atmosphere.ts's own
 *  FOG_FALLOFF doctrine). */
export const FOAM_HALF_WIDTH_DESIGN = 0.06;

const VERTEX_DECLARE = "varying vec3 vWaterlineWorldPos;";
const VERTEX_ASSIGN = "vWaterlineWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;";

/** Exported so `waterline.test.ts` can assert, by string, that this chunk
 *  reads `uTime` and the water's own wave uniform names, and declares
 *  `uFoamW` — the acceptance line's own wording, checked directly rather
 *  than through a GLSL compiler this test suite doesn't have. */
export const WATERLINE_CHUNK = /* glsl */ `
varying vec3 vWaterlineWorldPos;
uniform float uFoamW;
${WATER_WAVE_UNIFORM_DECLARATIONS}
${WATER_HEIGHT_FUNCTION}

vec3 applyWaterlineFoam(vec3 baseColor, vec3 worldPos) {
  float h = waterHeight(worldPos.xz, uTime);
  float foam = 1.0 - smoothstep(0.0, uFoamW, abs(worldPos.y - h));
  return baseColor + vec3(1.0) * foam;
}
`;

/**
 * Injects the waterline foam stripe into `material`'s fragment shader.
 * Chains onto any `onBeforeCompile` the material already had (composes
 * rather than clobbers, `applyAtmosphere`'s own pattern) and merges
 * `waveUniforms` on top of a fresh `uFoamW` + design-value wave uniforms —
 * pass the SAME uniforms object the water shader itself uses so this
 * material's stripe and the water's own swell can never drift apart.
 */
export function applyWaterline<M extends Material>(
  material: M,
  waveUniforms: Partial<Record<WaterWaveUniformName, { value: unknown }>> = {},
  foamHalfWidth: number = FOAM_HALF_WIDTH_DESIGN,
): M {
  const previous = material.onBeforeCompile.bind(material);
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms, renderer: WebGLRenderer) => {
    previous(shader, renderer);
    Object.assign(
      shader.uniforms,
      { uFoamW: { value: foamHalfWidth } },
      createWaterWaveUniforms(),
      waveUniforms,
    );
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${VERTEX_DECLARE}`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n${VERTEX_ASSIGN}`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${WATERLINE_CHUNK}`)
      .replace(
        "#include <dithering_fragment>",
        "gl_FragColor.rgb = applyWaterlineFoam(gl_FragColor.rgb, vWaterlineWorldPos);\n#include <dithering_fragment>",
      );
  };
  material.needsUpdate = true;
  return material;
}
