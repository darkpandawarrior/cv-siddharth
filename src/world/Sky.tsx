import { useRef } from "react";
import * as THREE from "three";

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
const ZENITH_HEX = "#0a0f10";
/** Exported so World.tsx's fog can match it — fog is what distant terrain
 *  actually blends toward, so a fog colour that disagreed with the sky's
 *  own horizon stop would silently pull the far ridges back toward black
 *  regardless of how bright the sky itself reads. */
export const HORIZON_HEX = "#16292b";

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
}
`;

export function Sky() {
  // Lazy ref, not useMemo: the theme is resolved once at mount, matching
  // resolve.ts's own materials — a fixed backdrop that doesn't repaint
  // itself mid-drive — without an empty deps array fighting the linter over
  // a value (`worldPalette()`) that is a fresh object every render anyway.
  const uniformsRef = useRef<{ uZenith: { value: THREE.Color }; uHorizon: { value: THREE.Color } } | null>(null);
  if (uniformsRef.current === null) {
    uniformsRef.current = {
      uZenith: { value: new THREE.Color(ZENITH_HEX) },
      uHorizon: { value: new THREE.Color(HORIZON_HEX) },
    };
  }
  const uniforms = uniformsRef.current;

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
