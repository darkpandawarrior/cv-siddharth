/**
 * world-v2-spec.md §7 "Vegetation": "Wind uses the reference `windSway` (2
 * sines + side term + gust envelope, base pinned by height^2), and
 * `customDepthMaterial` applies the same displacement." Plus the V1 boat
 * bend (visual-catalogue.md#V1; this lane's own task list): "grass-tuft and
 * reed shaders read `uBoatXZ` and `push = normalize(p.xz - uBoatXZ) * k /
 * (1 + d*d)`, weighted by height squared like windSway... the same
 * displacement in customDepthMaterial so shadows stay attached; under
 * reduced motion `uBoatXZ` is pinned far away."
 *
 * `uWind` is a `liveContract.ts` row (packed `[dirX, dirZ, strength]`,
 * master-plan.md#M19: "vegetation/particles (P3-01b) only read uWind" —
 * P3-02a is the lane that ever WRITES a live value into it); this module
 * only reads it, at its liveContract design default until that lane wires
 * a live one in, exactly `atmosphere.ts`'s posture toward `uFogK`.
 *
 * Both chunks are injected the SAME way `atmosphere.ts`'s `applyAtmosphere`
 * injects fog: an `onBeforeCompile` patch of `#include <begin_vertex>`,
 * chainable so a material can carry fog + wind + boat-push together, and
 * callable a second time against a `MeshDepthMaterial` sharing the same
 * geometry attributes so the shadow map displaces identically (world-v2-
 * spec's own "the same displacement" requirement, twice over).
 *
 * Both expect the instanced geometry to carry:
 *   - `aWindPhase` (float): a fixed per-instance phase (hash.ts-seeded),
 *     so a whole field of grass doesn't sway in perfect unison.
 *   - `aHeightFrac` (float, per-VERTEX not per-instance): 0 at the base, 1
 *     at the tip — "base pinned by height^2" needs the base of every card
 *     to stay planted while the tip sways.
 */

import type { Material, WebGLProgramParametersWithUniforms, WebGLRenderer } from "three";
import { LIVE_CONTRACT } from "./liveContract.ts";

const WIND_ROW = LIVE_CONTRACT.find((r) => r.name === "uWind");
if (!WIND_ROW) throw new Error("windSway.glsl.ts: liveContract.ts is missing uWind");
/** `[dirX, dirZ, strength]` — the pre-live design default (calm, honest,
 *  per liveContract's own note), until P3-02a overwrites it live. */
export const WIND_DESIGN_DEFAULT: readonly [number, number, number] = [WIND_ROW.design[0], WIND_ROW.design[1], WIND_ROW.design[2]];

/** world-v2-spec V1: "under reduced motion uBoatXZ is pinned far away" —
 *  far enough that `1 / (1 + d*d)` is indistinguishable from zero at any
 *  vegetation position inside the valley (EXTENT is 768 m). */
export const BOAT_XZ_PARKED: readonly [number, number] = [1e5, 1e5];

const DECLARE_ATTRS = "attribute float aWindPhase;\nattribute float aHeightFrac;";

/** The wind function itself: two sines plus a side term, gust-enveloped,
 *  amplitude scaled by `aHeightFrac^2` ("base pinned by height^2" — the
 *  base of the card barely moves, the tip moves the most) and by the
 *  instance's own phase so neighbouring cards fall out of sync. */
export const WIND_SWAY_GLSL = /* glsl */ `
uniform vec3 uWind; // [dirX, dirZ, strength]
uniform float uTime;

vec3 sangamWindSway(vec3 pos, float heightFrac, float phase) {
  float h2 = heightFrac * heightFrac;
  float gust = 0.65 + 0.35 * sin(uTime * 0.17 + phase * 3.0);
  float sway = sin(uTime * 1.3 + phase * 6.2831) + 0.5 * sin(uTime * 2.7 + phase * 3.14159);
  float side = sin(uTime * 0.55 + phase * 2.0) * 0.35;
  vec2 dir = normalize(uWind.xy + vec2(1e-5, 0.0));
  vec2 side2 = vec2(-dir.y, dir.x);
  float amp = uWind.z * gust * h2;
  vec2 offset = dir * sway * amp + side2 * side * amp;
  return pos + vec3(offset.x, 0.0, offset.y);
}
`;

