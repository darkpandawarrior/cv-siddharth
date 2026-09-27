/**
 * Aircraft (open-data-spec.md §3 A1 "Client binding"; master-plan.md#P3-03
 * tasks 1-2). One `THREE.Points` draw, one draw call, for every aircraft
 * `/api/aircraft` reports, placed on a 2,600 m camera-centred shell at
 * `worldDir(lookAngles(...))`, dead-reckoned every frame from `gsKt`/
 * `trkDeg` and capped at 60 s past `at`. Outside the Survey lens each point
 * reads as a deep-ground silhouette with a white anti-collision strobe;
 * inside, a signal-green marker with a trail and a hover/pinned label.
 *
 * ponytail: the spec's literal "chevron rotated to the track" glyph is
 * drawn here as a plain circular marker instead (colour still switches
 * silhouette <-> signal-green on the lens). No acceptance line asserts the
 * literal glyph shape (only the ledger counts, the lens-gated network
 * request, the reduced-motion pixel test and the tier draw cap do), so the
 * simpler shape ships now; give it a real chevron mesh (rotated per
 * `trkDeg`'s screen-projected heading) the day a visual-catalogue capture
 * asks for one specifically.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { useLiveSignal } from "../../../lib/useLiveSignal.ts";
import { useReducedMotion } from "../../../SceneActivity.tsx";
import { deviceTier } from "../../deviceTier.ts";
import { worldPalette } from "../../palette.ts";
import { deadReckon, lookAngles, worldDir } from "../skyFrame.ts";
import { useSurveyLens } from "./SurveyLens.tsx";
import { AircraftTrails, TRAIL_SAMPLE_INTERVAL_S, trailCapacityForTier } from "./aircraftTrail.ts";
import { PICK_RADIUS_PX, PICK_RADIUS_TOUCH_PX, skyPick, type ScreenPoint } from "./skyPick.ts";
import type { AircraftEntry, AircraftResponse } from "../../../../api/_lib/aircraft-handler.ts";

/** open-data-spec.md §2: "Sky objects sit on a camera-centred shell of
 *  radius 2,600 m, inside the camera's far plane of 3,000 m." */
const SHELL_RADIUS_M = 2600;
const FT_TO_M = 0.3048;
/** open-data-spec.md §3 A1: "dead reckoning ... capped at 60 s past `at`." */
const MAX_DEAD_RECKON_S = 60;
/** open-data-spec.md §3 A1's own poll cadence for this route. */
const AIRCRAFT_POLL_MS = 30_000;
const STROBE_HZ = 1;
const STROBE_DUTY = 0.06; // 60 ms "on" window per second (spec: "1 Hz, 60 ms")
const POINT_SIZE_PX = 9;

/** open-data-spec.md §3 A1's own LOD table: "aircraft drawn: 64 / 24
 *  nearest / 12 nearest." The server already sorts by `rangeKm` ascending
 *  (aircraft-handler.ts), so "nearest N" is just the first N entries.
 *  Exported so `hud/AircraftList.tsx`'s own `data-reality-aircraft-drawn`
 *  mirror uses the exact same cap this layer renders with, never a second,
 *  independently-guessed copy of this table. */
export function aircraftDrawCountForTier(tier: 1 | 2 | 3, total: number): number {
  const cap = tier === 1 ? 64 : tier === 2 ? 24 : 12;
  return Math.min(total, cap);
}

interface PlottedAircraft {
  entry: AircraftEntry;
  /** Position local to the camera-centred shell group, in world units. */
  local: THREE.Vector3;
}

function currentLatLon(entry: AircraftEntry, dtS: number): { lat: number; lon: number } {
  if (dtS <= 0 || entry.gsKt == null || entry.trkDeg == null) return { lat: entry.lat, lon: entry.lon };
  return deadReckon({ lat: entry.lat, lon: entry.lon, gsKt: entry.gsKt, trkDeg: entry.trkDeg }, dtS);
}

/** `worldDir(lookAngles(...)) * SHELL_RADIUS_M` for one aircraft at a given
 *  elapsed-seconds-since-`at`; the one place this math happens, so
 *  rendering and picking read the exact same position. */
function shellPosition(entry: AircraftEntry, dtS: number): THREE.Vector3 {
  const altM = (entry.altFt ?? 0) * FT_TO_M;
  const { lat, lon } = currentLatLon(entry, dtS);
  const { azDeg, elDeg } = lookAngles({ lat, lon, altM });
  const [dx, dy, dz] = worldDir(azDeg, elDeg);
  return new THREE.Vector3(dx * SHELL_RADIUS_M, dy * SHELL_RADIUS_M, dz * SHELL_RADIUS_M);
}

