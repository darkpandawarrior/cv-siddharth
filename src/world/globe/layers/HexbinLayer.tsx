// WAVE 6 LANE X6 (density: instanced hex-bin columns of quakes + fires).
// Reads HazardLayer.tsx's own read-only snapshot (its own file's minimal
// additive edit) rather than re-fetching USGS/EONET a second time. Pure
// aggregation lives in hexbin.ts; this file is only the instancing + hover
// + click glue, same split as quakeGlyphs.tsx over quake.ts.
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Html } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { latLonToXyz } from "../geoMath.ts";
import { GLOBE_RADIUS } from "../EarthDots.tsx";
import { useGlobe } from "../globeStore.ts";
import { getHazardSnapshot } from "./hazardSnapshot.ts";
import { hexbinPoints, densityHeight, densityColor, type HexPoint, type HexBin } from "./hexbin.ts";

// Snapshot poll: HazardLayer's own feeds refresh every 5-15 min (quake.ts /
// eonet.ts's own poll constants), so re-reading its module-level snapshot
// once every few seconds is comfortably ahead of anything actually changing
// — same "cheap DOM-side poll" precedent as LayerPanel's ISS-availability
// check (that file's own comment: "nowhere near the per-frame budget").
const SNAPSHOT_POLL_MS = 4000;
const CELLS_BY_TIER: Record<1 | 2 | 3, number> = { 1: 500, 2: 260, 3: 0 };
const MAX_BINS = 160;
const BASE_RADIUS = 0.045;
const MIN_HEIGHT = 0.025;
const MAX_HEIGHT = 0.55;
const SURFACE_LIFT = 0.01;

const GEOMETRY = new THREE.CylinderGeometry(1, 1, 1, 6); // 6 radial segments -> a hexagonal prism
const HIT_GEOMETRY = new THREE.CylinderGeometry(1.5, 1.5, 1, 6); // generous hit target, same tap-target fix as quakeGlyphs.tsx's HIT_GEOMETRY
const dummy = new THREE.Object3D();
const tmpColor = new THREE.Color();
const UP_Y = new THREE.Vector3(0, 1, 0); // CylinderGeometry's own axis, unlike the ring glyphs' local Z

function surfaceNormal(lat: number, lon: number): THREE.Vector3 {
  const p = latLonToXyz(lat, lon);
  return new THREE.Vector3(p.x, p.y, p.z);
}

function hoverLabel(bin: HexBin): string {
  const parts: string[] = [];
  if (bin.quakeCount > 0) parts.push(`${bin.quakeCount} quake${bin.quakeCount === 1 ? "" : "s"}`);
  if (bin.fireCount > 0) parts.push(`${bin.fireCount} fire${bin.fireCount === 1 ? "" : "s"}`);
  return `${parts.join(", ")} — USGS + NASA EONET, last day`;
}

