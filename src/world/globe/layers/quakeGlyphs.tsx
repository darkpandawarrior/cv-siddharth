// LANE L7 (live earth events), task 1: one surface ring per quake, radius by
// magnitude, colour by depth. Three InstancedMeshes (task 8: one per glyph
// kind): the resting rings (rebuilt only when the data or the simulated
// clock's fade changes — quakes don't move, so there is nothing for a
// per-frame loop to do there), a bounded "just arrived" flash overlay, and a
// bounded repeating-ripple overlay for M>=5. Both overlays iterate a small
// capped array in useFrame, never the full quake list, so the steady state
// (no new quakes, tier 3) costs nothing per frame.
import { useEffect, useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { latLonToXyz } from "../geoMath.ts";
import { GLOBE_RADIUS } from "../EarthDots.tsx";
import { useReducedMotion } from "../../../SceneActivity.tsx";
import { useGlobe } from "../globeStore.ts";
import { type Quake, RIPPLE_MIN_MAG, magnitudeToRadius, depthToColor, quakeFadeAlpha } from "./quake.ts";
import { formatQuakeTime } from "./quakeTimeFormat.ts";

declare global {
  interface Window {
    __Z3_QUAKE_MOTION__?: () => { resting: number; ripples: number; scale: number };
  }
}

// A flat annulus, scaled per instance to magnitudeToRadius(mag) — thin
// enough to read as a ring, not a filled disc, at every size this draws.
const RING_GEOMETRY = new THREE.RingGeometry(0.72, 1, 28);
// A filled disc, invisible (opacity 0, not `visible={false}` — three still
// raycasts a visible-but-transparent mesh, which is the whole point) and
// bigger than the ring it sits over: the ring itself is a thin annulus with
// a genuine hole in the middle, so raycasting the visual glyph directly
// means most of a click aimed at "the quake" lands in that hole and hits
// nothing. A real fingertip has the same problem the ring's own thinness
// creates for a mouse — this is a tap-target fix, not a test-only shim.
const HIT_GEOMETRY = new THREE.CircleGeometry(1, 16);
const MIN_HIT_RADIUS = 0.12;
function hitRadius(mag: number): number {
  return Math.max(magnitudeToRadius(mag) * 1.6, MIN_HIT_RADIUS);
}
const MAX_QUAKES = 200; // USGS's all_day feed runs low hundreds on an active day; a hard cap bounds the instanced buffer
const MAX_FLASHES = 12;
const MAX_RIPPLES = 12;
const ARRIVAL_MS = 900;
const RIPPLE_PERIOD_S = 2.6;
// The scene's own background (GlobeScene.tsx's <color attach="background">)
// — fading a ring's colour toward it is this lane's stand-in for per-instance
// alpha (InstancedMesh has no built-in per-instance opacity channel; a real
// one needs a custom shader + InstancedBufferAttribute). ponytail: darkening
// toward the known background reads as "fading" without one; upgrade to a
// shader if the earth's own background ever varies under this ring.
const BACKGROUND = new THREE.Color("#05070a");
const dummy = new THREE.Object3D();
const tmpColor = new THREE.Color();
const UP = new THREE.Vector3(0, 0, 1);

function surfacePlacement(lat: number, lon: number, radius: number): { position: THREE.Vector3; normal: THREE.Vector3 } {
  const p = latLonToXyz(lat, lon);
  const normal = new THREE.Vector3(p.x, p.y, p.z);
  return { position: normal.clone().multiplyScalar(radius), normal };
}

export function QuakeGlyphs({ quakes, staticTier, simNowMs }: { quakes: Quake[]; staticTier: boolean; simNowMs: number }) {
  const reducedMotion = useReducedMotion();
  const motionOff = staticTier || reducedMotion;
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const hitRef = useRef<THREE.InstancedMesh>(null);
  const flashRef = useRef<THREE.InstancedMesh>(null);
  const rippleRef = useRef<THREE.InstancedMesh>(null);
  // id -> the `performance.now()` this id was first drawn — a plain ref map,
  // not React state, so a new quake arriving never triggers a re-render.
  const arrivalsRef = useRef<Map<string, number>>(new Map());
  const select = useGlobe((s) => s.select);

  useEffect(() => {
    window.__Z3_QUAKE_MOTION__ = () => ({
      resting: meshRef.current?.count ?? 0,
      ripples: rippleRef.current?.count ?? 0,
      scale: rippleRef.current?.instanceMatrix.array[0] ?? 0,
    });
    return () => { delete window.__Z3_QUAKE_MOTION__; };
  }, []);

  const capped = useMemo(() => quakes.slice(0, MAX_QUAKES), [quakes]);

  useEffect(() => {
    const mesh = meshRef.current;
    const hitMesh = hitRef.current;
    if (!mesh || !hitMesh) return;
    for (let i = 0; i < capped.length; i++) {
      const q = capped[i];
      const { position, normal } = surfacePlacement(q.lat, q.lon, GLOBE_RADIUS + 0.015);
      dummy.position.copy(position);
      dummy.quaternion.setFromUnitVectors(UP, normal);
      dummy.scale.setScalar(magnitudeToRadius(q.mag));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      const fade = quakeFadeAlpha(simNowMs, q.timeMs);
      tmpColor.set(depthToColor(q.depthKm)).lerp(BACKGROUND, 1 - fade);
      mesh.setColorAt(i, tmpColor);

      dummy.scale.setScalar(hitRadius(q.mag));
      dummy.updateMatrix();
      hitMesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.count = capped.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    hitMesh.count = capped.length;
    hitMesh.instanceMatrix.needsUpdate = true;
  }, [capped, simNowMs]);

  // T3 is a static read (this lane's task 1): no arrival flash, no ripple,
  // ever — arrivalsRef stays empty so the two overlay meshes always draw 0.
  useEffect(() => {
    if (motionOff) return;
    const seen = new Set(capped.map((q) => q.id));
    for (const q of capped) if (!arrivalsRef.current.has(q.id)) arrivalsRef.current.set(q.id, performance.now());
    for (const id of arrivalsRef.current.keys()) if (!seen.has(id)) arrivalsRef.current.delete(id);
  }, [capped, motionOff]);

  const placements = useMemo(() => new Map(capped.map((q) => [q.id, {
    ...surfacePlacement(q.lat, q.lon, GLOBE_RADIUS + 0.02),
    color: new THREE.Color(depthToColor(q.depthKm)),
  }])), [capped]);
  const rippleCandidates = useMemo(
    () => (motionOff ? [] : capped.filter((q) => q.mag >= RIPPLE_MIN_MAG).slice(0, MAX_RIPPLES)),
    [capped, motionOff],
  );

  useFrame(({ clock }) => {
    if (motionOff) return;
    const flashMesh = flashRef.current;
    if (flashMesh) {
      const now = performance.now();
      let n = 0;
      for (let i = 0; i < capped.length && n < MAX_FLASHES; i++) {
        const q = capped[i];
        const arrival = arrivalsRef.current.get(q.id);
        if (arrival === undefined) continue;
        const age = now - arrival;
        if (age >= ARRIVAL_MS) continue;
        const t = age / ARRIVAL_MS;
        const { position, normal, color } = placements.get(q.id)!;
        dummy.position.copy(position);
        dummy.quaternion.setFromUnitVectors(UP, normal);
        // A one-shot bump: grows past its resting size then settles — sin(t*pi)
        // is 0 at both ends and peaks at t=0.5, exactly a single pulse.
        dummy.scale.setScalar(magnitudeToRadius(q.mag) * (1 + Math.sin(t * Math.PI) * 0.8));
        dummy.updateMatrix();
        flashMesh.setMatrixAt(n, dummy.matrix);
        tmpColor.copy(color).multiplyScalar(1 - t);
        flashMesh.setColorAt(n, tmpColor);
        n++;
      }
      flashMesh.count = n;
      flashMesh.instanceMatrix.needsUpdate = true;
      if (flashMesh.instanceColor) flashMesh.instanceColor.needsUpdate = true;
    }

    const rippleMesh = rippleRef.current;
    if (rippleMesh) {
      const t = clock.elapsedTime;
      for (let i = 0; i < rippleCandidates.length; i++) {
        const q = rippleCandidates[i];
        // Each ripple's phase is offset by its own index so a screen with
        // several M5+ quakes doesn't pulse them all in lockstep.
        const phase = ((t + i * 0.37) % RIPPLE_PERIOD_S) / RIPPLE_PERIOD_S;
        const { position, normal, color } = placements.get(q.id)!;
        dummy.position.copy(position);
        dummy.quaternion.setFromUnitVectors(UP, normal);
        dummy.scale.setScalar(magnitudeToRadius(q.mag) * (1 + phase * 1.6));
        dummy.updateMatrix();
        rippleMesh.setMatrixAt(i, dummy.matrix);
        tmpColor.copy(color).multiplyScalar(1 - phase);
        rippleMesh.setColorAt(i, tmpColor);
      }
      rippleMesh.count = rippleCandidates.length;
      rippleMesh.instanceMatrix.needsUpdate = true;
      if (rippleMesh.instanceColor) rippleMesh.instanceColor.needsUpdate = true;
    }
  });

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const i = e.instanceId;
    if (i === undefined || !capped[i]) return;
    const q = capped[i];
    select({
      id: `quake-${q.id}`,
      kind: "quake",
      title: `M ${q.mag.toFixed(1)} — ${q.place}`,
      rows: [
        { label: "Magnitude", value: q.mag.toFixed(1) },
        { label: "Place", value: q.place },
        { label: "Depth", value: `${q.depthKm.toFixed(1)} km` },
        { label: "Time", value: formatQuakeTime(simNowMs, q.timeMs) },
      ],
      source: "USGS, live",
      live: true,
      focus: { kind: "latlon", lat: q.lat, lon: q.lon },
    });
  };
  const setCursor = (hover: boolean) => {
    document.body.style.cursor = hover ? "pointer" : "auto";
  };

  if (capped.length === 0) return null;

  return (
    <group>
      <instancedMesh ref={meshRef} args={[RING_GEOMETRY, undefined, MAX_QUAKES]} frustumCulled={false}>
        <meshBasicMaterial toneMapped={false} transparent opacity={0.9} side={THREE.DoubleSide} />
      </instancedMesh>
      <instancedMesh
        ref={hitRef}
        args={[HIT_GEOMETRY, undefined, MAX_QUAKES]}
        frustumCulled={false}
        onClick={onClick}
        onPointerOver={() => setCursor(true)}
        onPointerOut={() => setCursor(false)}
      >
        <meshBasicMaterial transparent opacity={0} depthWrite={false} depthTest={false} side={THREE.DoubleSide} />
      </instancedMesh>
      {!motionOff && (
        <instancedMesh ref={flashRef} args={[RING_GEOMETRY, undefined, MAX_FLASHES]} count={0} frustumCulled={false}>
          <meshBasicMaterial toneMapped={false} transparent blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
        </instancedMesh>
      )}
      {!motionOff && rippleCandidates.length > 0 && (
        <instancedMesh ref={rippleRef} args={[RING_GEOMETRY, undefined, MAX_RIPPLES]} frustumCulled={false}>
          <meshBasicMaterial toneMapped={false} transparent blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
        </instancedMesh>
      )}
    </group>
  );
}
