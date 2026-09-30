import { useMemo, type RefObject } from "react";
import * as THREE from "three";
import { latLonToXyz } from "./geoMath.ts";
import { readColor } from "../../themeColorThree.ts";
import { employerMarkers } from "../../data/globeGeo.ts";
import { GLOBE_RADIUS } from "./EarthDots.tsx";
import { useGlobe } from "./globeStore.ts";
import { buildPuneSelection } from "./puneSelection.ts";
import { useMarkerClick } from "./useMarkerClick.ts";

const RING_RADIUS = 0.18;
const RING_TUBE = 0.012;
// GuideLayer.tsx's own city hit-disc sits at GLOBE_RADIUS + 0.008 (its LIFT
// constant, deliberately kept below quakes/launches so THOSE stay
// clickable over a city). This ring's own 0.01 sat only 0.002 above that --
// close enough that which one a raycast reaches first for the same lat/lon
// (Pune has both) came down to per-viewport floating-point noise, not
// design. Lower, clearly, so the richer guide-place card always wins over
// this decorative employer ring where the two coincide.
const RING_LIFT = 0.005;

/**
 * Employer marker (G17, living-ledger-spec.md#6.3 task 2): city precision
 * only. One ring per distinct resolved city: Dice.tech/John Deere in Pune,
 * Jugnoo in Chandigarh. Duplicate employers never stack rings.
 *
 * LANE U1 retired the floating `<Html>` card this ring used to carry (it
 * collided with the time scrubber, the tour and the layer panel at every
 * measured breakpoint - the bug this lane exists to fix). The three claim
 * sentences it held now live in the Inspector (buildPuneSelection above);
 * this ring is a plain clickable 3D marker that opens them there, same as
 * any other selectable entity on the globe.
 */
export function Markers({ occlude: _occlude }: { occlude?: RefObject<THREE.Object3D>[] }) {
  const probe = useMemo(() => readColor("--color-probe", "#5ee6ff"), []);
  const select = useGlobe((s) => s.select);
  const markerClick = useMarkerClick();
  const setView = useGlobe((s) => s.setView);

  const placements = useMemo(() => [...new Map(employerMarkers.map((marker) => [marker.location, marker])).values()].map((marker) => {
    const p = latLonToXyz(marker.lat, marker.lon);
    const normal = new THREE.Vector3(p.x, p.y, p.z);
    return { ...marker, position: normal.clone().multiplyScalar(GLOBE_RADIUS + RING_LIFT), quaternion: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal) };
  }), []);

  return (
    <>{placements.map((placement) => <group key={placement.location} data-employer-ring position={placement.position} quaternion={placement.quaternion}>
      <mesh
        onClick={(e) => {
          e.stopPropagation();
          markerClick(e.nativeEvent, () => {
            const selection = placement.location === "Pune, India" ? buildPuneSelection() : {
              id: `employer:${placement.location}`, kind: "employer", title: placement.location,
              rows: employerMarkers.filter((marker) => marker.location === placement.location).map((marker) => ({ label: marker.company, value: marker.role })),
              source: "src/data/profile/experience.ts, city-level employer location", live: false,
              focus: { kind: "latlon" as const, lat: placement.lat, lon: placement.lon, distance: 14 },
            };
            if (!selection) return;
            setView("orbit");
            select(selection);
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
        <torusGeometry args={[RING_RADIUS, RING_TUBE, 8, 40]} />
        <meshBasicMaterial color={probe} toneMapped={false} />
      </mesh>
    </group>)}</>
  );
}
