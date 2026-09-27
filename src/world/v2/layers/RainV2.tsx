/**
 * Rain, ported to v2 (live-data-spec.md §2.2 row 5; §2.3's own "reduced
 * motion: not mounted"). Same technique as reality-core's v1 `Rain.tsx` (one
 * `InstancedMesh`, fall driven by `uTime` in the vertex shader so the CPU
 * never re-touches per-instance matrices once built) and the SAME
 * `count = min(tierMax, round(mmh*400))` formula — restated here as
 * `../live/liveBinding.ts`'s `rainBinding` (row 5 is this lane's own row,
 * not v1's, so the pure function lives in this lane's own file) rather than
 * imported from v1's module, which stays a v1-only file.
 *
 * Reads the SAME `useNowModel()` bus every other v2 layer does (M53) — no
 * second weather fetch. `data-live-rain-count`/`data-live-rain` are written
 * by `LiveBinding.tsx`, not here, so the two layers never race to set the
 * same DOM attribute.
 */
import { useMemo, useRef, type JSX } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useNowModel } from "../useNowModel.ts";
import { deviceTier } from "../../deviceTier.ts";
import { useReducedMotion } from "../../../SceneActivity.tsx";
import { rainMode } from "../../Rain.tsx";
import { rainBinding } from "../live/liveBinding.ts";

export const layer = { id: "rain-v2", order: 45 };

const SPAN_XZ = 90; // metres — reality-core Rain.tsx's own field width
const SPAN_Y = 40;
const FALL_SPEED = 14; // m/s, a plausible light-rain terminal velocity

const VERTEX = /* glsl */ `
uniform float uTime;
uniform float uWindX;
uniform float uWindZ;
uniform float uFallSpeed;
uniform float uSpanY;
attribute float aPhase;
attribute vec3 aOrigin;
void main() {
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

function buildDropGeometry(count: number): THREE.InstancedBufferGeometry {
  const base = new THREE.PlaneGeometry(0.02, 0.4);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index;
  geo.attributes.position = base.attributes.position;
  geo.instanceCount = count;

  // Deterministic scatter — a reload that reshuffles the field would read as
  // a bug, not weather (same rationale as v1's Rain.tsx).
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

export default function RainV2(): JSX.Element | null {
  const nowModel = useNowModel(null);
  const reducedMotion = useReducedMotion();
  const tier = deviceTier();
  const weather = nowModel?.raw.sky?.weather ?? null;

  const precipMmH = weather?.precipMmH ?? 0;
  const mode = rainMode(precipMmH, reducedMotion, tier);
  const count = mode === "on" ? rainBinding(precipMmH, tier).count : 0;

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
