import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html, Line } from "@react-three/drei";
import * as THREE from "three";
import { useLiveSignal } from "../../../lib/useLiveSignal.ts";
import { GLOBE_RADIUS } from "../EarthDots.tsx";
import { entityPositions, simTime, useGlobe, type Selection } from "../globeStore.ts";
import { propagateState, ecefToScene, type SatelliteState, type TleObject } from "../../../lib/satelliteEcef.ts";
import { trailPoints, groundTrackPoints, type ScenePoint } from "./satTrails.ts";
import { publish } from "../feed.ts"; // WAVE 6 LANE X1 (live world feed)
// LANE W4 (wave 3): ISS visible-pass rows only — this file's ownership for
// this lane is scoped to selectSatellite/selectionRows below, nothing else.
// Type-only import (erased at build time) plus a runtime dynamic import()
// inside selectSatellite below, not a static one: satPasses.ts also has a
// second, dynamic-import consumer (SkyLayer.tsx's own "ISS tonight" line),
// and a static import here would list it as a NEW dependency of this file's
// own entry in the eager "Globe" shell's preload manifest — measured, this
// alone accounted for the whole +460 B budget overage (check-budget.mjs),
// since satPasses.ts did not exist in the pre-lane baseline at all. A
// dynamic import here keeps it (and the tiny satellites.ts-adjacent code it
// pulls in) behind its own chunk boundary on both sides.
import type { VisiblePassDetail } from "./satPasses.ts";

/**
 * LANE L3 (real orbits): CelesTrak TLE (/api/tle) propagated live with SGP4,
 * replacing OrbitLayer's synthetic parametrics. Two stations (ISS, CSS) get a
 * marker, an occluded name label, a ~15-minute trail and (T1, ISS only) a
 * ground track; every other "visual" (bright enough to see by eye) object is
 * one InstancedMesh of ambient dots, sunlit brighter than eclipsed. No feed,
 * no draw: `setStatus("satellites", { state: "failed", ... })` and nothing
 * rendered is the honest state under `vite dev`/`vite preview`, where
 * `/api/tle` 404s (living-earth lanes doc, "never fake data").
 *
 * satellite.js's bare import is safe in this build already — see
 * satelliteEcef.ts's own header comment; nothing here needed a vite.config.ts
 * change.
 */

const ISS_NORAD = "25544";
const CSS_NORAD = "48274";
const STATION_NORADS = new Set([ISS_NORAD, CSS_NORAD]);
// "Every ~250 ms" cadence (task spec) for everything except the two
// stations, which repropagate every frame — cheap (two SGP4 calls), and
// smooth position is what a follow-view/marker actually needs.
const AMBIENT_CADENCE_MS = 250;
// ponytail: TLEs carry no magnitude/brightness field, so "40 brightest" is
// approximated as the first 40 objects in /api/tle's own "visual" group
// order (CelesTrak's own curation, not re-sorted here). Upgrade path: join
// against a real magnitude catalogue (e.g. Mike McCants' qs.mag file) if a
// true brightness ordering is ever worth the extra fetch.
const T2_VISUAL_CAP = 40;

const AMBIENT_COLOR = new THREE.Color("#c9d4d0"); // ambient: never a brand token (S8)
const AMBIENT_ECLIPSED = AMBIENT_COLOR.clone().multiplyScalar(0.32);
// A literal, not themeColorThree.ts's readColor("--color-probe", ...): this
// module is only ever reached through GlobeScene's lazy layer import, and
// importing that shared helper here pulled it (and presenceGeo.ts, its
// former same-importer-set neighbour) out of the eager "Globe" shell chunk
// Rollup currently inlines them into — which sits AT budgets.json's ceiling
// already, so the split alone failed check-budget.mjs by ~1.7 KB with no
// code of this lane's own actually growing. The value is the exact
// `--color-probe` token (house rules doc); it just isn't read live off the
// CSS custom property the way Markers.tsx's ring is.
const PROBE_COLOR = new THREE.Color("#5ee6ff");
const DOT_GEOMETRY = new THREE.SphereGeometry(0.028, 6, 6);
const MARKER_GEOMETRY = new THREE.SphereGeometry(0.05, 10, 10);
const dummy = new THREE.Object3D();
// Reused every frame by isOccluded() below — "zero per-frame allocations"
// (living-earth lanes doc) for the one thing every station checks per frame.
const scratchA = new THREE.Vector3();
const scratchB = new THREE.Vector3();

