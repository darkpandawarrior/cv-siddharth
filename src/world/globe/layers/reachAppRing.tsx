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
// A small radial offset off the exact surface point. Pune declutter (P4,
// wave 9): this used to be the SAME 0.02 as familyCiRing.tsx's own
// SURFACE_EPS and layers/TogetherLayer.tsx's RING_LIFT - three separate
// meshes hovering at an identical height above the globe, the z-fight the
// design/perf audits saw as a green/magenta moire right over Pune. This is
// now the lowest step in that stack (ReachColumns.tsx 0.008, this 0.016,
// familyCiRing.tsx 0.024, hazardHalos.tsx 0.032, TogetherLayer.tsx 0.04) -
// every one of those five constants is a distinct value on purpose.
export const SURFACE_EPS = 0.016;
const HOVER_BOOST = 1.5;
const dummy = new THREE.Object3D();
const _scratch = new THREE.Vector3();

// Static data (committed store.ts, never fetched): computed once at module
// scope rather than re-derived per mount.
const ENTRIES: AppRingEntry[] = buildAppRing(fleet);
const STORE_DATE = freshestStoreDate(storeGeneratedAt, storeVerifiedAt);
const ANGLE_STEP = (Math.PI * 2) / Math.max(ENTRIES.length, 1);
const MAX_ENTRY_HEIGHT = ENTRIES.reduce((max, e) => Math.max(max, e.height), 0);

// One shared, invisible, generously-fat hit cylinder standing over the whole
// ring -- not one hit volume per app. At the real fleet's count, individual
// columns sit only ~2*pi*APP_RING_RADIUS/count world units apart (a fraction
// of a screen pixel at the globe's default framing): a per-instance hit
// volume fat enough to tap either overlaps its neighbours (several instances
// answer the same ray) or, sized to avoid that, shrinks to a sub-pixel
// target no click can land in reliably (both measured, this lane's own
// report). A single fat cylinder has no such ceiling -- ANY click that lands
// on the ring at all resolves to a real hit, and `nearestEntryIndex` below
// turns *where* on that cylinder's rim it landed into *which* app, the same
// way a real visitor reads "the nearest column to where I tapped".
// The wall sits at EXACTLY APP_RING_RADIUS, the same radius the visible
// columns stand at -- padding it outward (tried first, this lane's own
// report) moves the surface a click actually lands on off the columns'
// own radius, and at a shallow viewing angle that shift reads back as a
// large swing in angle once re-derived from (x, z), landing on an entry
// many places away from the one the pixel was aimed at. Height is padded
// (a little above the tallest column) since that dimension has no such
// parallax problem -- any point up the wall at the right angle is fine.
const HIT_HEIGHT_PAD = 0.15;
const HIT_GEOMETRY = new THREE.CylinderGeometry(APP_RING_RADIUS, APP_RING_RADIUS, MAX_ENTRY_HEIGHT + HIT_HEIGHT_PAD, 128, 1, true);

function localPosition(entry: AppRingEntry): THREE.Vector3 {
  return new THREE.Vector3(Math.cos(entry.angle) * APP_RING_RADIUS, entry.height / 2, Math.sin(entry.angle) * APP_RING_RADIUS);
}

/** Which entry a click on the shared hit cylinder belongs to: entries sit at
 *  even `ANGLE_STEP` multiples starting at 0 (buildAppRing's own "spread
 *  evenly around a full turn"), so the nearest one is a direct round, not a
 *  scan -- robust to which HEIGHT along the cylinder's wall the ray actually
 *  struck, since only the strike point's (x, z) angle is read, never y. */
function nearestEntryIndex(localX: number, localZ: number): number {
  const angle = (Math.atan2(localZ, localX) + Math.PI * 2) % (Math.PI * 2);
  return Math.round(angle / ANGLE_STEP) % ENTRIES.length;
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

  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const [hovered, setHovered] = useState<number | null>(null);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    for (let i = 0; i < ENTRIES.length; i++) {
      const e = ENTRIES[i];
      dummy.position.copy(localPosition(e));
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, e.height, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, colorFor(e));
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
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
  // lazy layer). No per-instance hit mesh to read any more (see
  // HIT_GEOMETRY's own comment) -- this is just the visual column's own
  // local point, carried to world space by the same group transform the
  // renderer uses.
  const probePosition = useMemo(() => ENTRIES.length ? localPosition(ENTRIES[0]) : new THREE.Vector3(), []);
  useFrame(() => {
    if (ENTRIES.length === 0) return;
    const dbg = ensureReachDebug();
    dbg.appCount = ENTRIES.length;
    _scratch.copy(probePosition).applyQuaternion(quaternion).add(position).project(camera);
    dbg.appProbeX = (_scratch.x * 0.5 + 0.5) * size.width;
    dbg.appProbeY = (-_scratch.y * 0.5 + 0.5) * size.height;
  });

  function pick(entry: AppRingEntry) {
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

  /** Both click and hover resolve the SAME way: the event's world-space hit
   *  point, carried into the group's own local frame (`worldToLocal`, not a
   *  hand-rolled inverse -- correct even if a future edit nests this group
   *  under another transform), then the nearest entry by angle. */
  function entryAt(e: ThreeEvent<PointerEvent | MouseEvent>): AppRingEntry | null {
    const group = groupRef.current;
    if (!group || ENTRIES.length === 0) return null;
    _scratch.copy(e.point);
    group.worldToLocal(_scratch);
    return ENTRIES[nearestEntryIndex(_scratch.x, _scratch.z)];
  }

  return (
    <group ref={groupRef} position={position} quaternion={quaternion}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
        <torusGeometry args={[APP_RING_RADIUS, 0.004, 6, 96]} />
        {/* Transparent + depthWrite kept the default (true) here used to let
            this base arc fight neighbouring Pune layers for which translucent
            surface wins a given pixel; false is correct for a translucent
            overlay stacked with others at a nearly-coplanar radius.
            polygonOffset is the lowest step of the ring stack (factor/units
            -1), so it's never mistaken for a coplanar match against
            familyCiRing.tsx's torus or TogetherLayer.tsx's ring above it. */}
        <meshBasicMaterial color={muted} toneMapped={false} transparent opacity={0.35} depthWrite={false} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
      </mesh>
      <instancedMesh ref={meshRef} args={[COLUMN_GEOMETRY, undefined, ENTRIES.length]} frustumCulled={false} renderOrder={1}>
        <meshBasicMaterial toneMapped={false} transparent opacity={0.85} depthWrite={false} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
      </instancedMesh>
      <mesh
        geometry={HIT_GEOMETRY}
        position={[0, (MAX_ENTRY_HEIGHT + HIT_HEIGHT_PAD) / 2, 0]}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          const entry = entryAt(e);
          if (entry) pick(entry);
        }}
        onPointerMove={
          interactive
            ? (e: ThreeEvent<PointerEvent>) => {
                e.stopPropagation();
                const entry = entryAt(e);
                setHovered(entry ? ENTRIES.indexOf(entry) : null);
              }
            : undefined
        }
        onPointerOut={interactive ? () => setHovered(null) : undefined}
      >
        <meshBasicMaterial transparent opacity={0} depthWrite={false} depthTest={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}
