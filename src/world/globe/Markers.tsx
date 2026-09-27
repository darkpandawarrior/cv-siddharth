import { useMemo, type RefObject } from "react";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { latLonToXyz } from "./geoMath.ts";
import { readColor } from "../../themeColorThree.ts";
import { employerMarkers, employersUnresolved } from "../../data/globeGeo.ts";
import { globeFacts } from "./globeRows.ts";
import { GLOBE_RADIUS } from "./EarthDots.tsx";
import { LEADER, calculatePosition, cardStyle } from "./htmlLabelClamp.ts";

const RING_RADIUS = 0.18;
const RING_TUBE = 0.012;

function Swatch({ color, ring }: { color: string; ring?: boolean }) {
  return (
    <span
      aria-hidden
      style={{
        width: 8,
        height: 8,
        marginTop: 4,
        flex: "none",
        borderRadius: ring ? "50%" : 2,
        background: ring ? "transparent" : color,
        border: ring ? `1.5px solid ${color}` : undefined,
      }}
    />
  );
}

/**
 * Employer markers (G17, living-ledger-spec.md#6.3 task 2): city precision
 * only. Both resolvable employers (Dice.tech, John Deere India) sit in Pune
 * today, so this draws one ring at that single point rather than one marker
 * each - "both mapped employers sit in Pune today, so they are a ring on the
 * origin." The two unresolved locations (Remote/Contract, India) are named
 * in the label, never geocoded and never given an arc: "no arc is ever drawn
 * to a location this table does not actually know."
 *
 * The ring also carries the one Pune card. The two reach columns and this
 * ring all stand within a few pixels of each other, so three floating
 * labels could only ever overlap; one card keeps each exact claim sentence,
 * keyed by a swatch to the column or ring it describes.
 */
export function Markers({ occlude }: { occlude?: RefObject<THREE.Object3D>[] }) {
  const signal = useMemo(() => readColor("--color-signal", "#3ddc84").getStyle(), []);
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
  const home = employerMarkers[0];
  const header = `${home.location.split(",")[0].toUpperCase()} · ${home.lat.toFixed(2)}°N ${home.lon.toFixed(2)}°E`;
  const fact = (id: string) => globeFacts.find((r) => r.id === id)!.label;
  const rows: { color: string; ring?: boolean; text: string }[] = [
    { color: signal, text: fact("reach-installs") },
    { color: probe.getStyle(), text: fact("reach-upstream") },
    { color: probe.getStyle(), ring: true, text: names + unresolvedNote },
  ];

  return (
    <group data-employer-ring position={placement.position} quaternion={placement.quaternion}>
      <mesh>
        <torusGeometry args={[RING_RADIUS, RING_TUBE, 8, 40]} />
        <meshBasicMaterial color={probe} toneMapped={false} />
      </mesh>
      <Html calculatePosition={calculatePosition} occlude={occlude} style={{ pointerEvents: "none" }}>
        {/* Hidden under 640px: the card would cover most of a phone's
            globe, and GlobePanel right below carries the same sentences. */}
        <div data-pune-card className="hidden sm:flex" style={{ alignItems: "center", transform: "translateY(-50%)" }}>
          <span aria-hidden style={{ width: LEADER, height: 1, flex: "none", background: "rgba(232,239,233,0.4)" }} />
          <div style={cardStyle}>
            <div style={{ fontSize: 10, letterSpacing: "0.08em", color: "rgba(232,239,233,0.55)" }}>{header}</div>
            {rows.map((r) => (
              <div key={r.text} style={{ display: "flex", gap: 8 }}>
                <Swatch color={r.color} ring={r.ring} />
                <span>{r.text}</span>
              </div>
            ))}
          </div>
        </div>
      </Html>
    </group>
  );
}
