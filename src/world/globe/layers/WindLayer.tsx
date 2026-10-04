import { useCallback, useEffect, useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { useLiveSignal } from "../../../lib/useLiveSignal.ts";
import { useWeather } from "../../../lib/useSky.ts";
import { PUNE, WMO_LABEL } from "../../../lib/sky.ts";
import { useReducedMotion } from "../../../SceneActivity.tsx";
import { latLonToXyz, fibonacciLattice } from "../geoMath.ts";
import { GLOBE_RADIUS } from "../EarthDots.tsx";
import { useGlobe } from "../globeStore.ts";
import { buildWindField, sampleWind, windSpeed, DEG2RAD, WIND_LEGEND, type WindField } from "./windField.ts";
import { advectStep, randomSpherePoint, shouldRespawn, VISUAL_SPEED_SCALE } from "./windAdvect.ts";
import type { WindResponse } from "../../../../api/_lib/wind-handler.ts";

/**
 * LANE W5 (global wind + Pune weather), wave 3. Two independent draw calls:
 *
 *  - `WindParticles`: a few thousand short trailing line segments advected
 *    over the real /api/wind grid (earth.nullschool style) — one
 *    `LineSegments`, no per-frame allocation (every particle's scalar state
 *    lives in flat Float32Arrays sized once at mount, this world's D1
 *    purity discipline — see skyStars.tsx's own comment — kept by never
 *    calling Math.random() during render: the initial seed uses geoMath.ts's
 *    deterministic Fibonacci lattice, and the buffers themselves are
 *    allocated once at the T1 ceiling and reused across a tier change via a
 *    plain lazy `useRef`, exactly LocalTraffic.tsx's own
 *    fixed-ceiling-InstancedMesh-plus-`mesh.count` pattern).
 *  - `PuneWeather`: when /api/weather says it's raining at Pune and the
 *    camera is close enough to read it, a small cloud+rain cluster — one
 *    `InstancedMesh` sharing a single cylinder geometry for both the cloud
 *    puffs (short, fat) and the falling streaks (tall, thin), so the whole
 *    local effect is one more draw call rather than two.
 *
 * Never fakes a feed: no `/api/wind` connection means no particles and
 * `setStatus("wind", { state: "failed" })`, same contract as every other
 * live layer in this world.
 */

// ---------------------------------------------------------------------------
// Wind particles
// ---------------------------------------------------------------------------

const COUNT_BY_TIER: Record<1 | 2 | 3, number> = { 1: 6000, 2: 2000, 3: 0 };
const MAX_PARTICLES = COUNT_BY_TIER[1];
// A trail of 3 remembered positions (oldest, mid, current) drawn as 2
// connected segments (4 vertices: tail, mid, mid-again, head) — "a short
// fading trail" without a second draw call or a custom shader.
const SEGMENTS_PER_PARTICLE = 2;
const VERTS_PER_PARTICLE = SEGMENTS_PER_PARTICLE * 2;
// A hair off the surface so the trail never z-fights the earth mesh/imagery
// tile sitting exactly at GLOBE_RADIUS.
const WIND_RADIUS = GLOBE_RADIUS * 1.004;
// Average particle lifetime ~1/RESPAWN_RATE frames (~11s at 60fps) — keeps
// the field's density even without ever clearing it all at once.
const RESPAWN_RATE = 0.0015;
// A short static dash either side of a particle's fixed point under reduced
// motion, degrees of arc — a streamline, not a length in world units.
const STATIC_STREAM_DEG = 1.4;

// Perceptual, non-brand speed ramp (S8 "ambient things never use brand
// tokens" — wind is ambience, the air, not a claim a visitor reads a number
// off directly): dim slate blue (calm) -> muted teal (moderate) -> pale
// warm sand (fast), each blended toward the scene's own background colour
// at a trail's tail so the fade reads as "disappearing into the sky" rather
// than needing real alpha blending.
const BG_COLOR = new THREE.Color("#05070a");
const CALM_COLOR = new THREE.Color(WIND_LEGEND.stops[0].color);
const MID_COLOR = new THREE.Color(WIND_LEGEND.stops[1].color);
const FAST_COLOR = new THREE.Color(WIND_LEGEND.stops[2].color);
const CALM_SPEED_MS = 2;
const FAST_SPEED_MS = 22;
// Reused scratch objects — the "zero per-frame allocation" rule applies to
// three.js objects specifically (plain-number math is cheap either way).
const _ramp = new THREE.Color();
const _windSample = { u: 0, v: 0 };

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** Speed (m/s) -> the two-stop ramp above, written into `_ramp` (reused). */
function speedRamp(speedMs: number): THREE.Color {
  const t = clamp01((speedMs - CALM_SPEED_MS) / (FAST_SPEED_MS - CALM_SPEED_MS));
  return t < 0.5 ? _ramp.copy(CALM_COLOR).lerp(MID_COLOR, t * 2) : _ramp.copy(MID_COLOR).lerp(FAST_COLOR, (t - 0.5) * 2);
}

/** Writes one vertex's xyz straight into a flat position buffer — no
 *  intermediate Vector3/plain-object allocation (geoMath.ts's own
 *  latLonToXyz returns a fresh object every call, fine at the handful-of-
 *  aircraft counts other layers use it at, too many for a few-thousand
 *  particle trail redrawn every frame). */
function writeXyz(out: Float32Array, offset: number, latDeg: number, lonDeg: number, radius: number): void {
  const lat = latDeg * DEG2RAD;
  const lon = lonDeg * DEG2RAD;
  const cosLat = Math.cos(lat);
  out[offset] = cosLat * Math.cos(lon) * radius;
  out[offset + 1] = Math.sin(lat) * radius;
  out[offset + 2] = -cosLat * Math.sin(lon) * radius;
}

/** Writes one vertex's rgb as `speedRamp(speedMs)` blended `mix` of the way
 *  from the scene background toward the full ramp colour — `mix` near 0 is
 *  the trail's tail (fades into the sky), `mix` 1 is its head. */
function writeFadedColor(out: Float32Array, offset: number, speedMs: number, mix: number): void {
  const ramp = speedRamp(speedMs);
  out[offset] = BG_COLOR.r + (ramp.r - BG_COLOR.r) * mix;
  out[offset + 1] = BG_COLOR.g + (ramp.g - BG_COLOR.g) * mix;
  out[offset + 2] = BG_COLOR.b + (ramp.b - BG_COLOR.b) * mix;
}

interface ParticleState {
  lat0: Float32Array;
  lon0: Float32Array;
  lat1: Float32Array;
  lon1: Float32Array;
  lat2: Float32Array;
  lon2: Float32Array;
  speed: Float32Array;
  positions: Float32Array;
  colors: Float32Array;
  geometry: THREE.BufferGeometry;
}

/** Allocated exactly once (MAX_PARTICLES, the T1 ceiling — LocalTraffic.tsx's
 *  own fixed-InstancedMesh-size pattern) and reused across a tier change; a
 *  tier that shows fewer particles just draws a shorter prefix of the same
 *  buffers (`geometry.setDrawRange`) rather than reallocating. Seeded via
 *  geoMath.ts's deterministic Fibonacci lattice, never `Math.random()` — no
 *  impure call runs during render. */
function createParticleState(): ParticleState {
  const lat0 = new Float32Array(MAX_PARTICLES);
  const lon0 = new Float32Array(MAX_PARTICLES);
  const lat1 = new Float32Array(MAX_PARTICLES);
  const lon1 = new Float32Array(MAX_PARTICLES);
  const lat2 = new Float32Array(MAX_PARTICLES);
  const lon2 = new Float32Array(MAX_PARTICLES);
  const speed = new Float32Array(MAX_PARTICLES);
  const seed = fibonacciLattice(MAX_PARTICLES);
  for (let i = 0; i < MAX_PARTICLES; i++) {
    lat0[i] = lat1[i] = lat2[i] = seed[i].lat;
    lon0[i] = lon1[i] = lon2[i] = seed[i].lon;
  }
  const verts = MAX_PARTICLES * VERTS_PER_PARTICLE;
  const positions = new Float32Array(verts * 3);
  const colors = new Float32Array(verts * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return { lat0, lon0, lat1, lon1, lat2, lon2, speed, positions, colors, geometry };
}

function paintParticle(state: ParticleState, i: number): void {
  const baseP = i * VERTS_PER_PARTICLE * 3;
  const speed = state.speed[i];
  writeXyz(state.positions, baseP + 0, state.lat0[i], state.lon0[i], WIND_RADIUS);
  writeXyz(state.positions, baseP + 3, state.lat1[i], state.lon1[i], WIND_RADIUS);
  writeXyz(state.positions, baseP + 6, state.lat1[i], state.lon1[i], WIND_RADIUS);
  writeXyz(state.positions, baseP + 9, state.lat2[i], state.lon2[i], WIND_RADIUS);
  writeFadedColor(state.colors, baseP + 0, speed, 0.12);
  writeFadedColor(state.colors, baseP + 3, speed, 0.5);
  writeFadedColor(state.colors, baseP + 6, speed, 0.5);
  writeFadedColor(state.colors, baseP + 9, speed, 1);
}

function WindParticles({ field, count, reducedMotion }: { field: WindField; count: number; reducedMotion: boolean }) {
  const lineRef = useRef<THREE.LineSegments>(null);
  // Lazy one-time init (React's own sanctioned "expensive ref" idiom) — the
  // buffers never need to be recreated, only drawn shorter at T2 (below).
  // Never read back out into a render-scope variable (react-hooks/refs):
  // every other access happens inside an effect or useFrame, never during
  // render itself.
  const stateRef = useRef<ParticleState | null>(null);
  if (stateRef.current === null) stateRef.current = createParticleState();

  // Attaches the (never-replaced) geometry imperatively rather than via a
  // `geometry` prop read from a ref during render, and disposes it on
  // unmount — mount-only, since stateRef's identity never changes after its
  // first lazy init above.
  useEffect(() => {
    const state = stateRef.current!;
    if (lineRef.current) lineRef.current.geometry = state.geometry;
    return () => state.geometry.dispose();
  }, []);

  // Reduced motion: paint one static short streamline per particle (through
  // its seeded point, along the local wind direction) and never touch
  // useFrame again — "draw static short streamlines instead of animating".
  useEffect(() => {
    if (!reducedMotion) return;
    const state = stateRef.current!;
    for (let i = 0; i < count; i++) {
      const lat = state.lat1[i];
      const lon = state.lon1[i];
      const w = sampleWind(field, lat, lon, _windSample);
      const speed = windSpeed(w.u, w.v);
      state.speed[i] = speed;
      const mag = Math.max(speed, 1e-3);
      const cosLat = Math.max(Math.cos(lat * DEG2RAD), 0.08);
      const dLat = (w.v / mag) * STATIC_STREAM_DEG;
      const dLon = ((w.u / mag) * STATIC_STREAM_DEG) / cosLat;
      state.lat0[i] = lat - dLat;
      state.lon0[i] = lon - dLon;
      state.lat2[i] = lat + dLat;
      state.lon2[i] = lon + dLon;
      paintParticle(state, i);
    }
    state.geometry.setDrawRange(0, count * VERTS_PER_PARTICLE);
    (state.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (state.geometry.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;
  }, [reducedMotion, field, count]);

  useFrame((_, delta) => {
    if (reducedMotion) return;
    const state = stateRef.current!;
    const dtSec = Math.min(delta, 0.1); // clamp a tab-away catch-up frame
    for (let i = 0; i < count; i++) {
      state.lat0[i] = state.lat1[i];
      state.lon0[i] = state.lon1[i];
      state.lat1[i] = state.lat2[i];
      state.lon1[i] = state.lon2[i];
      if (shouldRespawn(Math.random(), RESPAWN_RATE)) {
        const p = randomSpherePoint(Math.random(), Math.random());
        state.lat0[i] = state.lat1[i] = state.lat2[i] = p.lat;
        state.lon0[i] = state.lon1[i] = state.lon2[i] = p.lon;
        state.speed[i] = 0;
      } else {
        const w = sampleWind(field, state.lat2[i], state.lon2[i], _windSample);
        const next = advectStep(state.lat2[i], state.lon2[i], w.u, w.v, dtSec, VISUAL_SPEED_SCALE);
        state.lat2[i] = next.lat;
        state.lon2[i] = next.lon;
        state.speed[i] = windSpeed(w.u, w.v);
      }
      paintParticle(state, i);
    }
    state.geometry.setDrawRange(0, count * VERTS_PER_PARTICLE);
    (state.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (state.geometry.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;
  });

  return (
    <>
      <lineSegments ref={lineRef} frustumCulled={false}>
        <lineBasicMaterial vertexColors toneMapped={false} transparent opacity={0.85} depthWrite={false} />
      </lineSegments>
      {/* Test-only observation seam (this lane owns this file) — the plan
          asks e2e to confirm particles exist through a seam here rather
          than pixel-peek the canvas. `count` is a plain prop, rendered
          declaratively rather than written imperatively into a ref: drei's
          `<Html>` creates its own DOM portal on its own effect schedule, and
          the very first reduced-motion paint (a single one-shot effect, by
          design — see above) has no second frame to self-heal an imperative
          write that raced ahead of that portal's attachment, unlike the
          continuously-repeating useFrame path below it. */}
      <Html style={{ display: "none" }}>
        <div data-wind-layer data-wind-particle-count={count} aria-hidden />
      </Html>
    </>
  );
}

// ---------------------------------------------------------------------------
// Pune local weather (cloud + rain), one shared InstancedMesh
// ---------------------------------------------------------------------------

const PUNE_POINT = latLonToXyz(PUNE.lat, PUNE.lon);
const PUNE_NORMAL = new THREE.Vector3(PUNE_POINT.x, PUNE_POINT.y, PUNE_POINT.z);
const PUNE_BASE = PUNE_NORMAL.clone().multiplyScalar(GLOBE_RADIUS);
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const EAST_PUNE = new THREE.Vector3().crossVectors(WORLD_UP, PUNE_NORMAL).normalize();
const NORTH_PUNE = new THREE.Vector3().crossVectors(PUNE_NORMAL, EAST_PUNE).normalize();
// Aligns the shared cylinder's local +Y (its long axis) to Pune's radial
// "up" — fixed once, Pune never moves.
const PUNE_QUAT = new THREE.Quaternion().setFromUnitVectors(WORLD_UP, PUNE_NORMAL);

const CLOUD_COUNT = 6;
const RAIN_COUNT = 22;
const TOTAL_INSTANCES = CLOUD_COUNT + RAIN_COUNT;
// A symbolic footprint sized to read at this zoom, like Markers.tsx's own
// RING_RADIUS employer ring — not Pune's literal ~15 km urban extent.
const CITY_RADIUS = 0.16;
const CLOUD_HEIGHT = 0.1;
const RAIN_FALL_SEC = 1.6;
const ZOOM_DISTANCE = 12; // camera.position.length(); GLOBE_RADIUS=6, so this is ~2 radii out
const CLOUD_RAIN_GEOMETRY = new THREE.CylinderGeometry(1, 1, 1, 6);
const CLOUD_COLOR = new THREE.Color("#aab7c4"); // pale grey-blue, ambient (S8)
const RAIN_COLOR = new THREE.Color("#7fa3c0");
const _dummy = new THREE.Object3D();
const _instancePos = new THREE.Vector3();
const _screenPos = new THREE.Vector3();
// Golden-angle index spread (skyStars.tsx/PulseLayer.tsx's own D1 purity
// idiom): a deterministic, evenly-jittered [0,1) sequence with no RNG.
const GOLDEN = 0.6180339887;
function goldenJitter(i: number, salt: number): number {
  const x = i * GOLDEN + salt;
  return x - Math.floor(x);
}

interface ClusterInstance {
  kind: "cloud" | "rain";
  east: number;
  north: number;
  phase: number; // rain fall animation offset, unused for cloud
  scaleXZ: number;
  scaleY: number;
}

function buildCluster(): ClusterInstance[] {
  const instances: ClusterInstance[] = [];
  for (let i = 0; i < CLOUD_COUNT; i++) {
    const angle = (i / CLOUD_COUNT) * Math.PI * 2;
    const r = CITY_RADIUS * (0.35 + 0.5 * goldenJitter(i, 0.11));
    instances.push({ kind: "cloud", east: Math.cos(angle) * r, north: Math.sin(angle) * r, phase: 0, scaleXZ: 0.05 + goldenJitter(i, 0.37) * 0.03, scaleY: 0.025 });
  }
  for (let i = 0; i < RAIN_COUNT; i++) {
    instances.push({
      kind: "rain",
      east: (goldenJitter(i, 0.53) * 2 - 1) * CITY_RADIUS,
      north: (goldenJitter(i, 0.79) * 2 - 1) * CITY_RADIUS,
      phase: goldenJitter(i, 0.17) * RAIN_FALL_SEC,
      scaleXZ: 0.003,
      scaleY: 0.045,
    });
  }
  return instances;
}

function selectPuneWeather(weather: NonNullable<ReturnType<typeof useWeather>["weather"]>, air: ReturnType<typeof useWeather>["air"]): void {
  const rows = [
    { label: "Temperature", value: `${weather.tempC.toFixed(1)} degC` },
    { label: "Condition", value: WMO_LABEL[weather.code] ?? `WMO code ${weather.code}` },
    { label: "Rain rate", value: `${weather.precipMmH.toFixed(1)} mm/h` },
    { label: "Wind", value: `${weather.windKmh.toFixed(0)} km/h from ${weather.windFromDeg} deg` },
  ];
  if (air) rows.push({ label: "Air quality (US AQI)", value: String(Math.round(air.usAqi)) });
  useGlobe.getState().select({
    id: "wind:pune-weather",
    kind: "weather",
    title: "Pune weather",
    rows,
    source: "Open-Meteo via /api/weather, 15 min cache",
    live: true,
    focus: { kind: "latlon", lat: PUNE.lat, lon: PUNE.lon },
  });
}

/** Cloud + falling-streak cluster over Pune, visible only zoomed in while
 *  it's actually raining there — off under reduced motion (falling streaks
 *  are motion) and at tier 2 (the one visual this lane sheds at the phone
 *  tier, the same way LocalTraffic sheds ambient aircraft at T3). */
function PuneWeather({ tier, reducedMotion }: { tier: 1 | 2 | 3; reducedMotion: boolean }) {
  const { weather, air } = useWeather();
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const domRef = useRef<HTMLDivElement>(null);
  const selectedId = useGlobe((s) => (s.selected?.id === "wind:pune-weather" ? s.selected.id : ""));
  const instances = useMemo(() => buildCluster(), []);
  const eligible = tier === 1 && !reducedMotion && (weather?.precipMmH ?? 0) > 0;

  useFrame(({ camera, clock, size }) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const visible = eligible && camera.position.length() < ZOOM_DISTANCE;
    if (domRef.current) {
      domRef.current.dataset.windPuneVisible = String(visible);
      // Test-only observation seam (this lane owns this file), same pattern
      // as GlobeScene.tsx's own subsolar probe: the ACTUAL screen position
      // of a real rendered instance (instances[0], a cloud puff), not the
      // cluster's own abstract centre — PUNE_BASE itself sits at (east 0,
      // north 0), a point no instance is ever placed at (every cloud/rain
      // instance in buildCluster() is offset from it by up to CITY_RADIUS).
      if (visible) {
        const cloud0 = instances[0];
        _screenPos
          .copy(PUNE_BASE)
          .addScaledVector(EAST_PUNE, cloud0.east)
          .addScaledVector(NORTH_PUNE, cloud0.north)
          .addScaledVector(PUNE_NORMAL, CLOUD_HEIGHT)
          .project(camera);
        domRef.current.dataset.windPuneScreenX = String(Math.round((_screenPos.x * 0.5 + 0.5) * size.width));
        domRef.current.dataset.windPuneScreenY = String(Math.round((-_screenPos.y * 0.5 + 0.5) * size.height));
      }
    }
    if (!visible) {
      mesh.count = 0;
      return;
    }
    const t = clock.getElapsedTime();
    for (let i = 0; i < instances.length; i++) {
      const inst = instances[i];
      const height = inst.kind === "cloud" ? CLOUD_HEIGHT : CLOUD_HEIGHT * (1 - ((t + inst.phase) % RAIN_FALL_SEC) / RAIN_FALL_SEC);
      _instancePos
        .copy(PUNE_BASE)
        .addScaledVector(EAST_PUNE, inst.east)
        .addScaledVector(NORTH_PUNE, inst.north)
        .addScaledVector(PUNE_NORMAL, height);
      _dummy.position.copy(_instancePos);
      _dummy.quaternion.copy(PUNE_QUAT);
      _dummy.scale.set(inst.scaleXZ, inst.scaleY, inst.scaleXZ);
      _dummy.updateMatrix();
      mesh.setMatrixAt(i, _dummy.matrix);
      mesh.setColorAt(i, inst.kind === "cloud" ? CLOUD_COLOR : RAIN_COLOR);
    }
    mesh.count = instances.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    // InstancedMesh never computes its own boundingSphere automatically (it
    // starts at the THREE.Sphere default, centre (0,0,0) radius -1, and
    // three.js's InstancedMesh.raycast() early-exits against exactly that
    // stale sphere before testing any instance) — without this call every
    // click on this cluster silently misses, confirmed by comparing a raw
    // THREE.Raycaster against this mesh (0 hits) with the identical ray
    // against a plain THREE.Mesh built from the same instance transform (1
    // hit). Only 28 instances, so recomputing every visible frame is cheap.
    mesh.computeBoundingSphere();
  });

  const onClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      if (!weather) return;
      selectPuneWeather(weather, air);
    },
    [weather, air],
  );

  return (
    <>
      <instancedMesh ref={meshRef} args={[CLOUD_RAIN_GEOMETRY, undefined, TOTAL_INSTANCES]} frustumCulled={false} count={0} onClick={onClick}>
        <meshBasicMaterial toneMapped={false} transparent opacity={0.55} depthWrite={false} />
      </instancedMesh>
      <Html style={{ display: "none" }}>
        <div ref={domRef} data-wind-pune-selected={selectedId} aria-hidden />
      </Html>
    </>
  );
}

// ---------------------------------------------------------------------------

/** WAVE 3 LANE W5 (global wind particles, Pune weather effects) owns this
 *  file. `now` is accepted (GlobeScene passes it to every layer stub) but
 *  unused: wind advection and the rain fall animation both run off
 *  `useFrame`'s own clock/delta, the same "continuous motion, not a
 *  once-a-minute tick" reasoning SatelliteLayer.tsx states for orbits. */
export default function WindLayer({ tier }: { now: Date; tier: 1 | 2 | 3 }) {
  const reducedMotion = useReducedMotion();
  const { data, error } = useLiveSignal<WindResponse>("/api/wind", 30 * 60_000);

  useEffect(() => {
    useGlobe.getState().setStatus("wind", { state: "loading" });
    return () => useGlobe.getState().setStatus("wind", undefined);
  }, []);

  useEffect(() => {
    if (!data) {
      if (error) useGlobe.getState().setStatus("wind", { state: "failed", detail: "Open-Meteo wind feed unreachable" });
      return;
    }
    if (!data.connected || !data.grid) {
      useGlobe.getState().setStatus("wind", { state: "failed", detail: "Open-Meteo wind feed unreachable" });
      return;
    }
    const modelRun = data.modelTime ? `${data.modelTime}Z` : "unknown model run";
    useGlobe.getState().setStatus("wind", { state: data.stale ? "snapshot" : "live", detail: `Open-Meteo 10 m wind, model run ${modelRun}` });
  }, [data, error]);

  const field = useMemo(() => {
    if (!data?.connected || !data.grid) return null;
    return buildWindField(data.grid, data.u, data.v);
  }, [data]);

  const count = COUNT_BY_TIER[tier];

  // "Never fake data": no usable grid draws nothing at all, no synthetic
  // fallback field. Pune's own weather effect is independent of /api/wind,
  // so it still renders (gated by its own /api/weather feed) either way.
  return (
    <>
      {field && count > 0 && <WindParticles field={field} count={count} reducedMotion={reducedMotion} />}
      <PuneWeather tier={tier} reducedMotion={reducedMotion} />
    </>
  );
}
