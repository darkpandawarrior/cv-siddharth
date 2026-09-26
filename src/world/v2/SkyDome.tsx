import { useMemo } from "react";
import * as THREE from "three";
import { createSkyUniforms, SKY_CHUNK, type SkyUniformName } from "./skyChunk.glsl.ts";

const SKY_VERTEX = /* glsl */ `
  varying vec3 vWorldDir;
  void main() {
    vWorldDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAGMENT = /* glsl */ `
  varying vec3 vWorldDir;
  ${SKY_CHUNK}
  void main() {
    gl_FragColor = vec4(skyColor(normalize(vWorldDir)), 1.0);
  }
`;

/**
 * world-v2-spec §7 "Sky": the material rendered onto the BackSide dome.
 * `Env.tsx` bakes the exact same material (via this same factory, not a
 * hand-copied second shader) into a PMREM environment map, so the dome and
 * its reflection can never drift apart.
 */
export function createSkyDomeMaterial(uniforms: Record<SkyUniformName, THREE.IUniform> = createSkyUniforms()): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: SKY_VERTEX,
    fragmentShader: SKY_FRAGMENT,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
}

// Big enough to enclose the whole valley (world-v2-spec §2's ~600 m spine)
// and the far camera plane with headroom; costs one low-poly sphere and no
// texture, so the radius has no payload consequence to tune around.
const DOME_RADIUS = 900;
const DOME_WIDTH_SEGMENTS = 24;
const DOME_HEIGHT_SEGMENTS = 16;

/**
 * The sky's only geometry: a BackSide sphere lit by `skyColor()`, mounted
 * once at the world's origin (the camera always sits inside it). `uniforms`
 * defaults to the golden-hour design values; a later live-sky lane passes
 * its own live uniforms object so the dome, `Env.tsx`'s bake and
 * `atmosphere.ts`'s fog all read one shared object instead of three
 * separately-wired copies.
 */
export function SkyDome({ uniforms }: { uniforms?: Record<SkyUniformName, THREE.IUniform> }) {
  const material = useMemo(() => createSkyDomeMaterial(uniforms), [uniforms]);
  return (
    <mesh material={material} renderOrder={-1} frustumCulled={false}>
      <sphereGeometry args={[DOME_RADIUS, DOME_WIDTH_SEGMENTS, DOME_HEIGHT_SEGMENTS]} />
    </mesh>
  );
}
