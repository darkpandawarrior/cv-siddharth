/**
 * Particles (this lane's own task list; world-v2-spec.md §7 "Particles" +
 * §8 tier table row: T1 "2400 / 1800 / 800", T2 "600 / 500 / 0", T3
 * "0 / 200 / 0" (read column-wise as marigold-fall / petals-on-water /
 * dust-motes, the ONE place this table is encoded, `PARTICLE_COUNTS`
 * below). "Raw instanced BufferGeometry, one shared two-sided fake-SSS
 * petal shader" (world-v2-spec §7): a single small quad geometry and ONE
 * shared petal material, reused across all three petal populations
 * (marigold fall, water petals, settled petals); dust motes get their own
 * tiny additive point sprite.
 *
 * Reduced motion: every position formula below is a pure function of `t`,
 * and `t` is pinned to 0 under reduced motion (the same `useReducedMotion`
 * -> `t = reduced ? 0 : elapsedTime` idiom `Fireflies.tsx`/`Kites.tsx`
 * already use), combined with `SceneActivity`'s own `demand` frameloop
 * switch, this is what makes two canvas captures 2 s apart pixel-identical
 * (world-vegetation.spec.ts's own acceptance line).
 *
 * Settled petals and petals-on-water advection use the river's own
 * downstream direction and width (`valley.ts`) as a real, deterministic
 * stand-in for the baked flow map (`heavy/world-v2/terrain/valley-flow-
 * 1024.webp`) this lane has no owned way to sample at runtime, and the
 * "parted by the hull"/settled-per-ghat-landing detail is the same known
 * gap `Vegetation.tsx`'s own doc comment already states for `uBoatXZ` and
 * ghat anchors (no live boat-position reader, no ghat position list in
 * this lane's `deps`). ponytail: wire both the moment either exists.
 */
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useReducedMotion } from "../../../SceneActivity.tsx";
import { deviceTier, type DeviceTier } from "../../deviceTier.ts";
import { hashNoise, stringSeed } from "../hash.ts";
import { BOUNDS, CENTER, riverX, riverWidthAtZ } from "../valley.ts";

export const layer = { id: "particles", order: 30 };

/** world-v2-spec §8 tier table's "particles" row, column-wise: T1
 *  "2400/1800/800", T2 "600/500/0", T3 "0/200/0" (marigold / water-petals /
 *  dust-motes). */
export const PARTICLE_COUNTS: Readonly<Record<DeviceTier, { marigold: number; waterPetals: number; dustMotes: number }>> = {
  1: { marigold: 2400, waterPetals: 1800, dustMotes: 800 },
  2: { marigold: 600, waterPetals: 500, dustMotes: 0 },
  3: { marigold: 0, waterPetals: 200, dustMotes: 0 },
};

const SETTLED_PETALS_PER_GHAT = 40;
const MARIGOLD_BOX = { x: 60, y: 24, z: 60 }; // world-v2-spec §7: "a camera-following wrap box 60x24x60"
const MARIGOLD_FALL_SPEED = 2.2;

// world-v2-spec §7: amber #f2a13d, yellow #f5c542, 10% jasmine white.
const MARIGOLD_AMBER = new THREE.Color("#f2a13d");
const MARIGOLD_YELLOW = new THREE.Color("#f5c542");
const JASMINE_WHITE = new THREE.Color("#fff6e6");

function unit(seed: number): number {
  return (hashNoise(seed) + 1) / 2;
}

function marigoldColorFor(id: string): THREE.Color {
  const roll = unit(stringSeed(`${id}:color`));
  if (roll < 0.1) return JASMINE_WHITE;
  return roll < 0.55 ? MARIGOLD_AMBER : MARIGOLD_YELLOW;
}

/** A small two-sided quad: world-v2-spec §7's shared petal geometry. */
function makePetalGeometry(size: number): THREE.BufferGeometry {
  const geometry = new THREE.PlaneGeometry(size, size);
  geometry.rotateX(-Math.PI / 2); // lies flat, petal-like, viewed from above/behind
  return geometry;
}

function makeFakeSssPetalMaterial(): THREE.Material {
  // "fake-SSS" (sub-surface scattering): a translucent, double-sided,
  // additive-leaning basic material reads convincingly as a thin backlit
  // petal without an actual SSS shader, the cheap, honest approximation
  // world-v2-spec §7 itself calls for ("fake").
  return new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    toneMapped: false,
  });
}

interface PetalInstance {
  id: string;
  seed: number;
  color: THREE.Color;
}

function useInstancedPoints(count: number, prefix: string): PetalInstance[] {
  return useMemo(() => {
    const out: PetalInstance[] = [];
    for (let i = 0; i < count; i++) {
      const id = `${prefix}:${i}`;
      out.push({ id, seed: unit(stringSeed(id)), color: marigoldColorFor(id) });
    }
    return out;
  }, [count, prefix]);
}

