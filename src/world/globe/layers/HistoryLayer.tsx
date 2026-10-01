/** WAVE 6 LANE X3 (time machine: USGS history replay while scrubbing) owns
 *  this file. Mounted by GlobeScene.tsx alongside HazardLayer, gated the
 *  same way (`layers.hazards`) but hidden at `timeOffsetMin === 0` — the
 *  live HazardLayer already owns "now"; this only replays quakes the
 *  scrubber has wound back or forward across. One InstancedMesh (house
 *  convention: quakeGlyphs.tsx/hazardHalos.tsx each use one per glyph kind),
 *  rebuilt every frame from usgsHistory's sorted columns via a sliding
 *  window (`replayWindow`) and `pulseState`'s eased envelope — no React
 *  state, no allocation beyond the fixed-size scratch below. */
import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { GLOBE_RADIUS } from "../geoMath.ts";
import { useReducedMotion } from "../../../SceneActivity.tsx";
import { useGlobe } from "../globeStore.ts";
import { pulseState, type UsgsHistory } from "../timeMachine/usgsHistory.ts";
import { estimatePlaybackSpeed } from "../timeMachine/replayWindow.ts";
import { magnitudeToRadius } from "./quake.ts";
import { loadReplaySnapshot } from "../timeMachine/eventStripHistory.ts";

const RING_GEOMETRY = new THREE.RingGeometry(0.72, 1, 24);
const MAX_REPLAY = 48;
const dummy = new THREE.Object3D();
const tmpColor = new THREE.Color();
const scratch = new THREE.Vector3();
const UP = new THREE.Vector3(0, 0, 1);
// Two-slot scratch for UsgsHistory.eventsBetween's half-open [start, end)
// index range — reused every frame, never (re)allocated in useFrame.
const rangeOut = new Uint32Array(2);

// ponytail: the same shallow-warm/deep-cool ramp as quake.ts's
// depthToColor, duplicated as raw RGB rather than imported — that helper
// composes a hex STRING (an allocation) every call, and this loop runs
// every frame; importing it would mean allocating a throwaway string per
// visible pulse per frame just to immediately re-parse it into a Color.
const SHALLOW_RGB = [255, 183, 3] as const;
const DEEP_RGB = [58, 12, 163] as const;
const DEPTH_COOL_KM = 300;

/** e2e-only read seam, same convention as HazardLayer's `__HAZARD_DEBUG__`
 *  (a plain global, not a DOM node — that lane's own comment measured a
 *  chunk-budget regression from an `<Html>`-based seam on a lazy layer). */
declare global {
  interface Window {
    __HISTORY_DEBUG__?: { status: "idle" | "loading" | "live" | "failed"; total: number; activePulses: number };
  }
}

export default function HistoryLayer({ now, tier }: { now: Date; tier: 1 | 2 | 3 }) {
  const reducedMotion = useReducedMotion();
  const offset = useGlobe((s) => s.timeOffsetMin);
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const historyRef = useRef<UsgsHistory | null | undefined>(undefined); // undefined: not requested yet
  const speedRef = useRef(0);
  const prevRef = useRef({ wall: 0, sim: 0 });

  // The strip and renderer select from the same cached records. Key delivery
  // on replay activation so a bin/time change cannot cancel the pending load.
  const replaying = offset !== 0;

  // Fetch lazily, once: only once the visitor has actually scrubbed away
  // from "now". A component-instance ref (not React state) holds the
  // result — re-rendering on arrival would fight the useFrame loop below
  // for who owns "is there anything to draw this frame".
  useEffect(() => {
    if (!replaying || tier === 3) return;
    if (typeof window !== "undefined") window.__HISTORY_DEBUG__ = { status: "loading", total: 0, activePulses: 0 };
    let alive = true;
    loadReplaySnapshot().then(({ history: h }) => {
      if (!alive) return;
      historyRef.current = h;
      if (typeof window !== "undefined") {
        window.__HISTORY_DEBUG__ = { status: h ? "live" : "failed", total: h?.times.length ?? 0, activePulses: 0 };
      }
    });
    return () => {
      alive = false;
    };
  }, [replaying, tier]);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const wallNow = performance.now();
    const simNowMs = now.getTime();
    if (prevRef.current.wall !== 0) {
      speedRef.current = estimatePlaybackSpeed(speedRef.current, simNowMs - prevRef.current.sim, wallNow - prevRef.current.wall);
    }
    prevRef.current.wall = wallNow;
    prevRef.current.sim = simNowMs;

    const history = historyRef.current;
    if (offset === 0 || tier === 3 || !history || history.times.length === 0) {
      if (mesh.count !== 0) mesh.count = 0;
      return;
    }

    const end = simNowMs;
    const start = end - 2000 * Math.max(Math.abs(speedRef.current), 1);
    history.eventsBetween(start, end, rangeOut);
    let n = 0;
    for (let i = rangeOut[0]; i < rangeOut[1] && n < MAX_REPLAY; i++) {
      const strength = reducedMotion ? 1 : pulseState(history.times[i], simNowMs, speedRef.current);
      if (strength <= 0) continue;

      // Inlined geoMath.latLonToXyz formula, writing straight into the
      // module-scope scratch vector rather than calling it: that helper
      // returns a fresh plain object every call, and this loop runs every
      // frame for up to MAX_REPLAY events — see this file's header comment
      // on the "zero per-frame allocation" brief for why that matters here
      // specifically (quakeGlyphs/hazardHalos tolerate the same allocation
      // because their per-frame overlays are gated to far fewer instances
      // and this lane's brief asked for stricter).
      const latR = (history.lat[i] * Math.PI) / 180;
      const lonR = (history.lon[i] * Math.PI) / 180;
      const cosLat = Math.cos(latR);
      scratch.set(cosLat * Math.cos(lonR), Math.sin(latR), -cosLat * Math.sin(lonR));

      dummy.position.copy(scratch).multiplyScalar(GLOBE_RADIUS + 0.02);
      dummy.quaternion.setFromUnitVectors(UP, scratch);
      dummy.scale.setScalar(magnitudeToRadius(history.mag[i]) * (1 + strength * 0.8));
      dummy.updateMatrix();
      mesh.setMatrixAt(n, dummy.matrix);

      const t = Math.max(0, Math.min(1, history.depth[i] / DEPTH_COOL_KM));
      tmpColor
        .setRGB(
          (SHALLOW_RGB[0] + (DEEP_RGB[0] - SHALLOW_RGB[0]) * t) / 255,
          (SHALLOW_RGB[1] + (DEEP_RGB[1] - SHALLOW_RGB[1]) * t) / 255,
          (SHALLOW_RGB[2] + (DEEP_RGB[2] - SHALLOW_RGB[2]) * t) / 255,
        )
        .multiplyScalar(strength);
      mesh.setColorAt(n, tmpColor);
      n++;
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    if (typeof window !== "undefined" && window.__HISTORY_DEBUG__) window.__HISTORY_DEBUG__.activePulses = n;
  });

  if (tier === 3) return null;

  return (
    <instancedMesh ref={meshRef} args={[RING_GEOMETRY, undefined, MAX_REPLAY]} count={0} frustumCulled={false}>
      <meshBasicMaterial toneMapped={false} transparent blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
    </instancedMesh>
  );
}