type TleFeed = { connected: boolean; epochNewest: string | null; objects: TleObject[] };

function selectionRows(object: TleObject, state: SatelliteState | null): Selection["rows"] {
  return [
    { label: "NORAD id", value: object.norad },
    { label: "Altitude", value: state ? `${state.altKm.toFixed(0)} km` : "unavailable" },
    { label: "Speed", value: state ? `${state.speedKmS.toFixed(2)} km/s` : "unavailable" },
    { label: "Lat/lon", value: state ? `${state.latDeg.toFixed(1)}°, ${state.lonDeg.toFixed(1)}°` : "unavailable" },
    { label: "Sunlit", value: state ? (state.sunlit ? "sunlit" : "eclipsed") : "unavailable" },
    { label: "TLE epoch age", value: state ? `${state.epochAgeDays.toFixed(1)} days` : "unavailable" },
  ];
}

// LANE W4: the four extra rows a "next visible pass" ISS selection gets,
// appended after the station's own rows above. `null` pass (nothing
// qualifying in the 7-day scan window, or the element too stale to trust)
// reads as an honest "none", never a guessed or stale claim. Takes the
// formatters as parameters rather than importing them at module scope — see
// this file's own satPasses.ts import comment above for why.
function issPassRows(
  pass: VisiblePassDetail | null,
  fmt: { formatPuneClock: (d: Date) => string; azimuthToCompass: (deg: number) => string; formatDurationMin: (min: number) => string },
): Selection["rows"] {
  if (!pass) return [{ label: "Next visible pass (Pune)", value: "none in the next 7 days" }];
  return [
    { label: "Next visible pass (Pune)", value: fmt.formatPuneClock(pass.start) },
    { label: "Max elevation", value: `${pass.maxElDeg.toFixed(0)}°` },
    { label: "Direction", value: `${fmt.azimuthToCompass(pass.startAzDeg)} → ${fmt.azimuthToCompass(pass.endAzDeg)}` },
    { label: "Duration", value: fmt.formatDurationMin(pass.durationMin) },
  ];
}

function selectSatellite(object: TleObject, now: Date): void {
  const state = propagateState(object, now);
  const id = `sat:${object.norad}`;
  const baseRows = selectionRows(object, state);
  const isIss = object.norad === ISS_NORAD;
  useGlobe.getState().select({
    id,
    kind: "satellite",
    title: object.name,
    rows: isIss ? [...baseRows, { label: "Next visible pass (Pune)", value: "computing…" }] : baseRows,
    source: "CelesTrak TLE via /api/tle, SGP4",
    live: true,
    focus: { kind: "entity", id },
  });

  // The pass scan can take a moment (up to a 7-day/30s-step sweep, chunked
  // to the browser's idle time by nextVisiblePass itself) — patch the
  // selection in place once it resolves, but only if the ISS is STILL the
  // current selection (a visitor may have clicked elsewhere while this was
  // in flight; never clobber a later, unrelated selection).
  if (!isIss) return;
  import("./satPasses.ts")
    .then(({ nextVisiblePassDetail, ...fmt }) => nextVisiblePassDetail(object, now).then((pass) => ({ pass, rows: issPassRows(pass, fmt) })))
    .then(({ pass, rows }) => {
      const current = useGlobe.getState().selected;
      if (current?.id !== id) return;
      useGlobe.getState().select({ ...current, rows: [...baseRows, ...rows] });
      // WAVE 6 LANE X1 (live world feed): published only when a real
      // qualifying pass row exists (never invented) and it starts inside
      // 30 min -- this is the one publisher gated behind a visitor's own
      // click (a pass is only ever computed here), not a poll.
      if (pass && pass.start.getTime() - now.getTime() <= 30 * 60_000 && pass.start.getTime() >= now.getTime()) {
        publish({
          id: `iss-pass:${pass.start.toISOString()}`,
          kind: "satellite",
          title: "ISS visible pass over Pune",
          detail: `max elevation ${pass.maxElDeg.toFixed(0)}°, starting soon`,
          whenMs: pass.start.getTime(),
          source: "CelesTrak TLE, SGP4",
          live: true,
          focus: { kind: "entity", id },
          severity: "info",
        });
      }
    })
    .catch(() => {
      const current = useGlobe.getState().selected;
      if (current?.id !== id) return;
      useGlobe.getState().select({ ...current, rows: [...baseRows, { label: "Next visible pass (Pune)", value: "unavailable" }] });
    });
}

