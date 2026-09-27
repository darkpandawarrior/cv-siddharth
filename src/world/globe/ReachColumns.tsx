import { useMemo } from "react";
import * as THREE from "three";
import { latLonToXyz } from "./geoMath.ts";
import { readColor } from "../../themeColorThree.ts";
import { PUNE } from "../../lib/sky.ts";
import { fleetStats } from "../../data/store.ts";
import { upstreamMergedPRs } from "../../data/profile.ts";
import { GLOBE_RADIUS } from "./EarthDots.tsx";

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
function Column({ base, up, height, color }: { base: THREE.Vector3; up: THREE.Vector3; height: number; color: THREE.Color }) {
  const quaternion = useMemo(() => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), up), [up]);
  return (
    <group position={base} quaternion={quaternion}>
      <mesh position={[0, height / 2, 0]}>
        <cylinderGeometry args={[COLUMN_RADIUS, COLUMN_RADIUS, height, 8]} />
        <meshBasicMaterial color={color} toneMapped={false} transparent opacity={0.85} />
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

  const normal = useMemo(() => surfaceNormal(PUNE.lat, PUNE.lon), []);
  const tangent = useMemo(() => {
    const worldUp = new THREE.Vector3(0, 1, 0);
    const t = new THREE.Vector3().crossVectors(worldUp, normal);
    return t.lengthSq() > 1e-6 ? t.normalize() : new THREE.Vector3(1, 0, 0);
  }, [normal]);

  const baseA = useMemo(() => normal.clone().multiplyScalar(GLOBE_RADIUS).addScaledVector(tangent, -COLUMN_SPACING), [normal, tangent]);
  const baseB = useMemo(() => normal.clone().multiplyScalar(GLOBE_RADIUS).addScaledVector(tangent, COLUMN_SPACING), [normal, tangent]);

  return (
    <group>
      <Column base={baseA} up={normal} height={columnHeight(fleetStats.installFloor)} color={signal} />
      <Column base={baseB} up={normal} height={columnHeight(upstreamMergedPRs)} color={probe} />
    </group>
  );
}
