import { useMemo } from "react";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { latLonToXyz } from "./geoMath.ts";
import { readColor } from "../../themeColorThree.ts";
import { PUNE } from "../../lib/sky.ts";
import { fleetStats } from "../../data/store.ts";
import { upstreamMergedPRs } from "../../data/profile.ts";
import { globeFacts } from "./globeRows.ts";
import { GLOBE_RADIUS } from "./EarthDots.tsx";

const COLUMN_RADIUS = 0.06;
const MIN_HEIGHT = 0.4;
// World units, not degrees - a lat/lon nudge near Pune would separate the
// two columns by a fraction of a millimetre on a radius-6 globe. This is a
// fixed sideways offset along the local tangent plane instead.
const COLUMN_SPACING = 0.3;

function columnHeight(magnitude: number): number {
  return Math.max(MIN_HEIGHT, Math.log10(Math.max(1, magnitude)));
}

function surfaceNormal(lat: number, lon: number): THREE.Vector3 {
  const p = latLonToXyz(lat, lon);
  return new THREE.Vector3(p.x, p.y, p.z);
}

/** One reach column (G15/G16, living-ledger-spec.md#6.3 task 2): a thin
 *  emissive shaft standing on the globe surface, height by log10 of its own
 *  magnitude, labelled with the exact claim sentence - never a bare number
 *  with no source in reach. */
function Column({ base, up, height, color, label }: { base: THREE.Vector3; up: THREE.Vector3; height: number; color: THREE.Color; label: string }) {
  const quaternion = useMemo(() => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), up), [up]);
  return (
    <group position={base} quaternion={quaternion}>
      <mesh position={[0, height / 2, 0]}>
        <cylinderGeometry args={[COLUMN_RADIUS, COLUMN_RADIUS, height, 8]} />
        <meshBasicMaterial color={color} toneMapped={false} transparent opacity={0.85} />
      </mesh>
      <Html position={[0, height + 0.18, 0]} center distanceFactor={10} style={{ pointerEvents: "none" }}>
        <div
          data-reach-label
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            lineHeight: 1.3,
            maxWidth: 180,
            whiteSpace: "normal",
            background: "rgba(5,7,10,0.75)",
            padding: "3px 7px",
            borderRadius: 6,
            color: "#e8efe9",
            border: `1px solid ${color.getStyle()}66`,
          }}
        >
          {label}
        </div>
      </Html>
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

  const installsLabel = useMemo(() => globeFacts.find((r) => r.id === "reach-installs")!.label, []);
  const upstreamLabel = useMemo(() => globeFacts.find((r) => r.id === "reach-upstream")!.label, []);

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
      <Column base={baseA} up={normal} height={columnHeight(fleetStats.installFloor)} color={signal} label={installsLabel} />
      <Column base={baseB} up={normal} height={columnHeight(upstreamMergedPRs)} color={probe} label={upstreamLabel} />
    </group>
  );
}
