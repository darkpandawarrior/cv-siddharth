// LANE W6: the CI-family ring's render layer -- one arc segment per sibling
// KMP-family repo (familyCi.ts's own math), coloured by its latest real
// status, with a brief pulse on a status change between polls. `ci === null`
// (feed down) draws nothing: "feed down: segments hidden" -- ReachLayer.tsx
// reports why in the shared "reach" status line.
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { latLonToXyz, GLOBE_RADIUS } from "../geoMath.ts";
import { PUNE } from "../../../lib/sky.ts";
import { readColor } from "../../../themeColorThree.ts";
import { useGlobe } from "../globeStore.ts";
import { useReducedMotion } from "../../../SceneActivity.tsx";
import { buildCiSegments, changedSlugs, CI_RING_RADIUS, type CiSegment, type CiSegmentStatus } from "./familyCi.ts";
import { ensureReachDebug } from "./reachDebug.ts";
import type { SignalsResponse } from "../../../../api/_lib/signals-handler.ts";

const TUBE = 0.012;
const PULSE_MS = 900;
const PULSE_BOOST = 0.5;
// Pune declutter (P4, wave 9): this used to be the exact same 0.02 as
// reachAppRing.tsx's SURFACE_EPS and layers/TogetherLayer.tsx's RING_LIFT,
// which z-fought into the moire the design/perf audits both flagged over
// Pune. Now the second step of that stack - see reachAppRing.tsx's own
// comment for the full ordering (ReachColumns.tsx 0.008 < this 0.024 is
// wrong on purpose too: the CI ring's arc (0.85) is the widest of the
// three flat rings, so it sits above the app ring (0.55) but the actual
// numeric height only needs to differ, not track arc size).
export const SURFACE_EPS = 0.024;

function statusText(s: CiSegmentStatus): string {
  return s === "pass" ? "passing" : s === "fail" ? "failing" : "unmeasured";
}

/** `animate` gates the pulse-on-change effect only (T2's "CI ring, no glyph
 *  animation") -- colours and clicks stay correct either way. */
export function FamilyCiRing({ ci, animate }: { ci: SignalsResponse["ci"]; animate: boolean }) {
  const select = useGlobe((s) => s.select);
  const reducedMotion = useReducedMotion();
  const signal = useMemo(() => readColor("--color-signal", "#3ddc84"), []);
  const danger = useMemo(() => readColor("--color-danger", "#ff5c5c"), []);
  const muted = useMemo(() => readColor("--color-muted", "#8b909a"), []);
  const colorFor = (s: CiSegmentStatus) => (s === "pass" ? signal : s === "fail" ? danger : muted);

  const segments = useMemo(() => buildCiSegments(ci), [ci]);
  const prevRef = useRef<CiSegment[] | null>(null);
  const pulseStartRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const dbg = ensureReachDebug();
    dbg.ciSegments = segments.map((s) => ({ slug: s.slug, status: s.status }));
    if (animate && !reducedMotion) {
      const changed = changedSlugs(prevRef.current, segments);
      const nowMs = performance.now();
      for (const slug of changed) pulseStartRef.current.set(slug, nowMs);
    }
    prevRef.current = segments;
  }, [segments, animate, reducedMotion]);

  const normal = useMemo(() => {
    const p = latLonToXyz(PUNE.lat, PUNE.lon);
    return new THREE.Vector3(p.x, p.y, p.z);
  }, []);
  const quaternion = useMemo(() => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal), [normal]);
  const position = useMemo(() => normal.clone().multiplyScalar(GLOBE_RADIUS + SURFACE_EPS), [normal]);

  const meshRefs = useRef<(THREE.Mesh | null)[]>([]);

  useFrame(() => {
    if (!animate || reducedMotion) return;
    const nowMs = performance.now();
    for (let i = 0; i < segments.length; i++) {
      const mesh = meshRefs.current[i];
      if (!mesh) continue;
      const start = pulseStartRef.current.get(segments[i].slug);
      const elapsed = start === undefined ? Infinity : nowMs - start;
      mesh.scale.setScalar(elapsed < PULSE_MS ? 1 + PULSE_BOOST * (1 - elapsed / PULSE_MS) : 1);
    }
  });

  function onPick(segment: CiSegment) {
    select({
      id: `reach-ci:${segment.slug}`,
      kind: "reach-ci",
      title: segment.slug,
      rows: [
        { label: "status", value: statusText(segment.status) },
        { label: "when", value: segment.newestAt ?? "no completed run yet" },
      ],
      source: "GitHub Actions via /api/signals, 2 min cache",
      live: true,
    });
  }

  if (segments.length === 0) return null;

  return (
    <group position={position} quaternion={quaternion}>
      <group rotation={[-Math.PI / 2, 0, 0]}>
        {segments.map((s, i) => (
          <group key={s.slug} rotation={[0, 0, s.angleStart]}>
            <mesh
              ref={(m) => {
                meshRefs.current[i] = m;
              }}
              renderOrder={2}
              onClick={() => onPick(s)}
            >
              <torusGeometry args={[CI_RING_RADIUS, TUBE, 6, 32, s.angleLength]} />
              {/* depthWrite false + polygonOffset: the second step of the
                  Pune ring stack (reachAppRing.tsx's own comment has the
                  full ordering) - stops this translucent arc fighting its
                  neighbours for a shared pixel. */}
              <meshBasicMaterial color={colorFor(s.status)} toneMapped={false} transparent opacity={0.9} depthWrite={false} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}
