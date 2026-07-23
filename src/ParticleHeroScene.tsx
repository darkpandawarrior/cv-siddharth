import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import { AdditiveBlending, Color, MathUtils } from "three";
import type { BufferAttribute, Group, Points as ThreePoints } from "three";

/**
 * Dense emissive point-swarm hero visual (style ref: particles.casberry.in,
 * Siddharth's own AI Particle Simulator). Five parametric point clouds —
 * a grounding sphere plus four "a grieving mind's mathematics" impossible
 * shapes (Möbius strip, trefoil knot, Klein-bottle figure-8 immersion,
 * Lorenz attractor) — are each sampled once into a fixed-length Float32Array
 * at init, then cross-faded into each other on a slow timer. Point i always
 * morphs into point i of the next formation, so no correspondence solving is
 * needed: every frame is just `positions[i] = lerp(a[i], b[i], eased)`
 * written straight into the live BufferAttribute — zero per-frame
 * allocation. THREE.Points + BufferGeometry + additive PointsMaterial, the
 * three.js already installed here — no new dependency.
 */

const HOLD_S = 4; // seconds a formation sits still before the next morph starts
const MORPH_S = 5; // seconds a morph transition takes (4-6s ask)
const KICK_SCALE = 0.9; // peak outward offset (world units) from a tap/click

// Low-discrepancy 2D sequence (plastic-ratio R2) — gives even coverage of a
// parametric (u, v) surface without a grid or Math.random(), so sampling
// stays deterministic across the desktop/mobile point counts.
const PLASTIC = 1.32471795724474602596;
const R2_A = 1 / PLASTIC;
const R2_B = 1 / (PLASTIC * PLASTIC);
function r2(i: number): [number, number] {
  return [(R2_A * (i + 1)) % 1, (R2_B * (i + 1)) % 1];
}

function fillBuffer(n: number, sample: (i: number, n: number) => [number, number, number]): Float32Array {
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const [x, y, z] = sample(i, n);
    arr[i * 3] = x;
    arr[i * 3 + 1] = y;
    arr[i * 3 + 2] = z;
  }
  return arr;
}

// 1. Grounding shape — Fibonacci sphere, uniform point density, no poles.
function sphereAt(i: number, n: number): [number, number, number] {
  const y = 1 - (i / Math.max(n - 1, 1)) * 2;
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = 2.399963 * i; // golden angle
  return [Math.cos(theta) * r * 1.6, y * 1.6, Math.sin(theta) * r * 1.6];
}

// 2. Möbius strip — one half-twist band, the simplest "impossible" surface.
function mobiusAt(i: number): [number, number, number] {
  const [su, sv] = r2(i);
  const u = su * Math.PI * 2;
  const v = (sv - 0.5) * 0.9;
  const half = u / 2;
  const r = 1.35 + v * Math.cos(half);
  return [r * Math.cos(u), v * Math.sin(half), r * Math.sin(u)];
}

// 3. Trefoil knot — classic (2,3) torus knot curve.
function trefoilAt(i: number, n: number): [number, number, number] {
  const t = (i / n) * Math.PI * 2;
  const s = 0.5;
  return [s * (Math.sin(t) + 2 * Math.sin(2 * t)), s * (Math.cos(t) - 2 * Math.cos(2 * t)), s * -Math.sin(3 * t)];
}

// 4. Klein bottle — the standard "figure-8" immersion into 3D.
function kleinAt(i: number): [number, number, number] {
  const [su, sv] = r2(i);
  const u = su * Math.PI * 2;
  const v = sv * Math.PI * 2;
  const a = 2.2;
  const half = u / 2;
  const ring = a + Math.cos(half) * Math.sin(v) - Math.sin(half) * Math.sin(2 * v);
  const s = 0.42;
  return [s * ring * Math.cos(u), s * (Math.sin(half) * Math.sin(v) + Math.cos(half) * Math.sin(2 * v)), s * ring * Math.sin(u)];
}

