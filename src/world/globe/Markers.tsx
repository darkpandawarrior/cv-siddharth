import { useMemo, type RefObject } from "react";
import * as THREE from "three";
import { latLonToXyz } from "./geoMath.ts";
import { readColor } from "../../themeColorThree.ts";
import { employerMarkers, employersUnresolved } from "../../data/globeGeo.ts";
import { globeFacts } from "./globeRows.ts";
import { GLOBE_RADIUS } from "./EarthDots.tsx";
import { useGlobe, type Selection } from "./globeStore.ts";

/** LANE U1 (composition): the id every Pune selection carries, so the HUD's
 *  markers toggle (Globe.tsx) can tell "the inspector is showing Pune" apart
 *  from any other selection before closing it. */
export const PUNE_SELECTION_ID = "pune-origin";

/** Builds the exact Inspector payload the retired floating Pune card used to
 *  carry inline - the three claim sentences from globeRows.ts, each row
 *  keyed by the column/ring colour it describes, "source"/"live" naming
 *  where the numbers come from (G8) rather than inventing a fresh copy.
 *  Exported so Globe.tsx's desktop-first-load preselect uses the identical
 *  payload a ring click produces - one source of truth, not two. */
export function buildPuneSelection(): Selection | null {
  if (employerMarkers.length === 0) return null;
  const signal = readColor("--color-signal", "#3ddc84").getStyle();
  const probe = readColor("--color-probe", "#5ee6ff").getStyle();
  const home = employerMarkers[0];
  const names = employerMarkers.map((m) => m.company).join(", ");
  const unresolvedNote = employersUnresolved.length > 0 ? ` - ${employersUnresolved.join(", ")} listed, never geocoded` : "";
  const fact = (id: string) => globeFacts.find((r) => r.id === id)!.label;
  return {
    id: PUNE_SELECTION_ID,
    kind: "origin",
    title: `${home.location.split(",")[0].toUpperCase()} · ${home.lat.toFixed(2)}°N ${home.lon.toFixed(2)}°E`,
    rows: [
      { label: "Reach", value: fact("reach-installs"), swatch: signal },
      { label: "Upstream", value: fact("reach-upstream"), swatch: probe },
      { label: "Employers", value: names + unresolvedNote, swatch: probe },
    ],
    source: "store.ts, profile/openSource.ts, profile/experience.ts",
    live: false,
    focus: { kind: "latlon", lat: home.lat, lon: home.lon, distance: 18 },
  };
}

const RING_RADIUS = 0.18;
const RING_TUBE = 0.012;

/**
 * Employer marker (G17, living-ledger-spec.md#6.3 task 2): city precision
 * only. Both resolvable employers (Dice.tech, John Deere India) sit in Pune
 * today, so this draws one ring at that single point rather than one marker
 * each.
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
  const setView = useGlobe((s) => s.setView);

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

  return (
    <group data-employer-ring position={placement.position} quaternion={placement.quaternion}>
      <mesh
        onClick={(e) => {
          e.stopPropagation();
          const selection = buildPuneSelection();
          if (!selection) return;
          setView("orbit");
          select(selection);
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
    </group>
  );
}
