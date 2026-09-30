import { useEffect, useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { useLiveSignal } from "../../lib/useLiveSignal.ts";
import { latLonToXyz } from "./geoMath.ts";
import { GLOBE_RADIUS } from "./EarthDots.tsx";
import { useGlobe, entityPositions, sceneHandles } from "./globeStore.ts";
import { deadReckon, clampDeadReckonSec, pushTrail, pruneTrails, type LatLon } from "./layers/aircraftTrack.ts";
import { formatTimeAgo } from "./layers/pulseEvents.ts";
import { formatAltitude } from "./localTrafficFormat.ts";
import type { AircraftEntry, AircraftResponse } from "../../../api/_lib/aircraft-handler.ts";

declare global {
  interface Window {
    __G3_AIRCRAFT__?: { screenPoint: (callsign: string) => { x: number; y: number } | null; face: (callsign: string) => void };
  }
}

// S7, ambient (claim: false) - the local Pune cluster only, never global
// aircraft (living-ledger-spec.md#6.3, GLOBE lens §1 "GLOBE b").
const AIRCRAFT_POLL_MS = 20_000; // streams.ts's own S7 pollMs
// §6.3 Tiers: "the plane counts replaced by the local cluster (T1 60, T2 20,
// T3 0)".
const CAP_BY_TIER: Record<1 | 2 | 3, number> = { 1: 60, 2: 20, 3: 0 };
// api/_lib/aircraft-handler.ts's own MAX_RESULTS - the server never returns
// more than this, so the InstancedMesh is allocated once at that ceiling.
const MAX_AIRCRAFT = 64;
const TRAIL_LEN = 3;
const AIRCRAFT_COLOR = new THREE.Color("#c9d4d0");
const TRAIL_COLOR = new THREE.Color("#c9d4d0");
const dummy = new THREE.Object3D();

// height x20: a real 30,000ft airliner sits 0.0086 world units above the
// surface (1 unit = 1,061.8 km, living-ledger-spec.md#6.3's own frame note)
// -- invisible against a 0.03-unit chevron. Twenty times reads as a small,
// legible bump without the aircraft floating off the globe. Stated here AND
// in the inspector row (never a silent exaggeration).
const ALT_EXAGGERATION = 20;
const KM_PER_UNIT = 6371 / GLOBE_RADIUS;
const FT_TO_KM = 0.0003048;

function altitudeUnits(altFt: number | null): number {
  const km = (altFt ?? 0) * FT_TO_KM;
  return (km / KM_PER_UNIT) * ALT_EXAGGERATION;
}

// Scratch objects for the per-frame path. useFrame runs the helpers below
// once per aircraft (and per trail dot) every frame, so they write into
// these instead of allocating: at the T1 cap that was hundreds of short-lived
// vectors, quaternions and matrices a frame, all garbage.
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const X_AXIS = new THREE.Vector3(1, 0, 0);
const _normal = new THREE.Vector3();
const _east = new THREE.Vector3();
const _north = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _basis = new THREE.Matrix4();
const _trailColor = new THREE.Color();
const NO_TRAIL: readonly { lat: number; lon: number }[] = [];

/** East/north/up at a lat/lon into _east/_north/_normal -- the tangent-plane
 *  basis a chevron's heading is drawn in. Falls back to a fixed reference
 *  near the poles, where `WORLD_UP` and the surface normal nearly coincide. */
function localFrame(lat: number, lon: number): void {
  const p = latLonToXyz(lat, lon);
  _normal.set(p.x, p.y, p.z);
  const ref = Math.abs(_normal.dot(WORLD_UP)) > 0.999 ? X_AXIS : WORLD_UP;
  _east.crossVectors(ref, _normal).normalize();
  _north.crossVectors(_normal, _east).normalize();
}

/** A flat, forward-pointing triangle -- authored in its own XY plane, nose
 *  at +Y, face normal +Z -- for `chevronQuaternion` to lay tangent to the
 *  surface and rotate to the aircraft's true track. */
function chevronGeometry(size = 0.05): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array([0, size, 0, -size * 0.55, -size * 0.6, 0, size * 0.55, -size * 0.6, 0]);
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setIndex([0, 1, 2]);
  geo.computeVertexNormals();
  return geo;
}
const CHEVRON_GEOMETRY = chevronGeometry();
const TRAIL_GEOMETRY = new THREE.SphereGeometry(0.012, 6, 6);

/** Orients local +Z to the surface normal (flat, tangent) and local +Y to
 *  the true-track bearing (measured clockwise from north) -- the chevron's
 *  nose points where the aircraft is actually headed. */
function chevronQuaternion(lat: number, lon: number, trackDeg: number | null, out: THREE.Quaternion): THREE.Quaternion {
  localFrame(lat, lon);
  const theta = ((trackDeg ?? 0) * Math.PI) / 180;
  _forward.copy(_north).multiplyScalar(Math.cos(theta)).addScaledVector(_east, Math.sin(theta)).normalize();
  _right.crossVectors(_forward, _normal).normalize();
  _basis.makeBasis(_right, _forward, _normal);
  return out.setFromRotationMatrix(_basis);
}