/** Cheap "is this point on the globe's far side" test, no raycast: GlobeScene
 *  passes this layer no earthRef to occlude an `<Html>` label against, so a
 *  point at distance `camDist` from an origin-centred sphere of radius
 *  GLOBE_RADIUS is behind it once the angle off the camera direction passes
 *  the sphere's own horizon (`cos(horizon) = GLOBE_RADIUS / camDist`) — exact
 *  for a point ON the sphere, and a safe (slightly early) hide for a point a
 *  little above it, which is all a label ever needs. */
function isOccluded(scenePos: THREE.Vector3, camera: THREE.Camera): boolean {
  const camDist = camera.position.length();
  if (camDist <= GLOBE_RADIUS) return false;
  scratchA.copy(scenePos).normalize();
  scratchB.copy(camera.position).normalize();
  return scratchA.dot(scratchB) <= GLOBE_RADIUS / camDist;
}

/** One station: marker, occluded name label, a trail (T1/T2), and — ISS
 *  only, T1 only — a dashed ground track. Repropagates every frame (two SGP4
 *  calls total across both stations is negligible); the trail/ground track
 *  redraw on the same ~250 ms cadence as the ambient swarm below (state, not
 *  a per-frame write — drei's `<Line>` re-triangulates its own geometry from
 *  `points`, the same component every other R3F scene in this repo already
 *  uses for a line, so a 4x/second setState is the right cost to pay for it
 *  rather than hand-rolling BufferGeometry mutation). */
function StationMarker({ object, tier, drawGroundTrack }: { object: TleObject; tier: 1 | 2 | 3; drawGroundTrack: boolean }) {
  const groupRef = useRef<THREE.Group>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const posRef = useRef(new THREE.Vector3());
  const acc = useRef(0);
  const drawTrail = tier !== 3;
  const [trail, setTrail] = useState<ScenePoint[]>([]);
  const [groundTrack, setGroundTrack] = useState<ScenePoint[]>([]);

  useEffect(() => {
    const id = `sat:${object.norad}`;
    entityPositions.set(id, () => posRef.current.clone());
    return () => {
      entityPositions.delete(id);
    };
  }, [object.norad]);

  const onSelect = useCallback(() => {
    selectSatellite(object, simTime(useGlobe.getState().timeOffsetMin));
  }, [object]);

  useFrame(({ camera }, delta) => {
    const simNow = simTime(useGlobe.getState().timeOffsetMin);
    const state = propagateState(object, simNow);
    const group = groupRef.current;
    if (!state) {
      if (group) group.visible = false;
      if (labelRef.current) labelRef.current.style.display = "none";
      return;
    }
    const p = ecefToScene(state.ecef, GLOBE_RADIUS);
    posRef.current.set(p.x, p.y, p.z);
    if (group) {
      group.visible = true;
      group.position.copy(posRef.current);
    }
    if (labelRef.current) {
      labelRef.current.style.display = isOccluded(posRef.current, camera) ? "none" : "";
    }

    acc.current += delta * 1000;
    if (acc.current < AMBIENT_CADENCE_MS) return;
    acc.current = 0;
    if (drawTrail) setTrail(trailPoints(object, simNow, GLOBE_RADIUS));
    if (drawGroundTrack) setGroundTrack(groundTrackPoints(object, simNow, GLOBE_RADIUS));
  });

  return (
    <>
      <group ref={groupRef}>
        <mesh geometry={MARKER_GEOMETRY} onClick={onSelect}>
          <meshBasicMaterial color={PROBE_COLOR} toneMapped={false} />
        </mesh>
        {/* No distanceFactor: that scales the label WITH camera distance, so
            zooming in on the ISS blew its own name up to unreadable
            multi-hundred-px text (caught in this lane's own visual QA). A
            fixed CSS px size, like Markers.tsx's Pune card, reads the same
            small badge at every zoom level. */}
        <Html center zIndexRange={[0, 0]} style={{ pointerEvents: "none" }}>
          <div
            ref={labelRef}
            data-sat-label={object.norad}
            onClick={onSelect}
            style={{
              pointerEvents: "auto",
              cursor: "pointer",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "#e8efe9",
              background: "rgba(5,7,10,0.72)",
              border: "1px solid rgba(232,239,233,0.18)",
              borderRadius: 6,
              padding: "2px 6px",
              whiteSpace: "nowrap",
              transform: "translateY(-18px)",
            }}
          >
            {object.name}
          </div>
        </Html>
      </group>
      {drawTrail && trail.length > 1 && <Line points={trail.map((p) => [p.x, p.y, p.z])} color={PROBE_COLOR} lineWidth={1} transparent opacity={0.5} />}
      {drawGroundTrack && groundTrack.length > 1 && (
        <Line points={groundTrack.map((p) => [p.x, p.y, p.z])} color={PROBE_COLOR} lineWidth={0.75} dashed dashSize={0.08} gapSize={0.06} transparent opacity={0.4} />
      )}
    </>
  );
}

