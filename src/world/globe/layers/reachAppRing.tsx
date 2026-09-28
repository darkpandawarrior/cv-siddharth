// LANE W6: the app-reach ring's render layer -- one instanced column per
// live app in the white-label fleet (reachApps.ts's own math), plus a thin
// base arc tying them together. Static content (store.ts, never fetched),
// so every transform is written ONCE in an effect, never in useFrame --
// the only per-frame work is the e2e probe's screen projection.
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { latLonToXyz, GLOBE_RADIUS } from "../geoMath.ts";
import { PUNE } from "../../../lib/sky.ts";
import { readColor } from "../../../themeColorThree.ts";
import { useGlobe } from "../globeStore.ts";
import { buildAppRing, freshestStoreDate, APP_RING_RADIUS, type AppRingEntry } from "./reachApps.ts";
import { ensureReachDebug } from "./reachDebug.ts";
import { fleet, storeGeneratedAt, storeVerifiedAt } from "../../../data/store.ts";

const COLUMN_RADIUS = 0.01;
const COLUMN_GEOMETRY = new THREE.CylinderGeometry(COLUMN_RADIUS, COLUMN_RADIUS, 1, 6);
// A separate, fatter, invisible cylinder purely for raycasting -- the
// visual column is a thin 0.01-radius shaft, and quakeGlyphs.tsx's own
// HIT_GEOMETRY comment already found the real problem this solves: a click
// (or a fingertip) aimed at a thin glyph mostly lands beside it, and depth
// test against the ring's own base arc / the neighbouring columns can
// occlude a thin target before the ray ever reaches it. `depthTest: false`
// on its material (below) means this hit volume is never blocked by
// anything else at Pune, so it is the tap target, not the visual shaft.
const HIT_RADIUS = 0.08;
const HIT_GEOMETRY = new THREE.CylinderGeometry(HIT_RADIUS, HIT_RADIUS, 1, 8);
// A small radial offset off the exact surface point -- Markers.tsx's own
// employer ring uses the same +0.01-ish epsilon to keep a flat ring from
// z-fighting the earth surface/imagery mesh right under it.
const SURFACE_EPS = 0.02;
const HOVER_BOOST = 1.5;
const dummy = new THREE.Object3D();
const _scratch = new THREE.Vector3();
const _instMat = new THREE.Matrix4();

// Static data (committed store.ts, never fetched): computed once at module
// scope rather than re-derived per mount.
const ENTRIES: AppRingEntry[] = buildAppRing(fleet);
const STORE_DATE = freshestStoreDate(storeGeneratedAt, storeVerifiedAt);

function localPosition(entry: AppRingEntry): THREE.Vector3 {
  return new THREE.Vector3(Math.cos(entry.angle) * APP_RING_RADIUS, entry.height / 2, Math.sin(entry.angle) * APP_RING_RADIUS);
}

/** `interactive` gates hover highlighting only -- click stays live at every
 *  tier (it's event-driven, not a per-frame cost); T3 ("app ring static
 *  only") passes `interactive={false}` so nothing beyond the static render
 *  and click wiring runs. */