function worldPosition(lat: number, lon: number, altFt: number | null, out: THREE.Vector3): THREE.Vector3 {
  const p = latLonToXyz(lat, lon);
  const r = GLOBE_RADIUS + altitudeUnits(altFt);
  return out.set(p.x * r, p.y * r, p.z * r);
}

/**
 * LocalTraffic (S7, living-ledger-spec.md#6.3 task 4, GLOBE lens L4): the
 * same adsb.lol-derived local cluster the valley draws, as heading-true
 * chevrons -- not spheres -- with a true-scale-but-labelled altitude, short
 * fading trails from the last few polls, and gentle dead-reckoning between
 * polls so an aircraft advances smoothly instead of jumping every 20s
 * (clamped to 60s -- past that, a guess is not a position). Tier-gated by
 * the count itself: T3's cap of 0 renders nothing.
 */
export function LocalTraffic({ tier }: { tier: 1 | 2 | 3 }) {
  const cap = CAP_BY_TIER[tier];
  const { data, error } = useLiveSignal<AircraftResponse>("/api/aircraft", AIRCRAFT_POLL_MS);
  const select = useGlobe((s) => s.select);
  const setStatus = useGlobe((s) => s.setStatus);
  const aircraft = useMemo(() => (data?.connected ? data.aircraft.slice(0, cap) : []), [data, cap]);

  // The poll's own arrival time -- dead-reckoning's dt anchor -- and the raw
  // list read by both useFrame (dead-reckoning) and entityPositions'
  // getters (both need the LATEST poll, never a stale closure).
  // 0, not performance.now() (an impure call during render) -- the first
  // real poll's useEffect sets this before dead-reckoning ever reads it.
  const pollAtMsRef = useRef(0);
  const aircraftRef = useRef<AircraftEntry[]>([]);
  const trailsRef = useRef<Map<string, LatLon[]>>(new Map());
  useEffect(() => {
    pollAtMsRef.current = performance.now();
    aircraftRef.current = aircraft;
    trailsRef.current = pruneTrails(trailsRef.current, new Set(aircraft.map((a) => a.cs)));
    for (const a of aircraft) trailsRef.current = pushTrail(trailsRef.current, a.cs, { lat: a.lat, lon: a.lon }, TRAIL_LEN + 1);
  }, [aircraft]);

  useEffect(() => {
    if (cap === 0) {
      setStatus("aircraft", { state: "failed", detail: "off at this tier" });
      return;
    }
    if (error && !data) {
      setStatus("aircraft", { state: "failed", detail: "adsb.lol feed unreachable" });
      return;
    }
    if (!data?.connected) {
      setStatus("aircraft", { state: data ? "live" : "loading", detail: data ? "no aircraft in range" : undefined });
      return;
    }
    const detail = data.stale
      ? `${data.total} aircraft, last good read ${data.at ? formatTimeAgo(Date.now(), data.at) : "unknown"} (stale)`
      : `${data.total} aircraft, ${data.at ? formatTimeAgo(Date.now(), data.at) : "just now"}`;
    setStatus("aircraft", { state: data.stale ? "snapshot" : "live", detail });
  }, [data, error, cap, setStatus]);

  // Follow-view targets (globeStore's entityPositions contract): registered
  // per callsign, re-computed lazily on every call from the live refs above
  // -- never cached React state, so a follow camera always reads a fresh
  // dead-reckoned position no matter when it calls.
  useEffect(() => {
    const ids = aircraft.map((a) => `air:${a.cs}`);
    for (const a of aircraft) {
      entityPositions.set(`air:${a.cs}`, () => {
        const entry = aircraftRef.current.find((x) => x.cs === a.cs);
        if (!entry) return null;
        const dtSec = clampDeadReckonSec((performance.now() - pollAtMsRef.current) / 1000);
        const pos = entry.trkDeg !== null && entry.gsKt !== null ? deadReckon(entry, entry.trkDeg, entry.gsKt, dtSec) : entry;
        // Fresh vector: the follow camera may hold on to it across frames.
        return worldPosition(pos.lat, pos.lon, entry.altFt, new THREE.Vector3());
      });
    }
    return () => {
      for (const id of ids) entityPositions.delete(id);
    };
  }, [aircraft]);

  const meshRef = useRef<THREE.InstancedMesh>(null);
  const trailMeshRef = useRef<THREE.InstancedMesh>(null);
  const metaRef = useRef<(AircraftEntry | null)[]>(new Array(MAX_AIRCRAFT).fill(null));
  const domRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!window.__W11_TEST__) return;
    window.__G3_AIRCRAFT__ = {
      face: callsign => {
        const aircraft = aircraftRef.current.find(a => a.cs === callsign);
        if (aircraft) useGlobe.getState().flyTo({ kind: "latlon", lat: aircraft.lat, lon: aircraft.lon, distance: 9.5 });
      },
      screenPoint: callsign => {
        const i = metaRef.current.findIndex(a => a?.cs === callsign);
        const { camera, canvas } = sceneHandles;
        const mesh = meshRef.current;
        if (i < 0 || !mesh || !camera || !canvas) return null;
        const matrix = new THREE.Matrix4();
        mesh.getMatrixAt(i, matrix);
        const point = new THREE.Vector3().setFromMatrixPosition(matrix).project(camera);
        const box = canvas.getBoundingClientRect();
        return { x: box.left + (point.x + 1) * box.width / 2, y: box.top + (1 - point.y) * box.height / 2 };
      },
    };
    return () => { delete window.__G3_AIRCRAFT__; };
  }, []);

  useFrame(() => {
    const mesh = meshRef.current;
    const trailMesh = trailMeshRef.current;
    if (!mesh || !trailMesh) return;
    const list = aircraftRef.current;
    const dtSec = clampDeadReckonSec((performance.now() - pollAtMsRef.current) / 1000);

    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      const pos = a.trkDeg !== null && a.gsKt !== null ? deadReckon(a, a.trkDeg, a.gsKt, dtSec) : a;
      worldPosition(pos.lat, pos.lon, a.altFt, dummy.position);
      chevronQuaternion(pos.lat, pos.lon, a.trkDeg, dummy.quaternion);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, AIRCRAFT_COLOR);
      metaRef.current[i] = a;
    }
    mesh.count = list.length;
    // Rendering an empty feed caches an empty bound; moving instances must refresh it for raycasts.
    mesh.computeBoundingSphere();
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    let trailIndex = 0;
    for (const a of list) {
      const path = trailsRef.current.get(a.cs) ?? NO_TRAIL;
      // Drop the newest sample (that's the current chevron itself) and fade
      // the rest, oldest dimmest.
      const historyLen = path.length - 1;
      for (let h = 0; h < historyLen; h++) {
        if (trailIndex >= MAX_AIRCRAFT * TRAIL_LEN) break;
        worldPosition(path[h].lat, path[h].lon, a.altFt, dummy.position);
        dummy.quaternion.identity();
        const age = historyLen - h; // 1 = most recent trail dot
        dummy.scale.setScalar(1 / (age + 1));
        dummy.updateMatrix();
        trailMesh.setMatrixAt(trailIndex, dummy.matrix);
        trailMesh.setColorAt(trailIndex, _trailColor.copy(TRAIL_COLOR).multiplyScalar(1 / (age + 1.4)));
        trailIndex++;
      }
    }
    trailMesh.count = trailIndex;
    trailMesh.instanceMatrix.needsUpdate = true;
    if (trailMesh.instanceColor) trailMesh.instanceColor.needsUpdate = true;

    if (domRef.current) domRef.current.dataset.aircraftCount = String(list.length);
  });

  function onPick(instanceId: number | undefined) {
    if (instanceId === undefined) return;
    const a = metaRef.current[instanceId];
    if (!a) return;
    select({
      id: `air:${a.cs}`,
      kind: "aircraft",
      title: a.cs,
      rows: [
        { label: "type", value: a.type ?? "unknown" },
        { label: "altitude", value: formatAltitude(a.altFt) },
        { label: "speed", value: a.gsKt !== null ? `${a.gsKt} kt` : "unknown" },
        { label: "heading", value: a.trkDeg !== null ? `${a.trkDeg}°` : "unknown" },
      ],
      source: "live, adsb.lol via /api/aircraft",
      live: true,
      focus: { kind: "entity", id: `air:${a.cs}` },
    });
  }

  if (cap === 0) return null;

  return (
    <group>
      <Html style={{ display: "none" }}>
        <div ref={domRef} data-aircraft-layer aria-hidden />
      </Html>
      <instancedMesh ref={trailMeshRef} args={[TRAIL_GEOMETRY, undefined, MAX_AIRCRAFT * TRAIL_LEN]} frustumCulled={false} count={0}>
        <meshBasicMaterial toneMapped={false} transparent opacity={0.6} depthWrite={false} />
      </instancedMesh>
      <instancedMesh
        ref={meshRef}
        args={[CHEVRON_GEOMETRY, undefined, MAX_AIRCRAFT]}
        frustumCulled={false}
        count={0}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          void import("./useMarkerClick.ts").then(({ claimGuideClick }) => {
            if (!claimGuideClick(e.nativeEvent)) onPick(e.instanceId);
          });
        }}
      >
        <meshBasicMaterial color={AIRCRAFT_COLOR} toneMapped={false} side={THREE.DoubleSide} />
      </instancedMesh>
    </group>
  );
}
