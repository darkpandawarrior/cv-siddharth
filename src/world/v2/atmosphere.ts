/**
 * world-v2-spec.md §7 "Fog": "the `applyAtmosphere` function is injected
 * per material: exponential height fog (k = 0.018, falloff 0.09) plus
 * in-scattered sun from `skyFogColor(rd)`. The fog floor tints toward deep
 * ground `#060807` in shadowed hollows. `scene.fog` stays a degenerate
 * placeholder." This is that function — a `Material.onBeforeCompile`
 * injection any material (terrain, foliage, and per §7's own "used by the
 * BackSide dome, fog and water", the water shader too) can call instead of
 * hand-rolling its own fog term, so the recipe lives in one place.
 *
 * Because `scene.fog` is a placeholder (this bypasses three's built-in fog
 * system entirely), the injected world-position varying is this module's
 * own `vAtmosphereWorldPos` rather than three's conditionally-compiled
 * `vFogDepth` — every material gets it, not only ones three would compile
 * fog varyings for.
 */

import type { Material, WebGLProgramParametersWithUniforms, WebGLRenderer } from "three";
import { LIVE_CONTRACT } from "./liveContract.ts";
import { SKY_CHUNK } from "./skyChunk.glsl.ts";

const fogKRow = LIVE_CONTRACT.find((r) => r.name === "uFogK");
if (!fogKRow) throw new Error("atmosphere.ts: liveContract has no uFogK row");
/** world-v2-spec §7 literal (k); live-scaled later by air-quality data. */
export const FOG_K_DESIGN = fogKRow.design[0];

/** world-v2-spec §7: "falloff 0.09" — fixed, never live-scaled (only k is). */
const FOG_FALLOFF = 0.09;

/** #060807 — the deep-ground tint the fog floor blends toward in shadowed
 *  hollows (world-v2-spec §7 and this repo's own `--color-void` token). */
const GROUND_TINT_GLSL = "vec3(0.02352941, 0.03137255, 0.02745098)";

const VERTEX_DECLARE = "varying vec3 vAtmosphereWorldPos;";
const VERTEX_ASSIGN = "vAtmosphereWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;";

const FRAGMENT_CHUNK = /* glsl */ `
varying vec3 vAtmosphereWorldPos;
uniform float uFogK;
${SKY_CHUNK}

vec3 applyAtmosphereFog(vec3 color, vec3 worldPos) {
  vec3 toPoint = worldPos - cameraPosition;
  float dist = length(toPoint);
  vec3 rd = dist > 0.0001 ? toPoint / dist : vec3(0.0, 0.0, 1.0);

  // Exponential HEIGHT fog: denser the further worldPos sits below the
  // camera, falloff fixed at ${FOG_FALLOFF.toFixed(2)} (world-v2-spec §7);
  // uFogK is the only live-scaled term.
  float below = max(cameraPosition.y - worldPos.y, 0.0);
  float heightTerm = exp(-below * ${FOG_FALLOFF.toFixed(3)});
  float fogFactor = clamp(1.0 - exp(-uFogK * dist * heightTerm), 0.0, 1.0);

  vec3 fogColor = skyFogColor(rd);
  // Ground-tinted hollows: the lower worldPos sits below the camera, the
  // more the fog itself tints toward deep ground rather than sky.
  float hollow = clamp(below * 0.02, 0.0, 1.0);
  fogColor = mix(fogColor, ${GROUND_TINT_GLSL}, hollow * 0.5);

  return mix(color, fogColor, fogFactor);
}
`;

/**
 * Injects world-v2's shared exponential height fog into `material`'s
 * fragment shader. Chains onto any `onBeforeCompile` the material already
 * had (so `applyAtmosphere` composes with another `onBeforeCompile` call
 * rather than clobbering it), and merges `uniforms` on top of the `uFogK`
 * design default — pass the SAME uniforms object multiple materials share
 * so a later live-sky lane can update fog everywhere by setting one value.
 */
export function applyAtmosphere<M extends Material>(
  material: M,
  uniforms: Record<string, { value: unknown }> = {},
): M {
  const previous = material.onBeforeCompile.bind(material);
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms, renderer: WebGLRenderer) => {
    previous(shader, renderer);
    Object.assign(shader.uniforms, { uFogK: { value: FOG_K_DESIGN } }, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${VERTEX_DECLARE}`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n${VERTEX_ASSIGN}`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${FRAGMENT_CHUNK}`)
      .replace(
        "#include <dithering_fragment>",
        "gl_FragColor.rgb = applyAtmosphereFog(gl_FragColor.rgb, vAtmosphereWorldPos);\n#include <dithering_fragment>",
      );
  };
  material.needsUpdate = true;
  return material;
}
