/**
 * Satellites (open-data-spec.md §3 A2 "Client binding"; master-plan.md#P3-03
 * tasks 3-4). Only ever mounted while the Survey lens is open
 * (`layers/SkyObjects.tsx` renders `{lensOpen && <Satellites />}`), which is
 * what keeps `useSatellites()`'s own lazy `import("./satellites.ts")` (and
 * with it satellite.js) out of every request before the lens is first
 * opened (M56; this lane's own e2e acceptance: "the satellites chunk
 * request appears only after L").
 *
 * One `THREE.Points` draw for every satellite the current tier shows, on
 * the SAME 2,600 m camera-centred shell `Aircraft.tsx` uses (both are true
 * directions from the one real observer, `skyFrame.ts`'s `SANGAM`), plus a
 * ring marker and pass-arc line for the ISS when it is above the horizon.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useSatellites, type SatelliteReading } from "../../../lib/useSatellites.ts";
import { deviceTier } from "../../deviceTier.ts";
import { worldPalette } from "../../palette.ts";
import { worldDir } from "../skyFrame.ts";

/** Aircraft.tsx's own shell radius; one real observer, one shell, so a
 *  plane and a satellite drawn at the same true az/el line up. */
const SHELL_RADIUS_M = 2600;
const ISS_NORAD = "25544";
const CSS_NORAD = "48274";
const POINT_SIZE_PX = 6;
const ISS_POINT_SIZE_PX = 12;

/** "Brightest" with no real magnitude in the TLE feed: sunlit-and-visible
 *  (`eye`) ranks first, then sunlit-but-daylight, then in-shadow; the same
 *  order `classify()`'s own doc comment ranks these states by visual
 *  significance. */
const VISIBILITY_RANK: Record<SatelliteReading["state"], number> = { eye: 0, daylight: 1, shadow: 2, belowHorizon: 3 };

/** open-data-spec.md §3 A2's own LOD table: "objects drawn: all visible /
 *  20 brightest by class / ISS and CSS only." */
export function selectSatellitesForTier(visible: readonly SatelliteReading[], tier: 1 | 2 | 3): SatelliteReading[] {
  if (tier === 1) return [...visible];
  if (tier === 2) return [...visible].sort((a, b) => VISIBILITY_RANK[a.state] - VISIBILITY_RANK[b.state]).slice(0, 20);
  return visible.filter((v) => v.object.norad === ISS_NORAD || v.object.norad === CSS_NORAD);
}

function shellPosition(azDeg: number, elDeg: number): THREE.Vector3 {
  const [dx, dy, dz] = worldDir(azDeg, elDeg);
  return new THREE.Vector3(dx * SHELL_RADIUS_M, dy * SHELL_RADIUS_M, dz * SHELL_RADIUS_M);
}

const POINT_VERTEX = /* glsl */ `
  attribute vec3 aColor;
  attribute float aRing;
  attribute float aSizePx;
  varying vec3 vColor;
  varying float vRing;
  void main() {
    vColor = aColor;
    vRing = aRing;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSizePx;
  }
`;

const POINT_FRAGMENT = /* glsl */ `
  varying vec3 vColor;
  varying float vRing;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    // vRing > 0.5: a hollow ring (daylight-but-not-eye-visible, or in
    // shadow) rather than a solid dot (open-data-spec.md §3 A2's own three-
    // way classification).
    if (vRing > 0.5 && d < 0.32) discard;
    gl_FragColor = vec4(vColor, 1.0);
  }
`;

/** Idle-safe: the ISS pass arc from `issNextPass.start`, sampled every 10 s
 *  (open-data-spec.md §3 A2's own "sampled every 10 s across the pass")
 *  until elevation drops back below 10° or a bounded step count is spent.
 *  `lookAnglesFor` is a handful of trig calls, so even the worst case here
 *  (a couple of hundred samples) is sub-millisecond. Loads its own copy of
 *  the lazy `satellites.ts` chunk (already resolved by the time this runs,
 *  since `useSatellites()` triggered the same `import()` first; the
 *  browser's module cache means this never re-fetches it). */
async function computePassArc(issTle: { l1: string; l2: string; norad: string; name: string }, startAt: Date): Promise<THREE.Vector3[]> {
  const sat = await import("../../../lib/satellites.ts");
  const points: THREE.Vector3[] = [];
  const stepMs = 10_000;
  const maxSteps = 90; // 15 minutes, comfortably longer than any LEO pass
  for (let i = 0; i < maxSteps; i++) {
    const t = new Date(startAt.getTime() + i * stepMs);
    const look = sat.lookAnglesFor(issTle, t);
    if (!look || look.elDeg < 0) {
      if (points.length > 0) break; // the pass has ended
      continue; // not started yet (shouldn't happen from `start`, but cheap to guard)
    }
    points.push(shellPosition(look.azDeg, look.elDeg));
  }
  return points;
}

