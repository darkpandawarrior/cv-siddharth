/**
 * V2 CPU boids flock (visual-catalogue.md#V2 CPU boids flock; world-v2-spec
 * §7 "Kites (data)... Fireflies (data)" sibling — birds are the ambient
 * counterpart, streams.ts's own `birds` row: "class: ambient... no external
 * data, ambient motion only", never a data count. master-plan.md#M67:
 * "V2 birds... P3-01b, with 'birds' declared ambient in P2-03a's STREAMS.").
 *
 * Plain-JS separation + alignment + cohesion, plus a soft attractor
 * orbiting the Sangam basin so the flock reads as circling the confluence
 * rather than drifting off the map. Pure, zero three/R3F import (the same
 * discipline `vegetationScatter.ts` and `valley.ts` keep) so `boids.test.ts`
 * can run the simulation in Node and assert exact reproducibility.
 *
 * Determinism: `seedFlock` is the ONLY place randomness enters (via
 * hash.ts's `hashNoise`/`stringSeed`, keyed by each bird's own index-based
 * id string — a fixed roster, not a per-frame draw), and `stepFlock` is a
 * pure function of the previous state plus a fixed `dt`. A fixed seed run
 * of N steps is therefore byte-for-byte reproducible (boids.test.ts's own
 * acceptance line), the same guarantee `vegetationScatter.ts` gives its
 * scatter.
 */

import { hashNoise, stringSeed } from "./hash.ts";
import type { DeviceTier } from "../deviceTier.ts";

/** world-v2-spec §7 V2 task: "24-40 birds (16 on T3)" — pinned exactly by
 *  boids.test.ts, the one place this table is encoded. */
export const BIRD_COUNT_BY_TIER: Readonly<Record<DeviceTier, number>> = {
  1: 40,
  2: 24,
  3: 16,
};

export interface Bird {
  id: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** A fixed per-bird phase for the wing-flap vertex sine (keyed by
   *  instanceId in Birds.tsx, carried here so it survives every step
   *  unchanged — flap phase is per-bird identity, not simulated state). */
  flapPhase: number;
}

export interface FlockParams {
  /** The soft attractor's centre (world-v2-spec §7: "a soft attractor
   *  orbiting the basin") — Vegetation/Birds.tsx passes `sangamBasin()`. */
  center: { x: number; y: number; z: number };
  orbitRadius: number;
  orbitSpeed: number;
  neighborRadius: number;
  maxSpeed: number;
}

const SEPARATION_WEIGHT = 1.4;
const ALIGNMENT_WEIGHT = 0.9;
const COHESION_WEIGHT = 0.7;
const ATTRACTOR_WEIGHT = 0.5;
const SEPARATION_RADIUS_FACTOR = 0.35; // fraction of neighborRadius

function unit(seed: number): number {
  return (hashNoise(seed) + 1) / 2;
}

/** Builds `count` birds on a ring around `center` at `t=0`, deterministic by
 *  index (a fixed roster — index IS identity here, unlike hash.ts's usual
 *  "never a bare counter" warning, which is about reordering a data-derived
 *  array; this roster has no other identity to key from). */
export function seedFlock(count: number, params: FlockParams): Bird[] {
  const birds: Bird[] = [];
  for (let i = 0; i < count; i++) {
    const id = `bird:${i}`;
    const angle = unit(stringSeed(`${id}:angle`)) * Math.PI * 2;
    const radiusJitter = params.orbitRadius * (0.7 + unit(stringSeed(`${id}:r`)) * 0.6);
    const heightJitter = unit(stringSeed(`${id}:h`)) * 8 - 4;
    const x = params.center.x + Math.cos(angle) * radiusJitter;
    const z = params.center.z + Math.sin(angle) * radiusJitter;
    const y = params.center.y + 10 + heightJitter;
    const speed = params.maxSpeed * (0.5 + unit(stringSeed(`${id}:s`)) * 0.5);
    birds.push({
      id,
      x,
      y,
      z,
      vx: -Math.sin(angle) * speed,
      vy: 0,
      vz: Math.cos(angle) * speed,
      flapPhase: unit(stringSeed(`${id}:flap`)) * Math.PI * 2,
    });
  }
  return birds;
}

