/**
 * ECHO — the ghost hodi, the Sense and the attention murmur, one canvas
 * layer (this lane's own task list, master-plan.md#M26/#M55, idea-atlas.md
 * PATH-7 / SYS-4). `layers.ts`'s glob contract mounts every layer with NO
 * props, so this file — the one new canvas layer that needs the live
 * boat's own position — is also where the Sense (needs "distance from my
 * boat to another lantern") and the murmur (needs "how many lanterns are
 * near a landmark right now", including mine) naturally live, rather than
 * inventing a second canvas layer or threading a prop `layers.ts` doesn't
 * support.
 *
 * ponytail: `Hodi.tsx` (not in this lane's `owns`) keeps its own live
 * `HodiState` in a private ref — nothing outside it can read the real
 * boat's position. This layer instead runs its OWN copy of the exact same
 * deterministic sim, fed the exact same `input` singleton and clamped `dt`
 * each frame `driveSpline.ts`'s `step()` already guarantees is a pure
 * function of its arguments — so this copy tracks the real hull to the
 * same floating-point value, with one known gap: it spawns at the fixed
 * `DEFAULT_SPAWN_Z`-equivalent below rather than `WorldV2.tsx`'s real
 * time-of-day `spawn.pos[2]` (that value is computed in the hub and
 * `layers.ts` layers take no props). Upgrade: give `layers.ts` an optional
 * shared world-context value once a second layer needs the real spawn
 * point too.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Html } from "@react-three/drei";
import { Link } from "@tanstack/react-router";
import { usePresence } from "@playhtml/react";
import { spawnState, step, type HodiState } from "../driveSpline.ts";
import { valleyZ, sangamBasin } from "../valley.ts";
import { input } from "../../input.ts";
import { useReducedMotion } from "../../../SceneActivity.tsx";
import { worldPalette } from "../../palette.ts";
import { createEchoBuffer, replayEcho, atTwoBoatMooring, MOORING_RADIUS_M, type EchoFrame } from "../echo.ts";
import { createSenseTracker, playSenseBlip, emitSenseEvent, SENSE_MESSAGE, SENSE_RADIUS_M } from "../sense.ts";
import { createMurmurTracker, MURMUR_LINGER_MS } from "../murmur.ts";
import { LANDMARK_OPENS } from "../landmarkBindings.ts";
import { GHOST_CHANNEL, type GhostPresence } from "../../Ghosts.tsx";

export const layer = { id: "echo", order: 44 };

const PUBLISH_MS = 250;
const MAX_DT = 1 / 20;
/**
 * The one landmark the murmur watches. `valley.ts`'s `sangamBasin()` is the
 * only landmark-shaped world position this lane's `owns` can reach without
 * a `kits/architecture.ts` that doesn't exist yet (this file's module doc
 * comment on `landmarkBindings.ts`) — the confluence collar is also the
 * two-boat mooring point, and `LANDMARK_OPENS.bridge` is that same spot's
 * own routable id ("sangam-keystone-bridge" opens `/project/kmp-family").
 * ponytail: every OTHER landmark stays unwatched by the murmur until a
 * lane gives landmarks real (x, z) positions — extend `LANDMARK_POSITIONS`
 * (a small id -> point map) there and loop over it here instead of this
 * one hard-coded id.
 */
const CONFLUENCE_LANDMARK_ID = "bridge";
const MURMUR_RADIUS_M = 30;
/** The ghost hull's own placeholder box — Hodi.tsx's own hull half-beam and
 *  length, at the same scale (no GLB is mounted for the boat yet — see
 *  Hodi.tsx's own box-geometry placeholder). */
const GHOST_HULL_HALF_BEAM = 1.6;
const GHOST_HULL_LENGTH = 7;
/** How long a murmur ripple's expanding ring stays visible once it fires. */
const RIPPLE_DURATION_MS = 2600;

/** Cumulative elapsed-ms at each `path[i]` (path[0] is t=0, the recording's
 *  own start state) — lets the replay find "where along the recorded route
 *  is `elapsedMs` right now" without assuming a fixed frame pace. */
function cumulativeTimes(frames: readonly EchoFrame[]): number[] {
  const times = [0];
  let acc = 0;
  for (const f of frames) {
    acc += f.dtMs;
    times.push(acc);
  }
  return times;
}

