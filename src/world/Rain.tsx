import { useMemo, useRef, type JSX } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useWeather } from "../lib/useSky.ts";
import { useReducedMotion } from "../SceneActivity.tsx";
import type { DeviceTier } from "./deviceTier.ts";

/**
 * §4.2 — RAIN, bound to Open-Meteo's own `precipMmH` (P1/P3), never a
 * second weather fetch (design doc §4: "the world has no its own clock,
 * its own fetch or its own weather" — this reads the same shared
 * `useWeather()` bus every other live layer on the site already shares).
 *
 * One `InstancedMesh` of thin quads, fall driven by `uTime` in the vertex
 * shader so the CPU never re-touches per-instance matrices once built —
 * only the drop COUNT (device tier x rain rate) and the wind slant change
 * between mounts.
 */

const TIER_MAX: Record<DeviceTier, number> = { 1: 1200, 2: 400, 3: 0 };
/** precipMmH -> drop count. 400 is a calibration constant, not a physical
 *  one — Rain has no real density model, just "more rain reads as more
 *  drops," capped by the tier's own draw-call budget. */
const DROPS_PER_MM = 400;

export type RainMode = "off" | "on" | "motion-reduced" | "fog-only";

/** Pure classifier, exported so both the mesh below and Hud.tsx's own
 *  `data-reality-rain` marker (reality-spec §4.2's ledger contract) read
 *  the identical rule rather than two hand-kept copies of it.
 *
 *  Tier is checked before reduced motion: `TIER_MAX[3]` is already 0 (no
 *  drops render on a throttled device whether or not motion is reduced),
 *  so "fog-only" is the more specific, more useful reading of "why isn't
 *  it raining on screen" for that device. */
export function rainMode(precipMmH: number, reducedMotion: boolean, tier: DeviceTier): RainMode {
  if (precipMmH <= 0) return "off";
  if (tier === 3) return "fog-only";
  if (reducedMotion) return "motion-reduced";
  return "on";
}

const VERTEX = /* glsl */ `
uniform float uTime;
uniform float uWindX;
uniform float uWindZ;
uniform float uFallSpeed;
uniform float uSpanY;
attribute float aPhase;
attribute vec3 aOrigin;
void main() {
  // Each drop falls on its own phase-offset loop through [0, uSpanY), then
  // wraps back to the top — one continuous shader-driven fall with zero
  // CPU-side matrix churn per frame.
  float y = mod(aOrigin.y - uTime * uFallSpeed + aPhase, uSpanY);
  vec3 pos = position + vec3(aOrigin.x + uTime * uWindX, y, aOrigin.z + uTime * uWindZ);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
void main() {
  gl_FragColor = vec4(0.72, 0.82, 0.86, 0.35);
}
`;

const SPAN_XZ = 90; // metres — a box roughly the width of the west/east flanks
const SPAN_Y = 40;
const FALL_SPEED = 14; // m/s, a plausible light-rain terminal velocity

function buildDropGeometry(count: number): THREE.InstancedBufferGeometry {
  const base = new THREE.PlaneGeometry(0.02, 0.4);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index;
  geo.attributes.position = base.attributes.position;
  geo.instanceCount = count;

  // Deterministic scatter — a rain field that reshuffled itself on every
  // reload would read as a bug, not weather.
  let seed = 1;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const origin = new Float32Array(count * 3);
  const phase = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    origin[i * 3] = (rand() - 0.5) * SPAN_XZ;
    origin[i * 3 + 1] = rand() * SPAN_Y;
    origin[i * 3 + 2] = (rand() - 0.5) * SPAN_XZ;
    phase[i] = rand() * SPAN_Y;
  }
  geo.setAttribute("aOrigin", new THREE.InstancedBufferAttribute(origin, 3));
  geo.setAttribute("aPhase", new THREE.InstancedBufferAttribute(phase, 1));
  return geo;
}

export function Rain({ tier }: { tier: DeviceTier }): JSX.Element | null {
  const { weather } = useWeather();
  // Live (SceneActivity.tsx's own useSyncExternalStore over matchMedia's
  // `change` event), not the per-frame reducedMotion.ts read every OTHER
  // scene decoration uses: whether Rain mounts at all is a structural
  // decision made once per React render, not once per three.js frame, so
  // it needs the version that actually re-renders this component when the
  // OS setting (or a Playwright emulateMedia call) changes mid-session.
  const reducedMotion = useReducedMotion();
  const precipMmH = weather?.precipMmH ?? 0;
  const mode = rainMode(precipMmH, reducedMotion, tier);

  const count = mode === "on" ? Math.min(TIER_MAX[tier], Math.round(precipMmH * DROPS_PER_MM)) : 0;

  const geometry = useMemo(() => (count > 0 ? buildDropGeometry(count) : null), [count]);
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  const windRad = ((weather?.windFromDeg ?? 0) + 180) * (Math.PI / 180); // "from" -> travel direction
  const windX = Math.sin(windRad) * 1.6;
  const windZ = -Math.cos(windRad) * 1.6;

  useFrame((state) => {
    const mat = materialRef.current;
    if (!mat) return;
    (mat.uniforms.uTime.value as number) = state.clock.elapsedTime;
  });

  if (!geometry || count === 0) return null;

  return (
    <mesh geometry={geometry} frustumCulled={false} renderOrder={1}>
      <shaderMaterial
        ref={materialRef}
        vertexShader={VERTEX}
        fragmentShader={FRAGMENT}
        transparent
        depthWrite={false}
        fog={false}
        uniforms={{
          uTime: { value: 0 },
          uWindX: { value: windX },
          uWindZ: { value: windZ },
          uFallSpeed: { value: FALL_SPEED },
          uSpanY: { value: SPAN_Y },
        }}
      />
    </mesh>
  );
}
