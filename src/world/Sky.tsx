import * as THREE from "three";
import { NIGHT_HORIZON_HEX, NIGHT_ZENITH_HEX } from "../lib/nightSurvey.ts";

/**
 * §4 — SKY. An inverted icosphere, radius 300, a 2-stop gradient (no
 * texture, no stars, no moon, no animation): zenith fades to horizon with a
 * steep mix exponent so the glow hugs the horizon line rather than washing
 * the whole dome.
 *
 * Owner refinement ("blue hour, not black"): the doc's own §2 stops (zenith
 * `void` #060807, horizon `accent2` crushed to 6% value, ~#0a1414) read as
 * an unlit room with zero fixtures on screen — step 3 hasn't landed yet.
 * These two are lifted toward a pre-dawn sky instead, same two hues, same
 * shader, same 2.6 exponent — a value change, not a new colour.
 */

const RADIUS = 300;
const MIX_EXPONENT = 2.6;
/** Exported so World.tsx's fog can match it — fog is what distant terrain
 *  actually blends toward, so a fog colour that disagreed with the sky's
 *  own horizon stop would silently pull the far ridges back toward black
 *  regardless of how bright the sky itself reads. Both values live in
 *  nightSurvey.ts (M48) so this dome and sky.ts's night keyframe can never
 *  drift apart. */
export const HORIZON_HEX = NIGHT_HORIZON_HEX;

const VERTEX = /* glsl */ `
varying vec3 vPos;
void main() {
  vPos = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
varying vec3 vPos;
void main() {
  float h = clamp(normalize(vPos).y * 0.5 + 0.5, 0.0, 1.0);
  float t = pow(1.0 - h, ${MIX_EXPONENT.toFixed(2)});
  gl_FragColor = vec4(mix(uZenith, uHorizon, t), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// Module-scope, not a per-instance ref: there is only ever one Sky dome in
// this world, and R4 (skyBinding.ts) needs a plain function it can call
// from outside React to push the real sky's two stops in — an imperative
// handle would work too, but a named export is the simpler seam and
// matches every other "one thing, one owner" singleton in this world
// (telemetry.ts, input.ts). Values start at today's exact Night Survey
// literals, same as before this file exported anything, so a page that
// mounts the dome before skyBinding.ts's first tick still renders the
// art-directed baseline.
const uniforms = {
  uZenith: { value: new THREE.Color(NIGHT_ZENITH_HEX) },
  uHorizon: { value: new THREE.Color(HORIZON_HEX) },
};

/** R4's own write path (reality-spec §4.1) — sets the dome's two stops
 *  in place. Takes hex strings (Keyframe.zenith/horizon's own unit), so a
 *  caller never has to construct a THREE.Color itself. */
export function setSkyStops(zenithHex: string, horizonHex: string): void {
  uniforms.uZenith.value.set(zenithHex);
  uniforms.uHorizon.value.set(horizonHex);
}

export function Sky() {
  return (
    <mesh renderOrder={-1}>
      <icosahedronGeometry args={[RADIUS, 4]} />
      <shaderMaterial
        vertexShader={VERTEX}
        fragmentShader={FRAGMENT}
        uniforms={uniforms}
        side={THREE.BackSide}
        depthWrite={false}
        fog={false}
      />
    </mesh>
  );
}