/** Marigold fall: a camera-following wrap box. Each petal's LOCAL offset
 *  inside the box is fixed per-id; the box itself re-centres on the
 *  camera every frame and each axis wraps with `THREE.MathUtils.euclideanModulo`
 *  so the fall reads as infinite without ever re-seeding. */
function MarigoldFall({ count }: { count: number }) {
  const reducedMotion = useReducedMotion();
  const petals = useInstancedPoints(count, "marigold");
  const geometry = useMemo(() => makePetalGeometry(0.35), []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const material = useMemo(() => makeFakeSssPetalMaterial(), []);
  useEffect(() => () => material.dispose(), [material]);

  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const localOffsets = useMemo(
    () =>
      petals.map((p) => ({
        x: (unit(stringSeed(`${p.id}:x`)) - 0.5) * MARIGOLD_BOX.x,
        y0: unit(stringSeed(`${p.id}:y0`)) * MARIGOLD_BOX.y,
        z: (unit(stringSeed(`${p.id}:z`)) - 0.5) * MARIGOLD_BOX.z,
        sway: unit(stringSeed(`${p.id}:sway`)) * Math.PI * 2,
      })),
    [petals],
  );

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const colorAttr = new Float32Array(petals.length * 3);
    petals.forEach((p, i) => p.color.toArray(colorAttr, i * 3));
    mesh.geometry.setAttribute("color", new THREE.InstancedBufferAttribute(colorAttr, 3));
  }, [petals]);

  useFrame((state) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const t = reducedMotion ? 0 : state.clock.elapsedTime;
    const camera = state.camera;
    for (let i = 0; i < petals.length; i++) {
      const off = localOffsets[i];
      // Edge-faded wrap on Y only (the fall axis); X/Z simply wrap so the
      // box always looks fully populated around the camera.
      const y = THREE.MathUtils.euclideanModulo(off.y0 - t * MARIGOLD_FALL_SPEED, MARIGOLD_BOX.y) - MARIGOLD_BOX.y / 2;
      const sway = Math.sin(t * 0.6 + off.sway) * 0.6;
      dummy.position.set(camera.position.x + off.x + sway, camera.position.y + y, camera.position.z + off.z);
      dummy.rotation.set(0, off.sway, Math.sin(t * 0.4 + off.sway) * 0.3);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  if (petals.length === 0) return null;
  return <instancedMesh ref={meshRef} args={[geometry, material, petals.length]} frustumCulled={false} />;
}

/** Petals advected downstream on the water surface, real river geometry
 *  (`riverX`/`riverWidthAtZ`), a gentle lateral drift standing in for the
 *  baked flow map (this file's own doc comment). */
function WaterPetals({ count }: { count: number }) {
  const reducedMotion = useReducedMotion();
  const petals = useInstancedPoints(count, "water-petal");
  const geometry = useMemo(() => makePetalGeometry(0.3), []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const material = useMemo(() => makeFakeSssPetalMaterial(), []);
  useEffect(() => () => material.dispose(), [material]);

  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const seeds = useMemo(
    () =>
      petals.map((p) => ({
        z0: BOUNDS.zMin + unit(stringSeed(`${p.id}:z0`)) * (BOUNDS.zMax - BOUNDS.zMin),
        lateral: unit(stringSeed(`${p.id}:lat`)) - 0.5,
        speed: 1.5 + unit(stringSeed(`${p.id}:speed`)) * 1.5,
        driftSeed: unit(stringSeed(`${p.id}:drift`)) * Math.PI * 2,
      })),
    [petals],
  );

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const colorAttr = new Float32Array(petals.length * 3);
    petals.forEach((p, i) => p.color.toArray(colorAttr, i * 3));
    mesh.geometry.setAttribute("color", new THREE.InstancedBufferAttribute(colorAttr, 3));
  }, [petals]);

  useFrame((state) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const t = reducedMotion ? 0 : state.clock.elapsedTime;
    const span = BOUNDS.zMax - BOUNDS.zMin;
    for (let i = 0; i < petals.length; i++) {
      const s = seeds[i];
      const z = BOUNDS.zMin + THREE.MathUtils.euclideanModulo(s.z0 - BOUNDS.zMin + t * s.speed, span);
      const half = riverWidthAtZ(z) / 2;
      const drift = Math.sin(t * 0.3 + s.driftSeed) * half * 0.15;
      const x = riverX(z) + s.lateral * half * 0.8 + drift;
      dummy.position.set(x, 0.05, z);
      dummy.rotation.set(0, s.driftSeed, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  if (petals.length === 0) return null;
  return <instancedMesh ref={meshRef} args={[geometry, material, petals.length]} frustumCulled={false} />;
}

/** Static petals settled at "ghat landings": this lane has no real ghat
 *  position list (see file doc comment), so landings stand in as evenly
 *  spaced points along the settled riverbank corridor. Static: no
 *  `useFrame` at all, matching "settled" (never advected once landed). */
function SettledPetals() {
  const geometry = useMemo(() => makePetalGeometry(0.28), []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const material = useMemo(() => makeFakeSssPetalMaterial(), []);
  useEffect(() => () => material.dispose(), [material]);
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const landings = 5; // an honest stand-in count for "ghat landings" (see doc)
  const petals = useMemo(() => {
    const out: PetalInstance[] = [];
    for (let l = 0; l < landings; l++) for (let i = 0; i < SETTLED_PETALS_PER_GHAT; i++) out.push({ id: `settled:${l}:${i}`, seed: 0, color: marigoldColorFor(`settled:${l}:${i}`) });
    return out;
  }, []);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const colorAttr = new Float32Array(petals.length * 3);
    petals.forEach((p, i) => p.color.toArray(colorAttr, i * 3));
    mesh.geometry.setAttribute("color", new THREE.InstancedBufferAttribute(colorAttr, 3));
    const span = BOUNDS.zMax - BOUNDS.zMin;
    let idx = 0;
    for (let l = 0; l < landings; l++) {
      const z = BOUNDS.zMin + ((l + 0.5) / landings) * span;
      const half = riverWidthAtZ(z) / 2;
      for (let i = 0; i < SETTLED_PETALS_PER_GHAT; i++) {
        const id = `settled:${l}:${i}`;
        const x = riverX(z) + half + 2 + unit(stringSeed(`${id}:x`)) * 4;
        const zz = z + (unit(stringSeed(`${id}:z`)) - 0.5) * 6;
        dummy.position.set(x, 0.03, zz);
        dummy.rotation.set(0, unit(stringSeed(`${id}:rot`)) * Math.PI * 2, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(idx++, dummy.matrix);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [petals, dummy]);

  if (petals.length === 0) return null;
  return <instancedMesh ref={meshRef} args={[geometry, material, petals.length]} frustumCulled={false} />;
}

/** Dust motes in the sunbeam shafts (T1 only): small additive points
 *  drifting slowly upward near the spawn corridor. */
function DustMotes({ count }: { count: number }) {
  const reducedMotion = useReducedMotion();
  const geometry = useMemo(() => new THREE.BufferGeometry(), []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const material = useMemo(
    () => new THREE.PointsMaterial({ color: "#f5e6c8", size: 0.05, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }),
    [],
  );
  useEffect(() => () => material.dispose(), [material]);

  const seeds = useMemo(() => {
    const arr: { x: number; y0: number; z: number; rise: number; sway: number }[] = [];
    for (let i = 0; i < count; i++) {
      const id = `dust:${i}`;
      arr.push({
        x: CENTER.x + (unit(stringSeed(`${id}:x`)) - 0.5) * 20,
        y0: unit(stringSeed(`${id}:y0`)) * 6,
        z: BOUNDS.zMin + 60 + unit(stringSeed(`${id}:z`)) * 40,
        rise: 0.15 + unit(stringSeed(`${id}:rise`)) * 0.2,
        sway: unit(stringSeed(`${id}:sway`)) * Math.PI * 2,
      });
    }
    return arr;
  }, [count]);

  const positions = useMemo(() => {
    const arr = new Float32Array(Math.max(1, count) * 3);
    seeds.forEach((s, i) => {
      arr[i * 3] = s.x;
      arr[i * 3 + 1] = s.y0;
      arr[i * 3 + 2] = s.z;
    });
    return arr;
  }, [seeds, count]);

  useEffect(() => {
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  }, [geometry, positions]);

  useFrame((state) => {
    const attr = geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
    if (!attr) return;
    const t = reducedMotion ? 0 : state.clock.elapsedTime;
    for (let i = 0; i < seeds.length; i++) {
      const s = seeds[i];
      const y = THREE.MathUtils.euclideanModulo(s.y0 + t * s.rise, 6);
      attr.setXYZ(i, s.x + Math.sin(t * 0.5 + s.sway) * 0.5, y, s.z);
    }
    attr.needsUpdate = true;
  });

  if (count === 0) return null;
  return <points geometry={geometry} material={material} frustumCulled={false} />;
}

export default function Particles() {
  const tier = deviceTier();
  const counts = PARTICLE_COUNTS[tier];

  return (
    <group name="particles">
      <MarigoldFall count={counts.marigold} />
      <WaterPetals count={counts.waterPetals} />
      <SettledPetals />
      <DustMotes count={counts.dustMotes} />
    </group>
  );
}
