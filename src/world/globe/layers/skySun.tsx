// A small, subtle Sun (LANE L2): a bright disc plus a soft additive glow in
// the real sun direction, far away and never blowing out the scene.
// Faces the camera via a plain per-frame quaternion copy (below) rather
// than drei's <Billboard>: Billboard is only otherwise reachable from
// Ghosts.tsx/Fixtures.tsx (a different scene entirely), and pulling its own
// small dependency chain into this lazy chunk cost more in the shared
// "Globe" chunk's dynamic-import preload list than one quaternion copy is
// worth (same story as skyMoon.tsx's probe comment, measured the same way).
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { sunDirection } from "./sun.ts";

/** Far enough to always sit behind the globe/atmosphere/Moon, inside the
 *  Canvas's default far plane (1000). */
export const SUN_DISTANCE = 380;
const GLOW_SIZE = 46;
const DISC_RADIUS = 6;

const GLOW_VERT = `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;
// Radial falloff, squared for a soft core without a hard glow edge -
// additive so it only ever brightens, never occludes the stars behind it.
const GLOW_FRAG = `varying vec2 vUv;
void main(){
  float d=length(vUv-0.5)*2.0;
  float a=smoothstep(1.0,0.0,d);
  gl_FragColor=vec4(vec3(1.0,0.92,0.75)*a*a,a*0.85);
}`;

export function SkySun({ now }: { now: Date }) {
  const groupRef = useRef<THREE.Group>(null);
  const position = useMemo((): [number, number, number] => {
    const d = sunDirection(now);
    return [d.x * SUN_DISTANCE, d.y * SUN_DISTANCE, d.z * SUN_DISTANCE];
  }, [now]);

  useFrame((state) => {
    groupRef.current?.quaternion.copy(state.camera.quaternion);
  });

  return (
    <group ref={groupRef} position={position}>
      <mesh renderOrder={-1}>
        <planeGeometry args={[GLOW_SIZE, GLOW_SIZE]} />
        <shaderMaterial
          vertexShader={GLOW_VERT}
          fragmentShader={GLOW_FRAG}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <mesh position={[0, 0, 0.01]}>
        <circleGeometry args={[DISC_RADIUS, 32]} />
        <meshBasicMaterial color="#fff6df" toneMapped={false} />
      </mesh>
    </group>
  );
}