// 5. Lorenz attractor — trajectory integrated once via RK4, then resampled
// by index into exactly n points. This is the only formation that needs a
// precomputed trajectory rather than a closed-form (u, v) -> (x, y, z) map.
function lorenzBuffer(n: number): Float32Array {
  const sigma = 10;
  const rho = 28;
  const beta = 8 / 3;
  const dt = 0.006;
  const steps = 9000;
  const warmup = 200; // drop the short transient before the orbit settles
  const traj = new Float32Array((steps - warmup) * 3);
  let x = 0.1;
  let y = 0;
  let z = 0;
  const deriv = (px: number, py: number, pz: number): [number, number, number] => [
    sigma * (py - px),
    px * (rho - pz) - py,
    px * py - beta * pz,
  ];
  let w = 0;
  for (let i = 0; i < steps; i++) {
    const k1 = deriv(x, y, z);
    const k2 = deriv(x + (k1[0] * dt) / 2, y + (k1[1] * dt) / 2, z + (k1[2] * dt) / 2);
    const k3 = deriv(x + (k2[0] * dt) / 2, y + (k2[1] * dt) / 2, z + (k2[2] * dt) / 2);
    const k4 = deriv(x + k3[0] * dt, y + k3[1] * dt, z + k3[2] * dt);
    x += (dt / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
    y += (dt / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
    z += (dt / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]);
    if (i >= warmup) {
      traj[w++] = x;
      traj[w++] = y;
      traj[w++] = z;
    }
  }
  const points = traj.length / 3;
  const scale = 1 / 16;
  return fillBuffer(n, (i) => {
    const p = Math.floor((i / n) * points) * 3;
    return [traj[p] * scale, (traj[p + 2] - 27) * scale, traj[p + 1] * scale];
  });
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

function readColor(varName: string, fallback: string): Color {
  const v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return new Color(v || fallback);
}

function Swarm({ count, reducedMotion, interactive }: { count: number; reducedMotion: boolean; interactive: boolean }) {
  const pointsRef = useRef<ThreePoints>(null);
  const groupRef = useRef<Group>(null);
  const positionAttrRef = useRef<BufferAttribute>(null);
  const phase = useRef(0); // seconds elapsed in the current hold+morph cycle
  const formationIdx = useRef(0);
  // Desktop drag-to-spin — same shape as SkillsOrbitScene/FoundationGraphScene's
  // drag ref, reused rather than reinvented.
  const drag = useRef({ on: false, x: 0, startX: 0, startY: 0, moved: false, vel: 0 });
  const parallax = useRef(0);
  // Tap/click kick: a single decaying scalar (0..1), not a per-point buffer —
  // ponytail: pulses every point outward from the swarm's own center rather
  // than raycasting the exact tap position onto a morphing point cloud (points
  // are sparse and hard to hit-test precisely); upgrade to a localized kick if
  // that precision is ever worth the raycast cost.
  const kickAmp = useRef(0);

  // Five pre-baked N-point buffers — computed once per mount, reused for
  // every morph. Cycling through them again from the top after Lorenz keeps
  // the sequence: grounded -> impossible x3 -> chaotic -> grounded again.
  const formations = useMemo(
    () => [fillBuffer(count, sphereAt), fillBuffer(count, mobiusAt), fillBuffer(count, trefoilAt), fillBuffer(count, kleinAt), lorenzBuffer(count)],
    [count],
  );

  // The live working buffer — same array identity for the whole component
  // lifetime, mutated in place every morph frame, never reallocated.
  const positions = useMemo(() => formations[0].slice(), [formations]);

  // Theme-aware: read the site's own accent/accent2 CSS variables once, so
  // this stays in sync with whatever palette is active (light or dark).
  const colors = useMemo(() => {
    const c1 = readColor("--color-accent", "#3ddc84");
    const c2 = readColor("--color-accent2", "#5ee6ff");
    const arr = new Float32Array(count * 3);
    const mixed = new Color();
    for (let i = 0; i < count; i++) {
      const t = (Math.sin((i / count) * Math.PI * 3) + 1) / 2;
      mixed.copy(c1).lerp(c2, t);
      arr[i * 3] = mixed.r;
      arr[i * 3 + 1] = mixed.g;
      arr[i * 3 + 2] = mixed.b;
    }
    return arr;
  }, [count]);

  useFrame(({ pointer }, delta) => {
    if (reducedMotion) return; // static frame only — frameloop="demand" never asks for another

    const pts = pointsRef.current;
    phase.current += delta;
    drag.current.vel = MathUtils.damp(drag.current.vel, 0, 2, delta);
    kickAmp.current = MathUtils.damp(kickAmp.current, 0, 3, delta);
    if (pts) {
      pts.rotation.y += delta * 0.045 + drag.current.vel;
      const leanTarget = interactive ? pointer.y * -0.09 : 0;
      parallax.current = MathUtils.damp(parallax.current, leanTarget, 4, delta);
      pts.rotation.x = Math.sin(phase.current * 0.12) * 0.07 + parallax.current; // wobble + cursor lean
      pts.rotation.z = interactive ? MathUtils.damp(pts.rotation.z, pointer.x * -0.05, 4, delta) : 0;
    }

    const morphing = phase.current > HOLD_S;
    const kicking = kickAmp.current > 0.001;
    if (!morphing && !kicking) return; // nothing to rewrite this frame

    const from = formationIdx.current;
    const to = (from + 1) % formations.length;
    const a = formations[from];
    const kick = kickAmp.current * KICK_SCALE;

    if (morphing) {
      const t = Math.min((phase.current - HOLD_S) / MORPH_S, 1);
      const eased = easeInOutCubic(t);
      const b = formations[to];
      for (let i = 0; i < positions.length; i += 3) {
        let x = a[i] + (b[i] - a[i]) * eased;
        let y = a[i + 1] + (b[i + 1] - a[i + 1]) * eased;
        let z = a[i + 2] + (b[i + 2] - a[i + 2]) * eased;
        if (kicking) {
          const len = Math.hypot(x, y, z) || 1;
          x += (x / len) * kick;
          y += (y / len) * kick;
          z += (z / len) * kick;
        }
        positions[i] = x;
        positions[i + 1] = y;
        positions[i + 2] = z;
      }
      if (t >= 1) {
        formationIdx.current = to;
        phase.current = 0;
      }
    } else {
      // Holding, but a kick is still decaying — rebuild from the resting
      // formation each frame instead of leaving positions stale.
      for (let i = 0; i < positions.length; i += 3) {
        const bx = a[i];
        const by = a[i + 1];
        const bz = a[i + 2];
        const len = Math.hypot(bx, by, bz) || 1;
        positions[i] = bx + (bx / len) * kick;
        positions[i + 1] = by + (by / len) * kick;
        positions[i + 2] = bz + (bz / len) * kick;
      }
    }
    if (positionAttrRef.current) positionAttrRef.current.needsUpdate = true;
  });

  const triggerKick = () => {
    kickAmp.current = 1;
  };

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    drag.current.on = true;
    drag.current.x = e.clientX;
    drag.current.startX = e.clientX;
    drag.current.startY = e.clientY;
    drag.current.moved = false;
  };
  const onMove = (e: ThreeEvent<PointerEvent>) => {
    if (!drag.current.on) return;
    if (Math.abs(e.clientX - drag.current.startX) > 4 || Math.abs(e.clientY - drag.current.startY) > 4) drag.current.moved = true;
    if (interactive) drag.current.vel = (e.clientX - drag.current.x) * 0.0004;
    drag.current.x = e.clientX;
  };
  const onUp = () => {
    if (drag.current.on && !drag.current.moved) triggerKick(); // stationary press == tap, never a swipe
    drag.current.on = false;
  };

  return (
    <group ref={groupRef} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}>
      {/* Invisible hit target — THREE.Points raycasting against sparse points
          is unreliable, so a plain transparent sphere sized to the widest
          formation (~2.2 units) catches drag/tap over the whole swarm. */}
      <mesh visible>
        <sphereGeometry args={[2.3, 12, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute ref={positionAttrRef} attach="attributes-position" args={[positions, 3]} />
          <bufferAttribute attach="attributes-color" args={[colors, 3]} />
        </bufferGeometry>
        <pointsMaterial size={0.045} vertexColors transparent opacity={0.85} blending={AdditiveBlending} depthWrite={false} sizeAttenuation />
      </points>
    </group>
  );
}

export interface ParticleHeroSceneProps {
  count: number;
  reducedMotion: boolean;
  paused: boolean; // driven by the parent's IntersectionObserver
  // Desktop fine-pointer + motion-safe: enables idle cursor-lean + drag-to-spin.
  // Tap-to-kick works regardless of this flag — a stationary press is never a
  // scroll gesture, so it's safe on touch too.
  interactive: boolean;
}

/**
 * frameloop does the pause/static-frame work for us — "always" while
 * visible and motion-safe, "never" while scrolled off-screen (stops the
 * internal rAF loop entirely), "demand" for reduced-motion (paints exactly
 * once on mount, then nothing — invalidate() is never called again).
 */
export default function ParticleHeroScene({ count, reducedMotion, paused, interactive }: ParticleHeroSceneProps) {
  const frameloop = reducedMotion ? "demand" : paused ? "never" : "always";
  return (
    <Canvas
      dpr={[1, 1.5]}
      frameloop={frameloop}
      camera={{ position: [0, 0, 4.4], fov: 55 }}
      gl={{ antialias: false, alpha: true, powerPreference: "low-power" }}
      style={{ position: "absolute", inset: 0 }}
    >
      <Swarm count={count} reducedMotion={reducedMotion} interactive={interactive} />
    </Canvas>
  );
}
