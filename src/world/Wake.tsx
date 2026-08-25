import { useMemo, useRef, type JSX } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { CITY } from "./city.ts";
import { heightAt, laneAtX } from "./heightfield.ts";
import { telemetry } from "./telemetry.ts";
import { laneColors, READHEAD_HEX, worldPalette } from "./palette.ts";

/**
 * §7 LAYER B — THE WAKE, as a short VERTICAL light wall rather than a
 * ground-hugging ribbon (owner refinement, mid-build: a flat ribbon
 * foreshortens into a thin line from the chase camera — 3.2m up, 9m back —
 * and disappears against the plate texture, which is part of why the old
 * path read as "a funny quirk" in the first place; a wall standing 0.4m off
 * the terrain keeps real screen height from behind, the only angle the
 * driver ever has). Reference is a light-cycle trail's GEOMETRY only — no
 * Tron styling: no cyan/orange pairing, no grid horizon, no derezz, no hue
 * outside §2. Pure emissive geometry, never an obstacle — see obstacles.ts,
 * untouched — you drive through it.
 *
 * Plus the pulsing head ring, "always the hottest pixel on screen". Both are
 * their own mesh (unlike Layers A and C, which live inside Terrain.tsx's
 * fragment shader) because a wall is real geometry, not a property of a
 * ground fragment.
 *
 * The FIXED-LENGTH 240-sample ring buffer never grows: two `Float32Array`s
 * sized once (`RING * 2` vertices for the strip, `(RING-1) * 6` indices) and
 * mutated in place every frame — the same "write into a pre-sized buffer,
 * never reallocate" contract Trail.tsx's own ring buffers keep, just spent
 * on a wall mesh instead of a `<Line>`.
 *
 * Sampling is DISTANCE-based (every ~0.35m of travel), not per render
 * frame: a per-frame sample would make the ring's total length depend on
 * framerate, and the doc's "gone by ~45m back" is a distance claim. Fading
 * is still TIME-based (`exp(-age / 2.5)`, exactly as specified) so a parked
 * car's wake ages out in real seconds rather than freezing forever once no
 * new samples are being recorded.
 */

const RING = 240;
const SAMPLE_SPACING = 0.35;
const WALL_HEIGHT = 0.4;
const BASE_LIFT = 0.02; // clears z-fighting with the terrain mesh
const DECAY_S = 2.5;
const HEAD_Y_OFFSET = 0.04;
const HEAD_PULSE_HZ = 1.4;
const BLADE_HEIGHT = 0.9;

export function buildStripIndices(n: number): Uint16Array {
  const idx = new Uint16Array((n - 1) * 6);
  let p = 0;
  for (let k = 0; k < n - 1; k++) {
    const a = k * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    idx[p++] = a;
    idx[p++] = c;
    idx[p++] = b;
    idx[p++] = b;
    idx[p++] = c;
    idx[p++] = d;
  }
  return idx;
}

type RingState = {
  x: Float32Array;
  y: Float32Array;
  z: Float32Array;
  born: Float32Array;
  writeIndex: number;
  lastX: number;
  lastZ: number;
  clock: number;
};

function buildRingState(): RingState {
  return {
    x: new Float32Array(RING).fill(telemetry.x),
    y: new Float32Array(RING).fill(heightAt(telemetry.x, telemetry.z) + BASE_LIFT),
    z: new Float32Array(RING).fill(telemetry.z),
    // Far enough in the past that every slot starts fully decayed —
    // an unfilled ring reads as an invisible trail, not a stray line back
    // to the origin.
    born: new Float32Array(RING).fill(-1000),
    writeIndex: 0,
    lastX: telemetry.x,
    lastZ: telemetry.z,
    clock: 0,
  };
}

