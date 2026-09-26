import { useMemo } from "react";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { latLonToXyz } from "./geoMath.ts";
import { readColor } from "../../themeColorThree.ts";
import { employerMarkers, employersUnresolved } from "../../data/globeGeo.ts";
import { GLOBE_RADIUS } from "./EarthDots.tsx";
import { calculatePosition, calloutStyle } from "./htmlLabelClamp.ts";

const RING_RADIUS = 0.18;
const RING_TUBE = 0.012;

/**
 * Employer markers (G17, living-ledger-spec.md#6.3 task 2): city precision
 * only. Both resolvable employers (Dice.tech, John Deere India) sit in Pune
 * today, so this draws one ring at that single point rather than one marker
 * each - "both mapped employers sit in Pune today, so they are a ring on the
 * origin." The two unresolved locations (Remote/Contract, India) are named
 * in the label, never geocoded and never given an arc: "no arc is ever drawn
 * to a location this table does not actually know."
 */
export function Markers() {
  const probe = useMemo(() => readColor("--color-probe", "#5ee6ff"), []);

  const placement = useMemo(() => {
    if (employerMarkers.length === 0) return null;
    const { lat, lon } = employerMarkers[0];
    const p = latLonToXyz(lat, lon);
    const normal = new THREE.Vector3(p.x, p.y, p.z);
    return {
      position: normal.clone().multiplyScalar(GLOBE_RADIUS + 0.01),
      quaternion: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal),
    };
  }, []);

  if (!placement) return null;

  const names = employerMarkers.map((m) => m.company).join(", ");
  const unresolvedNote = employersUnresolved.length > 0 ? ` - ${employersUnresolved.join(", ")} listed, never geocoded` : "";

  return (
    <group data-employer-ring position={placement.position} quaternion={placement.quaternion}>
      <mesh>
        <torusGeometry args={[RING_RADIUS, RING_TUBE, 8, 40]} />
        <meshBasicMaterial color={probe} toneMapped={false} />
      </mesh>
      <Html position={[0, 0.14, 0]} center distanceFactor={10} calculatePosition={calculatePosition} style={{ pointerEvents: "none" }}>
        <div style={calloutStyle(probe, 190, true)}>
          {names}
          {unresolvedNote}
        </div>
      </Html>
    </group>
  );
}