function clampSpeed(vx: number, vy: number, vz: number, maxSpeed: number): [number, number, number] {
  const speed = Math.hypot(vx, vy, vz);
  if (speed <= maxSpeed || speed === 0) return [vx, vy, vz];
  const k = maxSpeed / speed;
  return [vx * k, vy * k, vz * k];
}

/**
 * Advances every bird by `dt` seconds: separation + alignment + cohesion
 * over neighbours within `neighborRadius`, plus a soft pull toward a point
 * orbiting `center` at `orbitRadius`/`orbitSpeed`. O(n^2) neighbour scan —
 * ponytail: fine at the spec's 16-40 birds, add a spatial grid if this ever
 * has to scale past a few hundred. Returns a NEW array; never mutates its
 * input, so a caller (or a test) can hold the previous frame safely.
 */
export function stepFlock(birds: readonly Bird[], params: FlockParams, t: number, dt: number): Bird[] {
  const attractor = {
    x: params.center.x + Math.cos(t * params.orbitSpeed) * params.orbitRadius,
    y: params.center.y + 10,
    z: params.center.z + Math.sin(t * params.orbitSpeed) * params.orbitRadius,
  };
  const separationRadius = params.neighborRadius * SEPARATION_RADIUS_FACTOR;

  return birds.map((bird) => {
    let sepX = 0,
      sepY = 0,
      sepZ = 0;
    let aliX = 0,
      aliY = 0,
      aliZ = 0;
    let cohX = 0,
      cohY = 0,
      cohZ = 0;
    let neighborCount = 0;

    for (const other of birds) {
      if (other === bird) continue;
      const dx = bird.x - other.x;
      const dy = bird.y - other.y;
      const dz = bird.z - other.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist >= params.neighborRadius || dist === 0) continue;
      neighborCount++;
      aliX += other.vx;
      aliY += other.vy;
      aliZ += other.vz;
      cohX += other.x;
      cohY += other.y;
      cohZ += other.z;
      if (dist < separationRadius) {
        const push = (separationRadius - dist) / separationRadius;
        sepX += (dx / dist) * push;
        sepY += (dy / dist) * push;
        sepZ += (dz / dist) * push;
      }
    }

    let ax = sepX * SEPARATION_WEIGHT;
    let ay = sepY * SEPARATION_WEIGHT;
    let az = sepZ * SEPARATION_WEIGHT;

    if (neighborCount > 0) {
      ax += (aliX / neighborCount - bird.vx) * ALIGNMENT_WEIGHT;
      ay += (aliY / neighborCount - bird.vy) * ALIGNMENT_WEIGHT;
      az += (aliZ / neighborCount - bird.vz) * ALIGNMENT_WEIGHT;
      ax += (cohX / neighborCount - bird.x) * COHESION_WEIGHT * 0.02;
      ay += (cohY / neighborCount - bird.y) * COHESION_WEIGHT * 0.02;
      az += (cohZ / neighborCount - bird.z) * COHESION_WEIGHT * 0.02;
    }

    ax += (attractor.x - bird.x) * ATTRACTOR_WEIGHT * 0.01;
    ay += (attractor.y - bird.y) * ATTRACTOR_WEIGHT * 0.01;
    az += (attractor.z - bird.z) * ATTRACTOR_WEIGHT * 0.01;

    const [vx, vy, vz] = clampSpeed(bird.vx + ax * dt, bird.vy + ay * dt, bird.vz + az * dt, params.maxSpeed);

    return {
      ...bird,
      x: bird.x + vx * dt,
      y: bird.y + vy * dt,
      z: bird.z + vz * dt,
      vx,
      vy,
      vz,
    };
  });
}

/** Runs `steps` fixed-`dt` steps from `seedFlock`'s own output — the one
 *  entry point both `Birds.tsx` (real-time, one step per frame) and
 *  `boids.test.ts` (600 fixed steps, asserted byte-for-byte reproducible)
 *  drive, so neither can drift from the other's stepping order. */
export function runFlock(birds: readonly Bird[], params: FlockParams, steps: number, dt: number, startT = 0): readonly Bird[] {
  let state: readonly Bird[] = birds;
  for (let i = 0; i < steps; i++) state = stepFlock(state, params, startT + i * dt, dt);
  return state;
}
