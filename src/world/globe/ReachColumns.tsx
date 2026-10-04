import { useMemo } from "react";
import * as THREE from "three";
import { latLonToXyz } from "./geoMath.ts";
import { readColor } from "../../themeColorThree.ts";
import { PUNE } from "../../lib/sky.ts";
import { fleetStats } from "../../data/store.ts";
import { upstreamMergedPRs } from "../../data/profile.ts";
import { GLOBE_RADIUS } from "./EarthDots.tsx";
import { useGlobe } from "./globeStore.ts";
import { buildPuneSelection } from "./puneSelection.ts";

const COLUMN_RADIUS = 0.06;
const MIN_HEIGHT = 0.4;
// log10 alone put the install column at 6.5 world units on a radius-6
// globe: a spike longer than the Earth, its label pinned off-screen. A
// quarter keeps the log ordering and tops out near a quarter-radius.
const HEIGHT_PER_DECADE = 0.25;
// World units, not degrees - a lat/lon nudge near Pune would separate the
// two columns by a fraction of a millimetre on a radius-6 globe. This is a
// fixed sideways offset along the local tangent plane instead.
const COLUMN_SPACING = 0.3;
// Pune declutter (P4, wave 9): the column base used to stand at EXACTLY
// GLOBE_RADIUS, the same radius EarthImagery/TileLayer's sphere surface
// sits at directly underneath it - perf.md's own suspected cause of the
// Pune moire ("check TileLayer.tsx's tile-patch radius against
// ReachColumns.tsx's ring radius for an exact match, the classic
// z-fight cause"). This lifts the base a hair off the surface, the lowest
// step in the Pune marker stack (see familyCiRing.tsx/reachAppRing.tsx/
// hazardHalos.tsx/layers/TogetherLayer.tsx for the rest of the stack -
// every SURFACE_LIFT-equivalent constant across those five files is a
// distinct value on purpose, so no two Pune layers share a height).
export const SURFACE_LIFT = 0.008;

function columnHeight(magnitude: number): number {
  return Math.max(MIN_HEIGHT, Math.log10(Math.max(1, magnitude)) * HEIGHT_PER_DECADE);
}

function surfaceNormal(lat: number, lon: number): THREE.Vector3 {
  const p = latLonToXyz(lat, lon);
  return new THREE.Vector3(p.x, p.y, p.z);
}

/** One reach column (G15/G16, living-ledger-spec.md#6.3 task 2): a thin
 *  emissive shaft standing on the globe surface, height by log10 of its own
 *  magnitude. Its exact claim sentence lives on the Pune card (Markers.tsx),
 *  keyed by colour - never a bare number with no source in reach. */
function Column({
  base,
  up,
  height,
  color,
  onSelect,
}: {
  base: THREE.Vector3;
  up: THREE.Vector3;
  height: number;
  color: THREE.Color;
  onSelect: () => void;
}) {
  const quaternion = useMemo(() => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), up), [up]);
  return (
    <group position={base} quaternion={quaternion}>
      <mesh
        position={[0, height / 2, 0]}
        renderOrder={0}
        onClick={(e) => {
          e.stopPropagation();
          void import("./useMarkerClick.ts").then(({ claimGuideClick }) => {
            if (!claimGuideClick(e.nativeEvent)) onSelect();
          });
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          document.body.style.cursor = "auto";
        }}
      >
        <cylinderGeometry args={[COLUMN_RADIUS, COLUMN_RADIUS, height, 8]} />
        {/* polygonOffset pulls the column's base cap toward the camera by a
            tiny, consistent amount - belt-and-suspenders with SURFACE_LIFT
            above against the earth sphere directly beneath it. */}
        <meshBasicMaterial color={color} toneMapped={false} transparent opacity={0.85} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
      </mesh>
    </group>
  );
}

/** Vertical light columns rising from Pune - G15 (install floor) and G16
 *  (upstream merged PRs) - the two facts GLOBE draws as height because they
 *  have no geography of their own ("reach without geography is drawn as
 *  height over Pune, never spread across a map we do not have"). */
export function ReachColumns() {
  const signal = useMemo(() => readColor("--color-signal", "#3ddc84"), []);
  const probe = useMemo(() => readColor("--color-probe", "#5ee6ff"), []);
  const select = useGlobe((s) => s.select);
  const setView = useGlobe((s) => s.setView);

  const onSelect = () => {
    const selection = buildPuneSelection();
    if (!selection) return;
    setView("orbit");
    select(selection);
  };

  const normal = useMemo(() => surfaceNormal(PUNE.lat, PUNE.lon), []);
  const tangent = useMemo(() => {
    const worldUp = new THREE.Vector3(0, 1, 0);
    const t = new THREE.Vector3().crossVectors(worldUp, normal);
    return t.lengthSq() > 1e-6 ? t.normalize() : new THREE.Vector3(1, 0, 0);
  }, [normal]);

  const baseA = useMemo(() => normal.clone().multiplyScalar(GLOBE_RADIUS + SURFACE_LIFT).addScaledVector(tangent, -COLUMN_SPACING), [normal, tangent]);
  const baseB = useMemo(() => normal.clone().multiplyScalar(GLOBE_RADIUS + SURFACE_LIFT).addScaledVector(tangent, COLUMN_SPACING), [normal, tangent]);

  return (
    <group>
      <Column base={baseA} up={normal} height={columnHeight(fleetStats.installFloor)} color={signal} onSelect={onSelect} />
      <Column base={baseB} up={normal} height={columnHeight(upstreamMergedPRs)} color={probe} onSelect={onSelect} />
    </group>
  );
}