export function ReachAppRing({ interactive }: { interactive: boolean }) {
  const select = useGlobe((s) => s.select);
  const { camera, size } = useThree();
  const signal = useMemo(() => readColor("--color-signal", "#3ddc84"), []);
  const alt = useMemo(() => readColor("--color-alt", "#db61ff"), []);
  const muted = useMemo(() => readColor("--color-muted", "#8b909a"), []);
  const colorFor = (e: AppRingEntry) => (e.side === "rider" ? signal : alt);

  const normal = useMemo(() => {
    const p = latLonToXyz(PUNE.lat, PUNE.lon);
    return new THREE.Vector3(p.x, p.y, p.z);
  }, []);
  const quaternion = useMemo(() => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal), [normal]);
  const position = useMemo(() => normal.clone().multiplyScalar(GLOBE_RADIUS + SURFACE_EPS), [normal]);

  const meshRef = useRef<THREE.InstancedMesh>(null);
  const hitRef = useRef<THREE.InstancedMesh>(null);
  const [hovered, setHovered] = useState<number | null>(null);

  useEffect(() => {
    const mesh = meshRef.current;
    const hit = hitRef.current;
    if (!mesh || !hit) return;
    for (let i = 0; i < ENTRIES.length; i++) {
      const e = ENTRIES[i];
      dummy.position.copy(localPosition(e));
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, e.height, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, colorFor(e));
      hit.setMatrixAt(i, dummy.matrix); // same transform, the fatter hit-test geometry
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    hit.instanceMatrix.needsUpdate = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ENTRIES is a module-level constant; colorFor closes over signal/alt, both real deps.
  }, [signal, alt]);

  // Hover highlight: an event-driven colour write (pointer move), never a
  // per-frame one.
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || !interactive) return;
    for (let i = 0; i < ENTRIES.length; i++) {
      const base = colorFor(ENTRIES[i]);
      mesh.setColorAt(i, i === hovered ? base.clone().multiplyScalar(HOVER_BOOST) : base);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hovered, interactive, signal, alt]);

  // e2e seam only: the first (biggest-install) column's current screen
  // projection, so globe-W6.spec.ts can click a real, computed pixel rather
  // than guess one (reachDebug.ts's own convention, HazardLayer's for a
  // lazy layer). Reads the HIT instance's own `matrixWorld` (getMatrixAt +
  // hitRef.matrixWorld) -- the exact transform Three's raycaster tests
  // against -- rather than re-deriving the same point from `quaternion`/
  // `position` by hand: both agree numerically (checked), but this one
  // stays correct even if a future edit nests this group under another
  // transform this file doesn't know about.
  useFrame(() => {
    const hit = hitRef.current;
    if (ENTRIES.length === 0 || !hit) return;
    const dbg = ensureReachDebug();
    dbg.appCount = ENTRIES.length;
    hit.getMatrixAt(0, _instMat);
    _instMat.premultiply(hit.matrixWorld);
    _scratch.setFromMatrixPosition(_instMat).project(camera);
    dbg.appProbeX = (_scratch.x * 0.5 + 0.5) * size.width;
    dbg.appProbeY = (-_scratch.y * 0.5 + 0.5) * size.height;
  });

  function onPick(e: ThreeEvent<MouseEvent>) {
    if (e.instanceId === undefined) return;
    const entry = ENTRIES[e.instanceId];
    const rows = [
      { label: "install band", value: entry.installs },
      ...(entry.rating != null ? [{ label: "rating", value: entry.rating.toFixed(1) }] : []),
      { label: "last updated", value: entry.updated },
      { label: "package", value: entry.id },
      { label: "listing", value: entry.url },
    ];
    select({
      id: `reach-app:${entry.id}`,
      kind: "reach-app",
      title: entry.name,
      rows,
      source: `store.ts (Play Store listing snapshot, as of ${STORE_DATE})`,
      live: false,
    });
  }

  return (
    <group position={position} quaternion={quaternion}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[APP_RING_RADIUS, 0.004, 6, 96]} />
        <meshBasicMaterial color={muted} toneMapped={false} transparent opacity={0.35} />
      </mesh>
      <instancedMesh ref={meshRef} args={[COLUMN_GEOMETRY, undefined, ENTRIES.length]} frustumCulled={false}>
        <meshBasicMaterial toneMapped={false} transparent opacity={0.85} />
      </instancedMesh>
      <instancedMesh
        ref={hitRef}
        args={[HIT_GEOMETRY, undefined, ENTRIES.length]}
        frustumCulled={false}
        onClick={onPick}
        onPointerOver={
          interactive
            ? (e: ThreeEvent<PointerEvent>) => {
                e.stopPropagation();
                setHovered(e.instanceId ?? null);
              }
            : undefined
        }
        onPointerOut={interactive ? () => setHovered(null) : undefined}
      >
        <meshBasicMaterial transparent opacity={0} depthWrite={false} depthTest={false} />
      </instancedMesh>
    </group>
  );
}