/** Every non-station "visual" object: one InstancedMesh, sunlit brighter than
 *  eclipsed, hover-highlighted and clickable (S8's ambient rule holds for the
 *  base colour only — a hovered/selected instance is no longer purely
 *  ambient, it is the exact thing a visitor is about to read real data
 *  about, so it takes the probe colour like every other live/claim marker
 *  in this world). Repositioned and recoloured on the ~250 ms cadence, in
 *  place, with a reused dummy object and no per-instance allocation. */
function AmbientSatellites({ objects }: { objects: TleObject[] }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const acc = useRef(0);
  const hoveredIndex = useRef<number | null>(null);
  const selectedNorad = useGlobe((s) => (s.selected?.id.startsWith("sat:") ? s.selected.id.slice(4) : null));
  const positionsRef = useRef<(THREE.Vector3 | null)[]>([]);

  const paint = useCallback(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const simNow = simTime(useGlobe.getState().timeOffsetMin);
    const positions = positionsRef.current;
    positions.length = objects.length;
    for (let i = 0; i < objects.length; i++) {
      const state = propagateState(objects[i], simNow);
      if (!state) {
        dummy.scale.setScalar(0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        positions[i] = null;
        continue;
      }
      const p = ecefToScene(state.ecef, GLOBE_RADIUS);
      dummy.position.set(p.x, p.y, p.z);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      positions[i] = (positions[i] ?? new THREE.Vector3()).set(p.x, p.y, p.z);
      const highlighted = hoveredIndex.current === i || selectedNorad === objects[i].norad;
      mesh.setColorAt(i, highlighted ? PROBE_COLOR : state.sunlit ? AMBIENT_COLOR : AMBIENT_ECLIPSED);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [objects, selectedNorad]);

  useEffect(paint, [paint]);

  useFrame((_, delta) => {
    acc.current += delta * 1000;
    if (acc.current < AMBIENT_CADENCE_MS) return;
    acc.current = 0;
    paint();
  });

  // The selected ambient satellite (if any) rides the follow view too —
  // stations register their own getter permanently; this one only exists
  // while that particular object is the current selection.
  useEffect(() => {
    if (!selectedNorad) return;
    const index = objects.findIndex((o) => o.norad === selectedNorad);
    if (index < 0) return;
    const id = `sat:${selectedNorad}`;
    entityPositions.set(id, () => positionsRef.current[index]?.clone() ?? null);
    return () => {
      entityPositions.delete(id);
    };
  }, [selectedNorad, objects]);

  useEffect(
    () => () => {
      document.body.style.cursor = "";
    },
    [],
  );

  const onPointerMove = useCallback(
    (e: { instanceId?: number }) => {
      if (e.instanceId == null || hoveredIndex.current === e.instanceId) return;
      hoveredIndex.current = e.instanceId;
      document.body.style.cursor = "pointer";
      paint();
    },
    [paint],
  );
  const onPointerOut = useCallback(() => {
    hoveredIndex.current = null;
    document.body.style.cursor = "";
    paint();
  }, [paint]);
  const onClick = useCallback(
    (e: { instanceId?: number; stopPropagation: () => void }) => {
      e.stopPropagation();
      if (e.instanceId == null) return;
      selectSatellite(objects[e.instanceId], simTime(useGlobe.getState().timeOffsetMin));
    },
    [objects],
  );

  if (objects.length === 0) return null;

  return (
    <instancedMesh
      key={objects.length}
      ref={meshRef}
      args={[DOT_GEOMETRY, undefined, objects.length]}
      frustumCulled={false}
      onPointerMove={onPointerMove}
      onPointerOut={onPointerOut}
      onClick={onClick}
    >
      <meshBasicMaterial toneMapped={false} transparent opacity={0.85} />
    </instancedMesh>
  );
}

// `now` is accepted (GlobeScene passes it to every layer stub) but
// deliberately unused: the task spec calls for per-frame propagation off
// `simTime(useGlobe.getState().timeOffsetMin)` (real elapsed time plus the
// scrubber's offset) rather than the once-a-minute `now` tick every other
// layer repaints on — a satellite that only moved once a minute would step,
// not orbit.
export default function SatelliteLayer({ tier }: { now: Date; tier: 1 | 2 | 3 }) {
  const { data, error } = useLiveSignal<TleFeed>("/api/tle", 2 * 60 * 60_000);

  useEffect(() => {
    useGlobe.getState().setStatus("satellites", { state: "loading" });
    return () => useGlobe.getState().setStatus("satellites", undefined);
  }, []);

  useEffect(() => {
    if (!data) {
      if (error) useGlobe.getState().setStatus("satellites", { state: "failed", detail: "TLE feed unreachable" });
      return;
    }
    if (!data.connected || data.objects.length === 0) {
      useGlobe.getState().setStatus("satellites", { state: "failed", detail: "TLE feed unreachable" });
      return;
    }
    const epoch = data.epochNewest ? new Date(data.epochNewest).toISOString().slice(0, 10) : "unknown epoch";
    useGlobe.getState().setStatus("satellites", { state: "live", detail: `${data.objects.length} satellites, CelesTrak TLE, epoch ${epoch}` });
  }, [data, error]);

  const selectedId = useGlobe((s) => s.selected?.id ?? "");

  // tle-handler.ts merges CelesTrak's "stations" and "visual" GP groups
  // without deduping by NORAD id — a station bright enough to also be in
  // the visual group (the ISS is) legitimately arrives twice. Dedupe once
  // here rather than at every consumer below.
  const uniqueObjects = useMemo(() => {
    const seen = new Set<string>();
    return (data?.connected ? data.objects : []).filter((o) => {
      if (seen.has(o.norad)) return false;
      seen.add(o.norad);
      return true;
    });
  }, [data]);
  const stations = useMemo(() => uniqueObjects.filter((o) => STATION_NORADS.has(o.norad)), [uniqueObjects]);
  const visual = useMemo(() => uniqueObjects.filter((o) => !STATION_NORADS.has(o.norad)), [uniqueObjects]);
  const ambient = useMemo(() => {
    if (tier === 1) return visual;
    if (tier === 2) return visual.slice(0, T2_VISUAL_CAP);
    return [];
  }, [visual, tier]);

  // "Never fake data" (living-earth lanes doc): no feed, or a feed that
  // answered with nothing usable (the dev/preview 404 path, or CelesTrak's
  // own `connected: false`), draws nothing at all — no synthetic fallback.
  if (!data?.connected || data.objects.length === 0) return null;

  return (
    <>
      {stations.map((s) => (
        <StationMarker key={s.norad} object={s} tier={tier} drawGroundTrack={tier === 1 && s.norad === ISS_NORAD} />
      ))}
      <AmbientSatellites objects={ambient} />
      {/* Test-only observation seam (LANE L3 owns this file): the plan asks
          e2e to observe a click's resulting selection "through a seam in
          your own files" rather than depend on the Inspector UI another
          lane owns. Zero-footprint, matches GlobeScene's own
          `data-subsolar-probe` pattern. */}
      <Html>
        <div data-sat-selected={selectedId} aria-hidden style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }} />
      </Html>
    </>
  );
}
