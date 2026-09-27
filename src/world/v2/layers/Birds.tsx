/**
 * Birds (visual-catalogue.md#V2 CPU boids flock; this lane's own task
 * list; world-v2-spec.md §8 tier table's foliage row shares its tier
 * posture; birds are the "ambient" sibling; streams.ts's own `birds` row:
 * "class: ambient... no external data, ambient motion only", never a data
 * count). Instances `boids.ts`'s pure simulation as our own 3-triangle
 * geometry (a body triangle plus a left/right wing triangle sharing the
 * spine edge), wing flap a per-vertex sine keyed by `gl_InstanceID` so
 * every bird flaps out of phase with its neighbours without any extra
 * per-instance attribute.
 *
 * Reduced motion freezes the flock at its `t = 0` seed pose. No
 * `stepFlock` call at all while reduced motion is on, which is stronger
 * than merely zeroing `t` (a flock mid-manoeuvre would otherwise still
 * jump to its literal `t=0` seed ring every reduced-motion frame; not
 * stepping just holds still), and matches streams.ts's own "reduced
 * motion: flock is static; no flap or flight-path motion" line for this
 * stream. `data-birds-frozen` mirrors that state for
 * world-vegetation.spec.ts.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { useReducedMotion } from "../../../SceneActivity.tsx";
import { deviceTier } from "../../deviceTier.ts";
import { BIRD_COUNT_BY_TIER, seedFlock, stepFlock, type Bird, type FlockParams } from "../boids.ts";
import { sangamBasin } from "../valley.ts";

export const layer = { id: "birds", order: 41 };

const DT = 1 / 60;
const FLAP_RATE = 9; // rad/s: a plausible small-bird wingbeat, not a measured one (ambient, no claim)
const WING_SPAN = 0.5;
const BODY_LENGTH = 0.6;

/** Our own 3-triangle bird: a centre spine triangle (body) plus a left and
 *  right wing triangle sharing that spine edge. `aWingSide` is -1 on the
 *  left wingtip vertex, +1 on the right wingtip vertex, 0 everywhere else
 *  (the spine); the shader flaps only the wingtips. */
function makeBirdGeometry(): THREE.BufferGeometry {
  const nose = [0, 0, BODY_LENGTH * 0.6] as const;
  const tail = [0, 0, -BODY_LENGTH * 0.4] as const;
  const spineMid = [0, 0, 0] as const;
  const leftTip = [-WING_SPAN, 0, -BODY_LENGTH * 0.1] as const;
  const rightTip = [WING_SPAN, 0, -BODY_LENGTH * 0.1] as const;

  // prettier-ignore
  const positions = new Float32Array([
    // body triangle (spine)
    ...nose, ...tail, ...spineMid,
    // left wing
    ...nose, ...spineMid, ...leftTip,
    // right wing
    ...nose, ...rightTip, ...spineMid,
  ]);
  const wingSide = new Float32Array([0, 0, 0, 0, 0, -1, 0, 1, 0]);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aWingSide", new THREE.BufferAttribute(wingSide, 1));
  geometry.computeVertexNormals();
  return geometry;
}

/** `gl_InstanceID`-keyed flap phase: every bird flaps at the same rate but
 *  out of phase, with zero extra per-instance attribute upload.
 *
 * `uTimeUniform` is pre-created by the caller and passed in so mutating its
 * `.value` after compile reaches the GPU (`onBeforeCompile`'s own
 * `shader.uniforms` object is only reachable at compile time otherwise,
 * the same object-identity trick `windSway.glsl.ts`'s `applyWindSway`
 * uses for `uTime`/`uWind`). */
function makeBirdMaterial(uTimeUniform: { value: number }): THREE.Material {
  const material = new THREE.MeshBasicMaterial({ color: "#2b2b2b", side: THREE.DoubleSide });
  const previous = material.onBeforeCompile.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    previous(shader, renderer);
    shader.uniforms.uTime = uTimeUniform;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aWingSide;\nuniform float uTime;")
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\n" +
          "#ifdef USE_INSTANCING\n" +
          `float sangamFlapPhase = float(gl_InstanceID) * 2.399963; // an irrational-ish spread, never in sync\n` +
          `float sangamFlap = sin(uTime * ${FLAP_RATE.toFixed(1)} + sangamFlapPhase);\n` +
          "transformed.y += aWingSide * sangamFlap * 0.22;\n" +
          "#endif\n",
      );
  };
  return material;
}

function useFlockParams(): FlockParams {
  return useMemo(() => {
    const basin = sangamBasin();
    return {
      center: { x: basin.x, y: 22, z: basin.z },
      orbitRadius: basin.r * 0.7,
      orbitSpeed: 0.06,
      neighborRadius: 12,
      maxSpeed: 5,
    };
  }, []);
}

export default function Birds() {
  const reducedMotion = useReducedMotion();
  const tier = deviceTier();
  const count = BIRD_COUNT_BY_TIER[tier];
  const params = useFlockParams();

  const geometry = useMemo(() => makeBirdGeometry(), []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const [uTimeUniform] = useState(() => ({ value: 0 }));
  const material = useMemo(() => makeBirdMaterial(uTimeUniform), [uTimeUniform]);
  useEffect(() => () => material.dispose(), [material]);

  // The live flock state: a ref, not React state. It is mutated every
  // frame and never needs to trigger a re-render (the instanced mesh is
  // updated imperatively in useFrame, the same pattern Fireflies.tsx and
  // Kites.tsx already use for per-frame instance matrices).
  const flockRef = useRef<Bird[]>(seedFlock(count, params));
  const tRef = useRef(0);
  useEffect(() => {
    flockRef.current = seedFlock(count, params);
    tRef.current = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- params is a stable useMemo; only `count` (a tier change) should reseed the roster
  }, [count]);

  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const writeInstances = (birds: readonly Bird[]) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    for (let i = 0; i < birds.length; i++) {
      const b = birds[i];
      dummy.position.set(b.x, b.y, b.z);
      const heading = Math.atan2(b.vx, b.vz);
      dummy.rotation.set(0, heading, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  };

  // Paint the seed pose immediately (before the first useFrame tick) so a
  // reduced-motion mount never shows an un-positioned frame-0 flash.
  useEffect(() => {
    writeInstances(flockRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- writeInstances closes over the ref/dummy, both stable; only the mesh existing matters
  }, [count]);

  useFrame((state) => {
    const t = reducedMotion ? 0 : state.clock.elapsedTime;
    // Pinned to 0 under reduced motion (never advances the flap phase).
    // streams.ts's own "reduced motion: flock is static; no flap or
    // flight-path motion" line for this stream.
    uTimeUniform.value = t;
    if (!reducedMotion) {
      tRef.current += DT;
      flockRef.current = stepFlock(flockRef.current, params, tRef.current, DT);
      writeInstances(flockRef.current);
    }
  });

  if (count === 0) return null;

  return (
    <group name="birds">
      <instancedMesh ref={meshRef} args={[geometry, material, count]} frustumCulled={false} />
      <Html style={{ display: "none" }}>
        <div aria-hidden="true" data-birds-frozen={reducedMotion ? "true" : "false"} />
      </Html>
    </group>
  );
}
