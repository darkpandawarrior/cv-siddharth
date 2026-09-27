import * as THREE from "three";
import { GLOBE_RADIUS } from "../geoMath.ts";
import { ATMO_FRAG, VERT } from "./sun.ts";

/** The 1.1x atmosphere shell every earth style shares (shaders in sun.ts). */
export function Atmosphere({ uniforms }: { uniforms: { uSun: { value: THREE.Vector3 } } }) {
  return (
    <mesh scale={1.1}>
      <sphereGeometry args={[GLOBE_RADIUS, 64, 48]} />
      <shaderMaterial args={[{ vertexShader: VERT, fragmentShader: ATMO_FRAG, uniforms }]} side={THREE.BackSide} blending={THREE.AdditiveBlending} transparent depthWrite={false} />
    </mesh>
  );
}
