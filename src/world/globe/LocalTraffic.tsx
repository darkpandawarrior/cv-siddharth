import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useLiveSignal } from "../../lib/useLiveSignal.ts";
import { latLonToXyz } from "./geoMath.ts";
import { GLOBE_RADIUS } from "./EarthDots.tsx";
import type { AircraftResponse } from "../../../api/_lib/aircraft-handler.ts";

// S7, ambient (claim: false) - the local Pune cluster only, never global
// aircraft (living-ledger-spec.md#6.3, GLOBE lens §1 "GLOBE b").
const AIRCRAFT_POLL_MS = 20_000; // streams.ts's own S7 pollMs
// §6.3 Tiers: "the plane counts replaced by the local cluster (T1 60, T2 20,
// T3 0)".
const CAP_BY_TIER: Record<1 | 2 | 3, number> = { 1: 60, 2: 20, 3: 0 };
// api/_lib/aircraft-handler.ts's own MAX_RESULTS - the server never returns
// more than this, so the InstancedMesh is allocated once at that ceiling.
const MAX_AIRCRAFT = 64;
const AIRCRAFT_COLOR = new THREE.Color("#c9d4d0");
const DOT_GEOMETRY = new THREE.SphereGeometry(0.02, 6, 6);
const dummy = new THREE.Object3D();

/**
 * LocalTraffic (S7, living-ledger-spec.md#6.3 task 4): the same
 * adsb.lol-derived local cluster the valley draws, plotted at its own real
 * lat/lon (the response already carries one - no az/el reconstruction
 * needed, unlike OrbitLayer's satellites). Tier-gated by the count itself:
 * T3's cap of 0 renders nothing.
 */
export function LocalTraffic({ tier }: { tier: 1 | 2 | 3 }) {
  const cap = CAP_BY_TIER[tier];
  const { data } = useLiveSignal<AircraftResponse>("/api/aircraft", AIRCRAFT_POLL_MS);
  const aircraft = useMemo(() => (data?.connected ? data.aircraft.slice(0, cap) : []), [data, cap]);

  const meshRef = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const r = GLOBE_RADIUS + 0.02;
    for (let i = 0; i < aircraft.length; i++) {
      const p = latLonToXyz(aircraft[i].lat, aircraft[i].lon);
      dummy.position.set(p.x * r, p.y * r, p.z * r);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.count = aircraft.length;
    mesh.instanceMatrix.needsUpdate = true;
  }, [aircraft]);

  if (cap === 0) return null;

  return (
    <instancedMesh ref={meshRef} args={[DOT_GEOMETRY, undefined, MAX_AIRCRAFT]} frustumCulled={false} count={0}>
      <meshBasicMaterial color={AIRCRAFT_COLOR} toneMapped={false} />
    </instancedMesh>
  );
}