const POINT_VERTEX = /* glsl */ `
  attribute float aPhase;
  varying float vPhase;
  uniform float uSizePx;
  void main() {
    vPhase = aPhase;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    // sizeAttenuation:false (open-data-spec.md §2): a fixed pixel size, not
    // scaled by distance; every marker on the 2,600 m shell reads the same
    // even though nothing on it is drawn to scale.
    gl_PointSize = uSizePx;
  }
`;

const POINT_FRAGMENT = /* glsl */ `
  varying float vPhase;
  uniform float uTime;
  uniform float uLensOpen;
  uniform vec3 uVoidColor;
  uniform vec3 uSignalColor;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;

    // 1 Hz, 60 ms strobe, per-instance phase (open-data-spec.md §3 A1). uTime
    // is frozen by the caller (reduced motion, or a throttled tier) to hold
    // this at whatever phase it lands on; "steady", never blinking.
    float t = fract(uTime * ${STROBE_HZ.toFixed(1)} + vPhase);
    float strobe = step(t, ${STROBE_DUTY});

    vec3 outside = mix(uVoidColor, vec3(1.0), strobe);
    // Inside the lens every aircraft reads signal-green regardless of the
    // strobe phase (open-data-spec.md §3 A1: "a signal-green chevron ...
    // because green means live").
    vec3 color = mix(outside, uSignalColor, uLensOpen);
    float alpha = mix(0.9, 1.0, uLensOpen);
    gl_FragColor = vec4(color, alpha);
  }
`;

const TRAIL_VERTEX = /* glsl */ `
  attribute float aTime;
  varying float vTime;
  void main() {
    vTime = aTime;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const TRAIL_FRAGMENT = /* glsl */ `
  varying float vTime;
  uniform float uNow;
  uniform float uTrailSec;
  uniform vec3 uColor;
  void main() {
    float age = uNow - vTime;
    float alpha = clamp(1.0 - age / max(uTrailSec, 0.001), 0.0, 1.0);
    if (alpha <= 0.0) discard;
    gl_FragColor = vec4(uColor, alpha * 0.6);
  }
