import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useGlobe } from "../globeStore.ts";
import { latLonToXyz } from "../geoMath.ts";
import { GLOBE_RADIUS } from "../EarthDots.tsx";
import type { Volcano } from "./volcano.ts";
export function VolcanoGlyphs({ rows }: { rows: Volcano[] }) {
  const located = rows.filter((v) => v.lat !== null && v.lon !== null && Math.abs(v.lat) <= 90 && Math.abs(v.lon) <= 180).slice(0, 80);
  const ref = useRef<THREE.InstancedMesh>(null);
  const select = useGlobe((s) => s.select);
  useEffect(() => {
    if (!ref.current) return;
    const dummy = new THREE.Object3D(), normal = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < located.length; i++) {
      const v = located[i], p = latLonToXyz(v.lat!, v.lon!);
      normal.set(p.x, p.y, p.z);
      dummy.position.copy(normal).multiplyScalar(GLOBE_RADIUS + 0.025);
      dummy.quaternion.setFromUnitVectors(up, normal);
      dummy.scale.setScalar(0.03);
      dummy.updateMatrix(); ref.current.setMatrixAt(i, dummy.matrix);
    }
    ref.current.count = located.length; ref.current.instanceMatrix.needsUpdate = true;
  }, [located]);
  return <instancedMesh ref={ref} args={[undefined, undefined, 80]} frustumCulled={false} onClick={(e) => {
    const v = located[e.instanceId ?? -1]; if (!v) return; e.stopPropagation();
    select({ id: `gvp:${v.id}`, kind: "volcano", title: `${v.name} (${v.country})`, source: "Smithsonian GVP / USGS weekly report", live: false, focus: { kind: "latlon", lat: v.lat!, lon: v.lon! }, rows: [{ label: "Report week", value: v.week }, { label: "Published", value: new Date(v.at).toISOString() }, { label: "Summary", value: v.summary }, { label: "Source", value: "https://volcano.si.edu/reports_weekly.cfm" }] });
  }}><coneGeometry args={[1, 2, 4]} /><meshBasicMaterial color="#b3452e" toneMapped={false} /></instancedMesh>;
}
