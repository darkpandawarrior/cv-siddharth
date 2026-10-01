import { useEffect, useMemo, useRef } from "react";
import { type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { useLiveSignal } from "../../../lib/useLiveSignal.ts";
import { useGlobe } from "../globeStore.ts";
import { latLonToXyz } from "../geoMath.ts";
import { GLOBE_RADIUS } from "../EarthDots.tsx";
import { parseBuoyResponse } from "./buoys.ts";
import { formatTimeAgo } from "./quake.ts";
export default function BuoyLayer({ tier }: { tier: number }) {
  const snap = useLiveSignal<unknown>("/api/buoys", 600000);
  const live = useGlobe((s) => s.timeOffsetMin === 0);
  const setStatus = useGlobe((s) => s.setStatus);
  const select = useGlobe((s) => s.select);
  const rows = useMemo(() => snap.error || !live ? [] : (parseBuoyResponse(snap.data) ?? []).slice(0, tier === 1 ? 200 : tier === 2 ? 80 : 30), [snap.data, snap.error, live, tier]);
  const mesh = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    setStatus("buoys", { state: snap.error ? "failed" : !snap.data ? "loading" : "snapshot", detail: snap.error ? "NOAA NDBC unreachable" : `${rows.length} sampled stations, NOAA NDBC, observation times in inspector` });
    if (!mesh.current) return;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < rows.length; i++) {
      const p = latLonToXyz(rows[i].lat, rows[i].lon);
      dummy.position.set(p.x, p.y, p.z).multiplyScalar(GLOBE_RADIUS + 0.025);
      dummy.scale.setScalar(0.025);
      dummy.updateMatrix();
      mesh.current.setMatrixAt(i, dummy.matrix);
    }
    mesh.current.count = rows.length;
    mesh.current.instanceMatrix.needsUpdate = true;
  }, [rows, snap.error, snap.data, setStatus]);
  const click = (event: ThreeEvent<MouseEvent>) => {
    const buoy = rows[event.instanceId ?? -1];
    if (!buoy) return;
    event.stopPropagation();
    const metric = (v: number | null, unit: string) => Number.isFinite(v) ? `${v} ${unit}` : "Not reported";
    select({ id: `buoy:${buoy.id}`, kind: "buoy", title: `Ocean buoy ${buoy.id}`, live: false, source: "NOAA NDBC (public domain)", focus: { kind: "latlon", lat: buoy.lat, lon: buoy.lon }, rows: [
      { label: "Observed", value: `${new Date(buoy.at).toISOString()} (${formatTimeAgo(Date.now(), buoy.at)})` },
      { label: "Wave height", value: metric(buoy.wave, "m") }, { label: "Dominant period", value: metric(buoy.period, "s") },
      { label: "Wind", value: metric(buoy.wind, "m/s") }, { label: "Wind direction", value: metric(buoy.direction, "degrees") }, { label: "Water temperature", value: metric(buoy.water, "°C") },
    ] });
  };
  return <instancedMesh ref={mesh} args={[undefined, undefined, 200]} frustumCulled={false} onClick={click}><sphereGeometry args={[1, 6, 6]} /><meshBasicMaterial color="#8ecbff" toneMapped={false} /></instancedMesh>;
}
