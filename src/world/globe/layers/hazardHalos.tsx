// LANE L7 (live earth events), task 3: GDACS orange/red alerts as a halo
// ring around their matched quake/EONET event, or a standalone marker when
// nothing matched. One InstancedMesh (task 8) — the halo is just a bigger,
// thinner ring than the event's own glyph, in the alert's colour.
import { useEffect, useMemo, useRef } from "react";
import { type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { latLonToXyz } from "../geoMath.ts";
import { GLOBE_RADIUS } from "../EarthDots.tsx";
import { useGlobe } from "../globeStore.ts";
import type { MatchedAlert } from "./hazardAlerts.ts";

const HALO_GEOMETRY = new THREE.RingGeometry(0.85, 1, 32);
const HALO_RADIUS = 0.22;
const MAX_ALERTS = 60;
// Pune declutter (P4, wave 9): when a real GDACS alert happens to sit near
// Pune it used to hover only 0.005 above familyCiRing.tsx/reachAppRing.tsx's
// old shared 0.02 lift - close enough to still z-fight at grazing camera
// angles. Now the third step of the five-layer stack (reachAppRing.tsx's
// own comment has the full ordering: 0.008 < 0.016 < 0.024 < this 0.032 <
// 0.04).
export const SURFACE_LIFT = 0.032;
// Alert colours ARE this app's warn/danger tokens — unlike the ambient
// glyphs, an alert IS a claim ("this is orange/red right now"), so it uses
// the house palette rather than a natural-phenomenon hex (globe-lanes.md's
// colour rule cuts the other way here on purpose).
const ORANGE = new THREE.Color("#f0883e");
const RED = new THREE.Color("#ff5c5c");

const dummy = new THREE.Object3D();
const UP = new THREE.Vector3(0, 0, 1);

function placement(lat: number, lon: number, radius: number): { position: THREE.Vector3; normal: THREE.Vector3 } {
  const p = latLonToXyz(lat, lon);
  const normal = new THREE.Vector3(p.x, p.y, p.z);
  return { position: normal.clone().multiplyScalar(radius), normal };
}

export function HazardHalos({ alerts }: { alerts: MatchedAlert[] }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const select = useGlobe((s) => s.select);
  const capped = useMemo(() => alerts.slice(0, MAX_ALERTS), [alerts]);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    for (let i = 0; i < capped.length; i++) {
      const a = capped[i];
      const { position, normal } = placement(a.lat, a.lon, GLOBE_RADIUS + SURFACE_LIFT);
      dummy.position.copy(position);
      dummy.quaternion.setFromUnitVectors(UP, normal);
      dummy.scale.setScalar(HALO_RADIUS);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, a.alertLevel === "red" ? RED : ORANGE);
    }
    mesh.count = capped.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [capped]);

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const i = e.instanceId;
    if (i === undefined || !capped[i]) return;
    const a = capped[i];
    select({
      id: `gdacs-${a.id}`,
      kind: "gdacs-alert",
      title: a.name,
      rows: [
        { label: "Alert level", value: a.alertLevel === "red" ? "Red" : "Orange" },
        { label: "Type", value: a.eventType },
        { label: "Matched", value: a.matchId ? `${a.matchKind} ${a.matchId}` : "standalone" },
      ],
      source: "GDACS",
      live: true,
      focus: { kind: "latlon", lat: a.lat, lon: a.lon },
    });
  };

  if (capped.length === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[HALO_GEOMETRY, undefined, MAX_ALERTS]}
      frustumCulled={false}
      renderOrder={3}
      onClick={onClick}
      onPointerOver={() => (document.body.style.cursor = "pointer")}
      onPointerOut={() => (document.body.style.cursor = "auto")}
    >
      {/* depthWrite was already false (additive blending never wants it);
          polygonOffset is new - the third step of the Pune ring stack
          (reachAppRing.tsx's own comment has the full ordering). */}
      <meshBasicMaterial
        toneMapped={false}
        transparent
        opacity={0.85}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        side={THREE.DoubleSide}
        polygonOffset
        polygonOffsetFactor={-3}
        polygonOffsetUnits={-3}
      />
    </instancedMesh>
  );
}