/** V1's boat-interaction push: bends grass/reeds away from the hull as it
 *  passes, falling off with the inverse-square of planar distance, same
 *  height^2 weighting as the wind term so bases stay planted. */
export const BOAT_PUSH_GLSL = /* glsl */ `
uniform vec2 uBoatXZ;

vec3 sangamBoatPush(vec3 pos, float heightFrac, vec3 worldXZBase) {
  vec2 toPoint = worldXZBase.xz - uBoatXZ;
  float d = length(toPoint);
  vec2 dir = d > 0.0001 ? toPoint / d : vec2(0.0, 1.0);
  float k = 2.2;
  float push = k / (1.0 + d * d);
  float h2 = heightFrac * heightFrac;
  vec2 offset = dir * push * h2;
  return pos + vec3(offset.x, 0.0, offset.y);
}
`;

function chain(material: Material, inject: (shader: WebGLProgramParametersWithUniforms, renderer: WebGLRenderer) => void): void {
  const previous = material.onBeforeCompile.bind(material);
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms, renderer: WebGLRenderer) => {
    previous(shader, renderer);
    inject(shader, renderer);
  };
  material.needsUpdate = true;
}

/**
 * Injects `sangamWindSway` into `material`'s vertex shader, applied to
 * `transformed` right after `#include <begin_vertex>`. Pass the SAME
 * `uniforms` object to every material sharing one wind field (the same
 * "one object, many materials" contract `applyAtmosphere` uses for
 * `uFogK`) and call this a second time against the mesh's own
 * `customDepthMaterial` so the shadow map displaces identically.
 */
export function applyWindSway<M extends Material>(material: M, uniforms: Record<string, { value: unknown }> = {}): M {
  chain(material, (shader) => {
    Object.assign(
      shader.uniforms,
      { uWind: { value: [...WIND_DESIGN_DEFAULT] }, uTime: { value: 0 } },
      uniforms,
    );
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${DECLARE_ATTRS}\n${WIND_SWAY_GLSL}`)
      .replace("#include <begin_vertex>", "#include <begin_vertex>\ntransformed = sangamWindSway(transformed, aHeightFrac, aWindPhase);");
  });
  return material;
}

/**
 * Injects `sangamBoatPush` (V1) on top of whatever `applyWindSway` already
 * added — the two compose (call wind first, then this) because each only
 * ever reads/writes `transformed`. `worldPos` inside the shader comes from
 * `instanceMatrix * vec4(position.xz on the card's own base plane, ...)`;
 * since the push only needs the card's planar (x,z) footprint, not its
 * swayed position, it reads the untransformed `position.xz` through the
 * instance matrix rather than the already wind-swayed `transformed`.
 */
export function applyBoatPush<M extends Material>(material: M, uniforms: Record<string, { value: unknown }> = {}): M {
  chain(material, (shader) => {
    Object.assign(shader.uniforms, { uBoatXZ: { value: [...BOAT_XZ_PARKED] } }, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${BOAT_PUSH_GLSL}`)
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\n" +
          "#ifdef USE_INSTANCING\n" +
          "vec4 sangamBoatBaseWorld = modelMatrix * instanceMatrix * vec4(position.x, 0.0, position.z, 1.0);\n" +
          "#else\n" +
          "vec4 sangamBoatBaseWorld = modelMatrix * vec4(position.x, 0.0, position.z, 1.0);\n" +
          "#endif\n" +
          "transformed = sangamBoatPush(transformed, aHeightFrac, sangamBoatBaseWorld.xyz);",
      );
  });
  return material;
}