export default function HexbinLayer({ tier }: { now: Date; tier: 1 | 2 | 3 }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const hitRef = useRef<THREE.InstancedMesh>(null);
  const select = useGlobe((s) => s.select);
  const setStatus = useGlobe((s) => s.setStatus);
  const hazardsStatus = useGlobe((s) => s.status.hazards);
  const [hovered, setHovered] = useState<HexBin | null>(null);
  const [tick, setTick] = useState(0);
  // e2e-only seam, same trick as LocalTraffic.tsx's own `data-aircraft-layer`
  // (a hidden Html-portal node, imperatively written -- Html is already
  // imported here for the hover tooltip, so this costs nothing extra in the
  // Globe chunk unlike HazardLayer.tsx's own window-global seam, whose own
  // comment explains why IT avoided a second Html portal).
  const domRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), SNAPSHOT_POLL_MS);
    return () => clearInterval(id);
  }, []);

  const bins = useMemo(() => {
    const snap = getHazardSnapshot();
    const points: HexPoint[] = [
      ...snap.quakes.map((q) => ({ lat: q.lat, lon: q.lon, kind: "quake" as const })),
      ...snap.fires.map((f) => ({ lat: f.lat, lon: f.lon, kind: "fire" as const })),
    ];
    const cellCount = CELLS_BY_TIER[tier];
    const all = hexbinPoints(points, cellCount);
    // Busiest first, capped — the same "hard ceiling on an instanced buffer"
    // rule every other glyph layer here follows (quakeGlyphs.tsx's own
    // MAX_QUAKES).
    return all.sort((a, b) => b.total - a.total).slice(0, MAX_BINS);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `tick` exists only to re-read the module-level snapshot on a timer
  }, [tier, tick]);

  const maxTotal = useMemo(() => bins.reduce((m, b) => Math.max(m, b.total), 0), [bins]);

  // Health, same house convention every other layer follows (globe-lanes.md:
  // "a layer's honest health, shown beside its toggle"). This layer has no
  // feed of its own to fail against -- it only aggregates HazardLayer's
  // already-fetched snapshot -- so a truly empty snapshot mirrors HazardLayer's
  // OWN reported state (its "failed" is real news; this layer's own "nothing
  // to bin" on a live snapshot is not).
  useEffect(() => {
    if (bins.length > 0) {
      const totalEvents = bins.reduce((sum, b) => sum + b.total, 0);
      setStatus("density", { state: "live", detail: `${bins.length} cells, ${totalEvents} events (quakes + fires, last day)` });
    } else if (hazardsStatus?.state === "failed") {
      setStatus("density", { state: "failed", detail: `nothing to aggregate — ${hazardsStatus.detail ?? "hazards feed unreachable"}` });
    } else {
      setStatus("density", { state: "snapshot", detail: "no quakes or fires to aggregate right now" });
    }
    return () => setStatus("density", undefined);
  }, [bins, hazardsStatus, setStatus]);

  useEffect(() => {
    const mesh = meshRef.current;
    const hitMesh = hitRef.current;
    if (!mesh || !hitMesh) return;
    for (let i = 0; i < bins.length; i++) {
      const bin = bins[i];
      const frac = densityHeight(bin.total, maxTotal);
      const height = MIN_HEIGHT + frac * (MAX_HEIGHT - MIN_HEIGHT);
      const normal = surfaceNormal(bin.lat, bin.lon);
      dummy.position.copy(normal).multiplyScalar(GLOBE_RADIUS + SURFACE_LIFT + height / 2);
      dummy.quaternion.setFromUnitVectors(UP_Y, normal);
      dummy.scale.set(BASE_RADIUS, height, BASE_RADIUS);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      const [r, g, b] = densityColor(frac);
      tmpColor.setRGB(r, g, b);
      mesh.setColorAt(i, tmpColor);

      dummy.scale.set(BASE_RADIUS, height + SURFACE_LIFT, BASE_RADIUS);
      dummy.updateMatrix();
      hitMesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.count = bins.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    hitMesh.count = bins.length;
    hitMesh.instanceMatrix.needsUpdate = true;
    if (domRef.current) domRef.current.dataset.densityCount = String(bins.length);
  }, [bins, maxTotal]);

  const onPointerMove = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      const i = e.instanceId;
      if (i === undefined || !bins[i]) return;
      setHovered(bins[i]);
      document.body.style.cursor = "pointer";
    },
    [bins],
  );
  const onPointerOut = useCallback(() => {
    setHovered(null);
    document.body.style.cursor = "auto";
  }, []);
  const onClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      const i = e.instanceId;
      if (i === undefined || !bins[i]) return;
      const bin = bins[i];
      select({
        id: `density-${bin.lat.toFixed(2)}-${bin.lon.toFixed(2)}`,
        kind: "density",
        title: `Density cell — ${bin.total} event${bin.total === 1 ? "" : "s"}`,
        rows: [
          { label: "Quakes (count)", value: String(bin.quakeCount) },
          { label: "Fires (count)", value: String(bin.fireCount) },
          { label: "Cell centre", value: `${bin.lat.toFixed(1)}, ${bin.lon.toFixed(1)}` },
        ],
        source: "USGS + NASA EONET, last day — equal-area-ish hex cell, count not magnitude",
        live: true,
        focus: { kind: "latlon", lat: bin.lat, lon: bin.lon },
      });
    },
    [bins, select],
  );

  const hoveredPos = hovered ? surfaceNormal(hovered.lat, hovered.lon).multiplyScalar(GLOBE_RADIUS + SURFACE_LIFT + MAX_HEIGHT + 0.1) : null;

  if (bins.length === 0) return null;

  return (
    <group>
      <instancedMesh ref={meshRef} args={[GEOMETRY, undefined, MAX_BINS]} frustumCulled={false}>
        <meshStandardMaterial toneMapped={false} roughness={0.6} metalness={0.05} />
      </instancedMesh>
      <instancedMesh
        ref={hitRef}
        args={[HIT_GEOMETRY, undefined, MAX_BINS]}
        frustumCulled={false}
        onPointerMove={onPointerMove}
        onPointerOut={onPointerOut}
        onClick={onClick}
      >
        <meshBasicMaterial transparent opacity={0} depthWrite={false} depthTest={false} />
      </instancedMesh>
      {/* This layer's columns are static instanced geometry (no per-frame
          animation), so there is nothing motion-related to gate here --
          reducedMotion is read only for the tests/e2e contract every other
          layer in this file follows, not because the tooltip itself moves. */}
      <Html style={{ display: "none" }}>
        <div ref={domRef} data-density-layer aria-hidden />
      </Html>
      {hovered && hoveredPos && (
        <Html position={hoveredPos} center distanceFactor={10} style={{ pointerEvents: "none" }}>
          <div
            data-density-tooltip
            style={{ background: "rgba(10,13,12,0.9)", color: "#c9d4d0", padding: "4px 8px", borderRadius: 6, fontSize: 12, whiteSpace: "nowrap", fontFamily: "inherit" }}
          >
            {hoverLabel(hovered)}
          </div>
        </Html>
      )}
    </group>
  );
}