export default function Echo() {
  const reducedMotion = useReducedMotion();
  const palette = worldPalette();
  const { presences, setMyPresence } = usePresence<GhostPresence>(GHOST_CHANNEL);

  const liveStateRef = useRef<HodiState>(spawnState(valleyZ("2023-02")));
  const bufferRef = useRef(createEchoBuffer());
  const senseTrackerRef = useRef(createSenseTracker());
  const murmurTrackerRef = useRef(createMurmurTracker());
  const lastPublishRef = useRef(0);
  const mooring = useMemo(() => sangamBasin(), []);

  // Ghost replay — held in refs (imperative mesh placement, Hodi.tsx's own
  // pattern) plus one bit of React state for the two-boat-mooring overlay,
  // which is the only part of this file anything outside the frame loop
  // needs to see.
  const ghostRef = useRef<{ path: HodiState[]; times: number[]; startedAt: number } | null>(null);
  const ghostGroupRef = useRef<THREE.Group>(null);
  const [twoBoatMoored, setTwoBoatMoored] = useState(false);
  const rippleUntilRef = useRef(0);
  // Test/verifier-visible markers (G11: "WebGL pixels are asserted only
  // through luminance probes and data-* attributes") — set only on real
  // transitions (never every frame), never read by any runtime logic in
  // this file, only by e2e.
  const [echoActive, setEchoActive] = useState(false);
  const [murmurCount, setMurmurCount] = useState(0);
  const [rippling, setRippling] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "e") return;
      const recording = bufferRef.current.snapshot();
      if (recording.frames.length === 0) return;
      const path = replayEcho(recording);
      ghostRef.current = { path, times: cumulativeTimes(recording.frames), startedAt: performance.now() };
      setEchoActive(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const ghostMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({ color: palette.probe, transparent: true, opacity: 0.35, depthWrite: false }),
    [palette.probe],
  );
  useEffect(() => () => ghostMaterial.dispose(), [ghostMaterial]);

  const rippleMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: palette.probe, transparent: true, opacity: 0.5, side: THREE.DoubleSide }), [palette.probe]);
  useEffect(() => () => rippleMaterial.dispose(), [rippleMaterial]);
  const rippleRef = useRef<THREE.Mesh>(null);

  useFrame((_state, rawDelta) => {
    const dt = Math.min(rawDelta, MAX_DT);
    const axes = { steer: input.steer, throttle: input.throttle };
    const env = { reducedMotion };
    const before = liveStateRef.current;
    const next = step(before, axes, dt, env);
    liveStateRef.current = next;
    bufferRef.current.push({ stateBefore: before, input: axes, dtMs: dt * 1000, env });

    const nowMs = performance.now();
    if (nowMs - lastPublishRef.current >= PUBLISH_MS) {
      lastPublishRef.current = nowMs;
      // Publishing our own position onto the SAME channel Ghosts.tsx (v1)
      // uses is what makes the Sense mutual: another visitor's own Echo
      // layer sees us the same way we see them. v1 and v2 are never
      // mounted together (`data-world` is exclusive), so sharing the
      // channel never double-publishes for one visitor.
      setMyPresence({ x: next.x, z: next.z, heading: next.heading });
    }

    // ── the Sense ────────────────────────────────────────────────────────
    const distances = new Map<string, number>();
    for (const [id, p] of presences) {
      if (p.isMe || typeof p.x !== "number" || typeof p.z !== "number") continue;
      distances.set(id, Math.hypot(p.x - next.x, p.z - next.z));
    }
    const fired = senseTrackerRef.current.step(distances, SENSE_RADIUS_M);
    if (fired.length > 0) {
      emitSenseEvent({ message: SENSE_MESSAGE, at: Date.now() });
      playSenseBlip();
    }

    // ── the attention murmur ─────────────────────────────────────────────
    let atLandmark = Math.hypot(next.x - mooring.x, next.z - mooring.z) <= MURMUR_RADIUS_M ? 1 : 0;
    for (const [, p] of presences) {
      if (p.isMe || typeof p.x !== "number" || typeof p.z !== "number") continue;
      if (Math.hypot(p.x - mooring.x, p.z - mooring.z) <= MURMUR_RADIUS_M) atLandmark++;
    }
    const rippled = murmurTrackerRef.current.step(new Map([[CONFLUENCE_LANDMARK_ID, atLandmark]]), Date.now(), MURMUR_LINGER_MS);
    if (rippled.length > 0) {
      rippleUntilRef.current = nowMs + RIPPLE_DURATION_MS;
      setRippling(true);
    }
    setMurmurCount(atLandmark);

    // ── ghost hull placement (a cut per keyframe under reduced motion —
    //    matches Hodi.tsx's own fly-in "a cut... under reduced motion") ──
    const ghost = ghostRef.current;
    const group = ghostGroupRef.current;
    if (ghost && group) {
      const elapsed = nowMs - ghost.startedAt;
      const total = ghost.times[ghost.times.length - 1] ?? 0;
      if (elapsed >= total) {
        ghostRef.current = null;
        group.visible = false;
        setEchoActive(false);
        setTwoBoatMoored(false);
      } else {
        group.visible = true;
        let idx = 0;
        while (idx < ghost.times.length - 2 && ghost.times[idx + 1] < elapsed) idx++;
        const a = ghost.path[idx];
        const b = ghost.path[idx + 1] ?? a;
        const segStart = ghost.times[idx];
        const segEnd = ghost.times[idx + 1] ?? segStart;
        const t = reducedMotion || segEnd <= segStart ? 0 : Math.min(1, (elapsed - segStart) / (segEnd - segStart));
        // Reduced motion: hold at `a` for the whole segment (a cut on the
        // next keyframe), never a continuous lerp.
        const gx = a.x + (b.x - a.x) * t;
        const gz = a.z + (b.z - a.z) * t;
        group.position.set(gx, 0.3, gz);
        group.rotation.y = a.heading;

        setTwoBoatMoored(atTwoBoatMooring({ x: next.x, z: next.z }, { x: gx, z: gz }, mooring, MOORING_RADIUS_M));
      }
    } else if (group) {
      group.visible = false;
    }

    // ── ripple ring ──────────────────────────────────────────────────────
    const ring = rippleRef.current;
    if (ring) {
      const remaining = rippleUntilRef.current - nowMs;
      if (remaining > 0) {
        ring.visible = true;
        const t = 1 - remaining / RIPPLE_DURATION_MS;
        const scale = 4 + t * 26;
        ring.scale.set(scale, scale, scale);
        rippleMaterial.opacity = reducedMotion ? 0.4 : 0.55 * (1 - t);
        ring.position.set(mooring.x, 0.06, mooring.z);
      } else {
        ring.visible = false;
        setRippling(false);
      }
    }
  });

  const kmpFamily = LANDMARK_OPENS.bridge;

  return (
    <group name="echo">
      <group ref={ghostGroupRef} visible={false}>
        <mesh material={ghostMaterial} position={[0, 0, 0]}>
          <boxGeometry args={[GHOST_HULL_HALF_BEAM * 2, 0.5, GHOST_HULL_LENGTH]} />
        </mesh>
      </group>

      <mesh ref={rippleRef} material={rippleMaterial} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.85, 1, 48]} />
      </mesh>

      {twoBoatMoored && kmpFamily?.kind === "project" && (
        <Html position={[mooring.x, 3, mooring.z]} center distanceFactor={22} style={{ pointerEvents: "auto" }}>
          <div
            data-two-boat-mooring="true"
            className="whitespace-nowrap rounded-xl border border-line bg-card/95 px-3 py-2 text-xs text-text shadow-lg backdrop-blur"
          >
            <p className="font-display font-semibold text-accent">Two consumers, one keystone</p>
            <p className="mt-1 max-w-[220px] whitespace-normal text-muted">
              Your echo and you, moored together: the same shape as extracting a module on its second consumer.
            </p>
            <Link to="/project/$slug" params={{ slug: kmpFamily.target }} className="mt-1 inline-block font-mono text-xs text-accent hover:underline">
              kmp-family →
            </Link>
          </div>
        </Html>
      )}

      <Html style={{ display: "none" }}>
        <div
          aria-hidden="true"
          data-echo-active={echoActive}
          data-echo-reduced-motion={reducedMotion}
          data-two-boat-mooring={twoBoatMoored}
          data-murmur-count={murmurCount}
          data-murmur-rippling={rippling}
        />
      </Html>
    </group>
  );
}
