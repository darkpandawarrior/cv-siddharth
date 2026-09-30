import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { activeShowers } from "./meteors.ts";
import { substellarLatLon } from "./skyMath.ts";
import { latLonToXyz } from "../geoMath.ts";
import { useGlobe } from "../globeStore.ts";
// Same celestial sphere as skyStars.tsx. Static peak radiants are approximate;
// no invented meteor streaks or observed-rate claims, no per-frame allocation.
const STAR_RADIUS = 420;
export default function MeteorRadiant({ now, tier }: { now: Date; tier: number }) {
  const showers = useMemo(() => activeShowers(now), [now]);
  const mesh = useRef<THREE.InstancedMesh>(null);
  const select = useGlobe((s) => s.select);
  useEffect(() => {
    if (!mesh.current) return;
    const dummy = new THREE.Object3D(), normal = new THREE.Vector3(), axis = new THREE.Vector3(0, 0, 1);
    for (let i = 0; i < showers.length; i++) {
      const shower = showers[i], sub = substellarLatLon(shower.raHours, shower.decDeg, now), p = latLonToXyz(sub.lat, sub.lon);
      normal.set(p.x, p.y, p.z); dummy.position.copy(normal).multiplyScalar(STAR_RADIUS);
      dummy.quaternion.setFromUnitVectors(axis, normal); dummy.updateMatrix(); mesh.current.setMatrixAt(i, dummy.matrix);
    }
    mesh.current.count = tier === 3 ? 0 : showers.length; mesh.current.instanceMatrix.needsUpdate = true;
  }, [showers, now, tier]);
  return <instancedMesh ref={mesh} args={[undefined, undefined, 10]} frustumCulled={false} onClick={(event) => {
    const shower = showers[event.instanceId ?? -1]; if (!shower) return; event.stopPropagation();
    select({ id: `meteor:${shower.name}`, kind: "meteor", title: `${shower.name} radiant`, live: false, source: "IMO 2026 calendar, static annual approximation", rows: [{ label: "Radiant", value: `${shower.raHours.toFixed(2)}h RA, ${shower.decDeg}° Dec (peak position, drift omitted)` }, { label: "Typical ZHR", value: `${shower.zhr}/h under ideal conditions, not a local forecast` }, { label: "Parent", value: shower.parentBody }, { label: "Source", value: "https://imo.net/files/meteor-shower/cal2026.pdf" }] });
  }}><ringGeometry args={[1.5, 2.3, 16]} /><meshBasicMaterial color="#b7d4ed" side={THREE.DoubleSide} toneMapped={false} /></instancedMesh>;
}
