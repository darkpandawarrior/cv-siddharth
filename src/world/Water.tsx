import { useMemo, useRef, type JSX } from "react";
import { useFrame } from "@react-three/fiber";
import type { ShaderMaterial } from "three";
import { SEA_LEVEL } from "./craftPhysics.ts";
import { WATER_PLANE } from "./worldData.ts";

/**
 * The Ink sea's surface. Deliberately the cheapest thing in the scene: this
 * is the one mesh in the whole world that has to redraw every single frame
 * (Terrain's islands are static, Craft moves but is a handful of shapes), so
 * it gets a hand-written unlit ShaderMaterial rather than a
 * MeshStandardMaterial catching real lights, and a vertex count kept low
 * enough that the sine displacement below is effectively free.
 *
 * No RigidBody, no collider — per the design doc, submersion is a *depth*
 * test Craft.tsx runs against SEA_LEVEL each frame (probe.submergedDepth in
 * craftPhysics.ts), not a contact event. A collider here would fight that:
 * Rapier would report the craft "landing" on the water the instant its hull
 * collider touched the plane, which is exactly the discrete on/off feel the
 * depth-based buoyancy model in craftPhysics.ts exists to avoid.
 */

// PlaneGeometry starts flat in local XY (normal along +Z) and gets tipped
// onto SEA_LEVEL by the mesh's own -90° X rotation below. That rotation maps
// local (x, y, z) -> world (x, z, -y) — see Terrain.tsx's TiltedShoreBox
// comment for the same derivation applied to a ramp. So displacing local z
// (the plane's own normal direction) in the vertex shader moves a point
// along world Y, i.e. straight up and down: a ripple, not a shear.
const WATER_VERTEX = /* glsl */ `
  uniform float uTime;
  varying float vWave;
  void main() {
    // Two mismatched sine frequencies/speeds so the surface never repeats in
    // a visible period — cheaper than Perlin/simplex noise and, at this
    // camera distance, indistinguishable from it.
    float wave = sin(position.x * 0.16 + uTime * 0.55) * 0.14
               + sin(position.y * 0.22 - uTime * 0.4) * 0.09;
    vWave = wave;
    vec3 displaced = position + vec3(0.0, 0.0, wave);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
  }
`;

// Dark, matte, ink-coloured base per the task brief, with the wave crests
// picking up a faint cyan glint (--color-accent2 family) rather than a
// specular highlight — a real specular term would need light/normal data
// this cheap a material doesn't bother computing.
const WATER_FRAGMENT = /* glsl */ `
  varying float vWave;
  void main() {
    vec3 ink = vec3(0.03, 0.035, 0.04);
    vec3 glint = vec3(0.37, 0.90, 1.0);
    float crest = smoothstep(0.03, 0.16, vWave);
    gl_FragColor = vec4(ink + glint * crest * 0.4, 0.95);
  }
`;

export function Water(): JSX.Element {
  const material = useRef<ShaderMaterial>(null);

  const uniforms = useMemo(() => ({ uTime: { value: 0 } }), []);

  useFrame((_, delta) => {
    if (material.current) material.current.uniforms.uTime.value += delta;
  });

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, SEA_LEVEL, WATER_PLANE.centerZ]}>
      {/* Declared as a child element, not built with `new THREE.PlaneGeometry`
          in useMemo and passed as a `geometry` prop: R3F only auto-disposes
          objects its own reconciler created. A geometry instantiated outside
          JSX and handed in as a prop is invisible to that disposal pass, so
          its GPU buffers would outlive the Canvas unmount — the one leak that
          broke the site's "renderer and physics world disposed on unmount"
          rule. As a child, R3F both owns and disposes it.
          Covers the Ink sea (worldData.ts: z in [18,46]) plus margin on every
          side — north under the mainland's tapered shore (Terrain.tsx's Shore
          stops at z=22, so the plane needs to reach that far to avoid a
          visible seam) and south/east/west past the atolls, so panning the
          camera never finds a hard edge to the sea. */}
      {/* 110 deep (was 90) so the plane covers the whole of Craft.tsx's
          WORLD_BOUNDS box rather than a subset of it. The two disagreed: a
          craft off the mainland's north cliff was still in bounds, so nothing
          respawned it, but the water ended at z=-15 — so it floated,
          convincingly and permanently, on nothing. At depth 110 centred on
          z=30 the sea spans z in [-25,85], which strictly contains the
          corrected bounds box; see WORLD_BOUNDS for the matching side. */}
      <planeGeometry args={[WATER_PLANE.width, WATER_PLANE.depth, 50, 55]} />
      <shaderMaterial
        ref={material}
        uniforms={uniforms}
        vertexShader={WATER_VERTEX}
        fragmentShader={WATER_FRAGMENT}
        transparent
        depthWrite={true}
      />
    </mesh>
  );
}