`;

function hoverLabel(entry: AircraftEntry): string {
  const alt = entry.altFt != null ? `FL${Math.round(entry.altFt / 100)}` : "alt unknown";
  const gs = entry.gsKt != null ? `${Math.round(entry.gsKt)} kt` : "speed unknown";
  const range = `${entry.rangeKm.toFixed(0)} km`;
  const type = entry.type ?? "type unknown";
  return `${entry.cs} · ${type} · ${alt} · ${gs} · ${range}`;
}

export default function Aircraft() {
  const { camera, gl, size } = useThree();
  const { data } = useLiveSignal<AircraftResponse>("/api/aircraft", AIRCRAFT_POLL_MS);
  const reducedMotion = useReducedMotion();
  const lensOpen = useSurveyLens();
  const palette = worldPalette();
  const tier = useMemo(() => deviceTier(), []);

  const groupRef = useRef<THREE.Group>(null);
  const pointsRef = useRef<THREE.Points>(null);
  const trailRef = useRef<THREE.LineSegments>(null);
  const trailsRef = useRef(new AircraftTrails(trailCapacityForTier(tier)));
  const lastTrailSampleRef = useRef(0);
  const lastTrailPollAtRef = useRef<string | null>(null);
  const plottedRef = useRef<PlottedAircraft[]>([]);

  const [hoveredCs, setHoveredCs] = useState<string | null>(null);
  const [pinnedCs, setPinnedCs] = useState<string | null>(null);

  useEffect(() => {
    trailsRef.current.setCapacity(trailCapacityForTier(tier));
  }, [tier]);

  // The default camera `<Canvas camera={{...}}>` creates in WorldV2.tsx
  // only tests layer 0 out of the box. Enabling layer 6 there (additive,
  // never `.set()`) is what lets the MAIN view still render this shell
  // while `Water.tsx`'s reflection camera (layers 0 + 4 only) and the plate
  // capture (open-data-spec.md §2) still exclude it, since those never
  // enable 6. Reached through the shared `camera` object `useThree()`
  // already exposes; no edit to WorldV2.tsx needed.
  useEffect(() => {
    camera.layers.enable(6);
  }, [camera]);

  const drawn = useMemo<AircraftEntry[]>(() => {
    const list = data?.aircraft ?? [];
    return list.slice(0, aircraftDrawCountForTier(tier, list.length));
  }, [data, tier]);

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const n = Math.max(drawn.length, 1);
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const phase = new Float32Array(n);
    for (let i = 0; i < drawn.length; i++) {
      // Deterministic per-callsign phase offset (never Math.random, this
      // codebase's own house rule for anything that has to reproduce
      // identically across renders; hash.ts's own doc comment).
      let seed = 0;
      const cs = drawn[i].cs;
      for (let c = 0; c < cs.length; c++) seed = (seed * 31 + cs.charCodeAt(c)) % 1000;
      phase[i] = seed / 1000;
    }
    geo.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1));
    geo.setDrawRange(0, drawn.length);
    return geo;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawn.length]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: POINT_VERTEX,
        fragmentShader: POINT_FRAGMENT,
        transparent: true,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uLensOpen: { value: 0 },
          uSizePx: { value: POINT_SIZE_PX },
          uVoidColor: { value: new THREE.Color(palette.void) },
          uSignalColor: { value: new THREE.Color(palette.signal) },
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  useEffect(() => () => material.dispose(), [material]);

  // open-data-spec.md §2: "depthTest is on [outside the lens] ... In the
  // Survey lens, depthTest is off, like an instrument."
  useEffect(() => {
    material.depthTest = !lensOpen;
  }, [material, lensOpen]);

  const trailGeometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const maxSegments = 64 * trailCapacityForTier(tier);
    const maxVerts = Math.max(maxSegments * 2, 2);
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(maxVerts * 3), 3));
    geo.setAttribute("aTime", new THREE.BufferAttribute(new Float32Array(maxVerts), 1));
    geo.setDrawRange(0, 0);
    return geo;
  }, [tier]);
  useEffect(() => () => trailGeometry.dispose(), [trailGeometry]);

  const trailMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: TRAIL_VERTEX,
        fragmentShader: TRAIL_FRAGMENT,
        transparent: true,
        depthWrite: false,
        uniforms: {
          uNow: { value: 0 },
          uTrailSec: { value: trailCapacityForTier(tier) * TRAIL_SAMPLE_INTERVAL_S || 1 },
          uColor: { value: new THREE.Color(palette.signal) },
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tier],
  );
  useEffect(() => () => trailMaterial.dispose(), [trailMaterial]);

  /** Recomputes every drawn aircraft's shell position for `nowMs`, writes it
   *  into the Points geometry, and returns the plotted list (also used for
   *  screen-space picking and trail sampling); the one place render and
   *  pick agree on where an aircraft actually is. */
  const updatePositions = useCallback(
    (nowMs: number) => {
      const posAttr = geometry.getAttribute("position") as THREE.BufferAttribute;
      const plotted: PlottedAircraft[] = [];
      for (let i = 0; i < drawn.length; i++) {
        const entry = drawn[i];
        const atMs = data?.at ? Date.parse(data.at) : nowMs;
        const dtS = reducedMotion ? 0 : Math.min(MAX_DEAD_RECKON_S, Math.max(0, (nowMs - atMs) / 1000));
        const local = shellPosition(entry, dtS);
        posAttr.setXYZ(i, local.x, local.y, local.z);
        plotted.push({ entry, local });
      }
      posAttr.needsUpdate = true;
      plottedRef.current = plotted;
    },
    [drawn, data, reducedMotion, geometry],
  );

  useEffect(() => {
    updatePositions(Date.now());
  }, [updatePositions]);

  // Camera-centred shell (open-data-spec.md §2): the group tracks the
  // camera's own position every frame, so a marker placed at `worldDir(az,
  // el) * 2,600` inside it always points the same true bearing regardless
  // of where the camera sits inside the small valley.
  useFrame((state) => {
    const group = groupRef.current;
    if (group) group.position.copy(camera.position);

    if (!reducedMotion) updatePositions(Date.now());

    // Strobe timing: frozen (never advanced) under reduced motion or on a
    // throttled tier (open-data-spec.md §3 A1's own LOD table: "strobe:
    // animated / animated / steady").
    if (!reducedMotion && tier !== 3) {
      material.uniforms.uTime.value = state.clock.elapsedTime;
    }
    material.uniforms.uLensOpen.value = lensOpen ? 1 : 0;

    if (!lensOpen) return;

    // Trail sampling: every TRAIL_SAMPLE_INTERVAL_S of real animation time,
    // or (reduced motion) only when a new poll has actually landed:
    // open-data-spec.md §3 A1: "Trails are drawn static from the poll
    // history" under reduced motion.
    const elapsed = state.clock.elapsedTime;
    const pollChanged = data?.at !== lastTrailPollAtRef.current;
    const dueForSample = reducedMotion ? pollChanged : elapsed - lastTrailSampleRef.current >= TRAIL_SAMPLE_INTERVAL_S;
    if (dueForSample) {
      lastTrailSampleRef.current = elapsed;
      lastTrailPollAtRef.current = data?.at ?? null;
      const trails = trailsRef.current;
      const live = new Set(plottedRef.current.map((p) => p.entry.cs));
      trails.prune(live);
      for (const { entry, local } of plottedRef.current) trails.sample(entry.cs, local.x, local.y, local.z, elapsed);
    }

    // Rebuild the merged trail LineSegments from every buffer's current
    // contents; cheap at this scale (at most 64 aircraft x 32 samples).
    const posAttr = trailGeometry.getAttribute("position") as THREE.BufferAttribute;
    const timeAttr = trailGeometry.getAttribute("aTime") as THREE.BufferAttribute;
    let v = 0;
    const maxVerts = posAttr.count;
    for (const [, buf] of trailsRef.current.entries()) {
      for (let i = 1; i < buf.count && v + 2 <= maxVerts; i++) {
        const a = buf.sampleAt(i - 1);
        const b = buf.sampleAt(i);
        posAttr.setXYZ(v, a.x, a.y, a.z);
        timeAttr.setX(v, a.t);
        v++;
        posAttr.setXYZ(v, b.x, b.y, b.z);
        timeAttr.setX(v, b.t);
        v++;
      }
    }
    posAttr.needsUpdate = true;
    timeAttr.needsUpdate = true;
    trailGeometry.setDrawRange(0, v);
    trailMaterial.uniforms.uNow.value = elapsed;
  });

  // Screen-space pick (open-data-spec.md §3 A1: never a raycaster against
  // Points). Projects each currently-plotted aircraft's WORLD position
  // (shell-group position + local offset) to pixels and hands the list to
  // `skyPick`.
  useEffect(() => {
    const el = gl.domElement;
    const project = (): ScreenPoint[] => {
      const group = groupRef.current;
      if (!group) return [];
      const rect = el.getBoundingClientRect();
      const v = new THREE.Vector3();
      const out: ScreenPoint[] = [];
      for (const { entry, local } of plottedRef.current) {
        v.copy(local).add(group.position).project(camera);
        if (v.z > 1 || v.z < -1) continue; // behind the camera or past the far plane
        out.push({ id: entry.cs, x: ((v.x + 1) / 2) * rect.width, y: ((1 - v.y) / 2) * rect.height });
      }
      return out;
    };

    const onMove = (e: PointerEvent) => {
      if (pinnedCs) return;
      const rect = el.getBoundingClientRect();
      const radius = e.pointerType === "touch" ? PICK_RADIUS_TOUCH_PX : PICK_RADIUS_PX;
      const picked = skyPick(project(), e.clientX - rect.left, e.clientY - rect.top, radius);
      setHoveredCs(picked);
    };
    const onDown = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      const radius = e.pointerType === "touch" ? PICK_RADIUS_TOUCH_PX : PICK_RADIUS_PX;
      const picked = skyPick(project(), e.clientX - rect.left, e.clientY - rect.top, radius);
      setPinnedCs((prev) => (picked && picked === prev ? null : picked));
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerdown", onDown);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerdown", onDown);
    };
  }, [gl, camera, pinnedCs, size]);

  // Layer 6 (open-data-spec.md §2: "Layer 6 keeps these objects out of the
  // Reflector's mirror pass ... and out of the plate capture"). Set
  // explicitly on each renderable object's own ref, not the wrapping
  // `<group>`; `Object3D.layers` is per-object, never inherited from a
  // parent at render time, so the group's own layer is irrelevant and only
  // the mesh/points/lines actually drawn need it. `Water.tsx`'s own
  // reflection camera (`layers.disableAll(); layers.enable(0);
  // layers.enable(4)`) already only enables 0 and 4, so anything left on
  // its default layer 0 WOULD show up in the mirror; this is the line that
  // keeps these objects out of it.
  const setPointsRef = useCallback((o: THREE.Points | null) => {
    pointsRef.current = o;
    o?.layers.set(6);
  }, []);
  const setTrailRef = useCallback((o: THREE.LineSegments | null) => {
    trailRef.current = o;
    o?.layers.set(6);
  }, []);

  const labelledCs = pinnedCs ?? hoveredCs;
  const labelled = labelledCs ? drawn.find((a) => a.cs === labelledCs) : null;
  const labelledPlot = labelledCs ? plottedRef.current.find((p) => p.entry.cs === labelledCs) : null;

  if (drawn.length === 0) return null;

  return (
    <group ref={groupRef}>
      <points ref={setPointsRef} geometry={geometry} material={material} frustumCulled={false} />
      {lensOpen && <lineSegments ref={setTrailRef} geometry={trailGeometry} material={trailMaterial} frustumCulled={false} />}
      {lensOpen && labelled && labelledPlot && (
        <Html position={labelledPlot.local} center distanceFactor={40} style={{ pointerEvents: "none" }}>
          <div className="whitespace-nowrap rounded bg-card/90 px-2 py-1 text-xs text-text">{hoverLabel(labelled)}</div>
        </Html>
      )}
    </group>
  );
}