export function Wake(): JSX.Element {
  const c = worldPalette();
  const hexes = laneColors(c);

  const stateRef = useRef<RingState | null>(null);
  if (stateRef.current === null) stateRef.current = buildRingState();
  const state = stateRef.current;

  const positions = useMemo(() => new Float32Array(RING * 2 * 3), []);
  const colors = useMemo(() => new Float32Array(RING * 2 * 3), []);
  const indices = useMemo(() => buildStripIndices(RING), []);
  const scratchColor = useRef(new THREE.Color());

  const geometryRef = useRef<THREE.BufferGeometry>(null);
  const headRingRef = useRef<THREE.Mesh>(null);
  const headMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const bladeRefs = useRef<(THREE.Object3D | null)[]>([null, null]);

  useFrame((_, delta) => {
    const st = state;
    st.clock += delta;

    const dx = telemetry.x - st.lastX;
    const dz = telemetry.z - st.lastZ;
    if (Math.hypot(dx, dz) >= SAMPLE_SPACING) {
      st.x[st.writeIndex] = telemetry.x;
      st.y[st.writeIndex] = heightAt(telemetry.x, telemetry.z) + BASE_LIFT;
      st.z[st.writeIndex] = telemetry.z;
      st.born[st.writeIndex] = st.clock;
      st.writeIndex = (st.writeIndex + 1) % RING;
      st.lastX = telemetry.x;
      st.lastZ = telemetry.z;
    }

    scratchColor.current.set(hexes[laneAtX(telemetry.x)]);
    const col = scratchColor.current;

    for (let k = 0; k < RING; k++) {
      // Chronological order: writeIndex is the OLDEST slot (the next one to
      // be overwritten), so k=0 there and k=RING-1 at the newest sample.
      const idx = (st.writeIndex + k) % RING;

      const age = st.clock - st.born[idx];
      const alpha = st.born[idx] < -100 ? 0 : Math.exp(-age / DECAY_S);

      // A vertical wall, not a lateral ribbon: both vertices sit at the same
      // (x, z) — the sample's own point on the terrain — one at its base,
      // one WALL_HEIGHT above it. No tangent/perpendicular math needed.
      const vi = k * 6;
      positions[vi] = st.x[idx];
      positions[vi + 1] = st.y[idx];
      positions[vi + 2] = st.z[idx];
      positions[vi + 3] = st.x[idx];
      positions[vi + 4] = st.y[idx] + WALL_HEIGHT;
      positions[vi + 5] = st.z[idx];

      colors[vi] = col.r * alpha;
      colors[vi + 1] = col.g * alpha;
      colors[vi + 2] = col.b * alpha;
      colors[vi + 3] = col.r * alpha;
      colors[vi + 4] = col.g * alpha;
      colors[vi + 5] = col.b * alpha;
    }

    const geo = geometryRef.current;
    if (geo) {
      const posAttr = geo.attributes.position as THREE.BufferAttribute;
      const colAttr = geo.attributes.color as THREE.BufferAttribute;
      posAttr.needsUpdate = true;
      colAttr.needsUpdate = true;
      geo.computeBoundingSphere();
    }

    // The pulsing head ring — "always the hottest pixel on screen".
    const pulse = 0.5 + 0.5 * Math.sin(st.clock * Math.PI * 2 * HEAD_PULSE_HZ);
    if (headRingRef.current) {
      headRingRef.current.position.set(telemetry.x, telemetry.y + HEAD_Y_OFFSET, telemetry.z);
    }
    if (headMatRef.current) headMatRef.current.opacity = 0.5 + pulse * 0.5;

    // The read-line's two edge blade posts (§7 Layer A) — locked to the
    // car's Z, at the corridor's two rims (x = +/-CITY.halfWidth), which
    // heightAt's own lane-edge falloff already flattens to CITY.groundY.
    for (let i = 0; i < 2; i++) {
      const blade = bladeRefs.current[i];
      if (blade) blade.position.set(i === 0 ? -CITY.halfWidth : CITY.halfWidth, CITY.groundY + BLADE_HEIGHT / 2, telemetry.z);
    }
  });

  return (
    <>
      <mesh frustumCulled={false}>
        <bufferGeometry ref={geometryRef}>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
          <bufferAttribute attach="attributes-color" args={[colors, 3]} />
          <bufferAttribute attach="index" args={[indices, 1]} />
        </bufferGeometry>
        <meshBasicMaterial
          vertexColors
          transparent
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>

      <mesh ref={headRingRef} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.4, 0.65, 24]} />
        <meshBasicMaterial
          ref={headMatRef}
          color={READHEAD_HEX}
          transparent
          opacity={1}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>

      {[0, 1].map((i) => (
        <mesh
          key={i}
          ref={(m) => {
            bladeRefs.current[i] = m;
          }}
        >
          <boxGeometry args={[0.12, BLADE_HEIGHT, 0.12]} />
          <meshStandardMaterial color={READHEAD_HEX} emissive={READHEAD_HEX} emissiveIntensity={1.4} toneMapped={false} />
        </mesh>
      ))}
    </>
  );
}