export default function Satellites() {
  const { camera } = useThree();
  const tier = useMemo(() => deviceTier(), []);
  const palette = worldPalette();
  const state = useSatellites();
  const groupRef = useRef<THREE.Group>(null);
  const [passArc, setPassArc] = useState<THREE.Vector3[]>([]);

  // Same reasoning as Aircraft.tsx: enable layer 6 on the shared main
  // camera (additive, never `.set()`) so this shell is visible in the main
  // view while staying out of the reflection/plate cameras that never
  // enable it.
  useEffect(() => {
    camera.layers.enable(6);
  }, [camera]);

  // Same camera-centred shell Aircraft.tsx tracks (open-data-spec.md §2
  // applies to every sky object, not just aircraft); tracked every frame
  // regardless of the satellite sweep's own 10 s cadence, since this is
  // keeping the shell's ORIGIN correct as the camera drifts, not an
  // animation of the satellites themselves.
  useFrame(() => {
    groupRef.current?.position.copy(camera.position);
  });

  const drawn = useMemo(() => selectSatellitesForTier(state.visible, tier), [state.visible, tier]);

  const iss = state.iss;
  const issAboveHorizon = iss != null;

  useEffect(() => {
    if (tier === 3 || !iss || !state.issNextPass) {
      setPassArc([]);
      return;
    }
    let cancelled = false;
    computePassArc({ l1: iss.object.l1, l2: iss.object.l2, norad: iss.object.norad, name: iss.object.name }, state.issNextPass.start).then(
      (pts) => {
        if (!cancelled) setPassArc(pts);
      },
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tier, iss?.object.norad, state.issNextPass?.start.getTime()]);

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const n = Math.max(drawn.length, 1);
    const positions = new Float32Array(n * 3);
    const colors = new Float32Array(n * 3);
    const ring = new Float32Array(n);
    const sizes = new Float32Array(n);
    const signal = new THREE.Color(palette.signal);
    const dim = new THREE.Color(palette.textDim);
    for (let i = 0; i < drawn.length; i++) {
      const s = drawn[i];
      const pos = shellPosition(s.look.azDeg, s.look.elDeg);
      positions[i * 3] = pos.x;
      positions[i * 3 + 1] = pos.y;
      positions[i * 3 + 2] = pos.z;
      const color = s.state === "shadow" ? dim : signal;
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
      ring[i] = s.state === "eye" ? 0 : 1;
      const isIss = s.object.norad === ISS_NORAD;
      sizes[i] = isIss ? ISS_POINT_SIZE_PX : POINT_SIZE_PX;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
    geo.setAttribute("aRing", new THREE.BufferAttribute(ring, 1));
    geo.setAttribute("aSizePx", new THREE.BufferAttribute(sizes, 1));
    geo.setDrawRange(0, drawn.length);
    return geo;
  }, [drawn, palette.signal, palette.textDim]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const material = useMemo(
    () => new THREE.ShaderMaterial({ vertexShader: POINT_VERTEX, fragmentShader: POINT_FRAGMENT, transparent: true, depthWrite: false }),
    [],
  );
  useEffect(() => () => material.dispose(), [material]);

  // `THREE.Line` built directly (not JSX `<line>`): react-three-fiber's own
  // `line` intrinsic collides with React DOM's SVG `<line>` in this
  // project's JSX types, so `<primitive object={...}>` is the house
  // workaround `Water.tsx`'s own reflector plane already needs for a
  // similar three/DOM tag clash.
  const arcLine = useMemo(() => {
    if (passArc.length < 2) return null;
    const geo = new THREE.BufferGeometry().setFromPoints(passArc);
    const mat = new THREE.LineBasicMaterial({ color: new THREE.Color(palette.signalDim), transparent: true, opacity: 0.5 });
    const line = new THREE.Line(geo, mat);
    line.layers.set(6);
    line.frustumCulled = false;
    return line;
  }, [passArc, palette.signalDim]);
  useEffect(
    () => () => {
      arcLine?.geometry.dispose();
      (arcLine?.material as THREE.Material | undefined)?.dispose();
    },
    [arcLine],
  );

  const setPointsRef = (o: THREE.Points | null) => o?.layers.set(6);

  if (drawn.length === 0 && !issAboveHorizon) return null;

  return (
    <group ref={groupRef}>
      {drawn.length > 0 && <points ref={setPointsRef} geometry={geometry} material={material} frustumCulled={false} />}
      {arcLine && <primitive object={arcLine} />}
    </group>
  );
}
