import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { MotionPathControls, useMotion } from "@react-three/drei";
import hullProfile from "./hullProfile.json" with { type: "json" };
import { applyWaterline } from "./waterline.glsl.ts";
import type { WaterUniforms, WaterWaveUniformName } from "./waterShader.glsl.ts";
import { riverSpline, valleyZ } from "./valley.ts";
import { spawnState, step, type HodiInput, type HodiState } from "./driveSpline.ts";
import { input } from "../input.ts";
import { prefersReducedMotion } from "../reducedMotion.ts";
import { useReducedMotion } from "../../SceneActivity.tsx";

/**
 * THE HODI — world-v2-spec.md §4 "Route and camera". Drives `driveSpline.ts`
 * off the shared `input.ts` stick, renders the hull (waterline-striped via
 * `waterline.glsl.ts`), rides `drei`'s `MotionPathControls` along the real
 * river spline during idle-drift (C1, visual-catalogue.md), and runs the
 * drag-to-orbit chase camera as its own separate layer on top.
 */

// ── C1: SpawnFlyIn constants, named at the top of this file (this lane's own
// task list, not v1's SpawnFlyIn.tsx — see the module doc below) ───────────

/** world-v2-spec §4 "Fly-in": "descends from 60 m over the east ridge... in
 *  3.2 s." */
const FLY_IN_HEIGHT = 60;
const FLY_IN_DURATION_S = 3.2;
/** Smoothstep — eases in and out rather than a linear slide. */
const FLY_IN_EASE = (t: number): number => t * t * (3 - 2 * t);

// ── Camera (world-v2-spec §4 "Camera" / "Look") ─────────────────────────────

const CAMERA_FOV = 46;
const CAMERA_NEAR = 0.3;
const CAMERA_FAR = 3000;
const CHASE_BACK = 5.5;
const CHASE_UP = 1.9;
const CHASE_LOOKAHEAD = 30;
/** How fast the camera eases toward its target pose each frame — a rate,
 *  not a fixed lerp factor, so it reads the same at any frame rate. */
const CAMERA_EASE_RATE = 8;

const ORBIT_YAW_MAX = THREE.MathUtils.degToRad(70);
const ORBIT_PITCH_MIN = THREE.MathUtils.degToRad(-10);
const ORBIT_PITCH_MAX = THREE.MathUtils.degToRad(35);
const ORBIT_DRAG_SENSITIVITY = 0.006; // rad per pixel dragged
/** Spring-back rate once the drag releases (world-v2-spec §4: "On release
 *  it springs back behind the boat"). */
const ORBIT_SPRING_BACK_RATE = 4;

const WATER_Y = 0;
const DEFAULT_SPAWN_Z = valleyZ("2023-02"); // world-v2-spec §4's spawn-shot z

const HULL_LENGTH: number = hullProfile.length;
const HULL_MAX_HALF_BEAM: number = Math.max(...hullProfile.samples.map(([, halfBeam]) => halfBeam));
/** Where the oar dips — just off the starboard beam, amidships. */
const OAR_BEAM_OFFSET = HULL_MAX_HALF_BEAM + 0.3;

/** Idle-drift's own look-ahead fraction of the spline's total length, for
 *  MotionPathControls' `focus` — how far ahead the hull orients itself while
 *  the world drives it. */
const AUTOPILOT_FOCUS_LEAD = 0.01;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);

export interface HodiProps {
  /** Shared with `Water.tsx` so the water shader's hull-wake and oar-ring
   *  terms track the boat this component actually drives — optional until a
   *  later integration lane mounts both under one scene. */
  waterUniforms?: Pick<WaterUniforms, "uHodiPos" | "uHodiHeading" | "uOarPos">;
  /** Shared wave/swell uniforms — the SAME object `Water.tsx` uses, so the
   *  hull's waterline stripe (visual-catalogue.md W1) moves with the actual
   *  swell rather than a second, independent clock. */
  waveUniforms?: Partial<Record<WaterWaveUniformName, THREE.IUniform<number>>>;
  spawnZ?: number;
}

/** Pushes the live driveSpline progress into MotionPathControls' own motion
 *  state every frame — mounted permanently (not remounted when autopilot
 *  toggles), so the curve's internal damped offset stays continuous and
 *  never has to catch up from a stale position when autopilot re-engages
 *  (see the module-level ponytail note on `motionTargetRef` below). */
function AutopilotProgressDriver({
  hodiStateRef,
  zStart,
  zSpan,
}: {
  hodiStateRef: React.RefObject<HodiState>;
  zStart: number;
  zSpan: number;
}) {
  const motion = useMotion();
  useFrame(() => {
    motion.current = clamp01((hodiStateRef.current.z - zStart) / zSpan);
  });
  return null;
}

export function Hodi({ waterUniforms, waveUniforms, spawnZ }: HodiProps) {
  const { camera, gl } = useThree();
  const reducedMotionLive = useReducedMotion();

  const hodiStateRef = useRef<HodiState>(spawnState(spawnZ ?? DEFAULT_SPAWN_Z));

  const groupRef = useRef<THREE.Group>(null!);
  // The permanent ghost MotionPathControls "moves" while a human is driving
  // — object.current gets redirected to the real hull group only while
  // autopilot owns the axes, matching input.ts's own "auto is EXCLUSIVE"
  // doctrine for the render target instead of just the input axes.
  const ghostRef = useRef<THREE.Object3D>(new THREE.Object3D());
  const motionObjectRef = useRef<THREE.Object3D>(ghostRef.current);
  const focusObjectRef = useRef<THREE.Object3D>(new THREE.Object3D());

  const hullMaterial = useMemo(
    () => applyWaterline(new THREE.MeshStandardMaterial({ color: "#5a4632", roughness: 0.85 }), waveUniforms ?? {}),
    [waveUniforms],
  );
  useEffect(() => () => hullMaterial.dispose(), [hullMaterial]);

  const splinePoints = useMemo(() => riverSpline().map((p) => new THREE.Vector3(p.x, WATER_Y, p.z)), []);
  const curve = useMemo(() => new THREE.CatmullRomCurve3(splinePoints, false, "centripetal"), [splinePoints]);
  const zStart = splinePoints[0]?.z ?? 0;
  const zSpan = Math.max(1, (splinePoints[splinePoints.length - 1]?.z ?? zStart + 1) - zStart);

  // world-v2-spec §4: "Camera: PerspectiveCamera(fov 46, near 0.3, far
  // 3000)" — adjusted on the existing camera (World.tsx/Playground owns
  // creating it), the same pattern SpawnFlyIn.tsx uses.
  useEffect(() => {
    if ("fov" in camera) {
      const persp = camera as THREE.PerspectiveCamera;
      persp.fov = CAMERA_FOV;
      persp.near = CAMERA_NEAR;
      persp.far = CAMERA_FAR;
      persp.updateProjectionMatrix();
    }
  }, [camera]);

  // Drag-to-orbit (world-v2-spec §4 "Look") — a layer entirely separate from
  // MotionPathControls, as C1's own task line requires.
  const orbitYaw = useRef(0);
  const orbitPitch = useRef(0);
  const dragging = useRef(false);
  const lastPointer = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const dom = gl.domElement;
    const onDown = (e: PointerEvent) => {
      dragging.current = true;
      lastPointer.current = { x: e.clientX, y: e.clientY };
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging.current) return;
      const dx = e.clientX - lastPointer.current.x;
      const dy = e.clientY - lastPointer.current.y;
      lastPointer.current = { x: e.clientX, y: e.clientY };
      orbitYaw.current = clamp(orbitYaw.current - dx * ORBIT_DRAG_SENSITIVITY, -ORBIT_YAW_MAX, ORBIT_YAW_MAX);
      orbitPitch.current = clamp(orbitPitch.current - dy * ORBIT_DRAG_SENSITIVITY, ORBIT_PITCH_MIN, ORBIT_PITCH_MAX);
    };
    const onUp = () => {
      dragging.current = false;
    };
    dom.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      dom.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [gl]);

  const flyIn = useRef({ elapsed: 0, done: prefersReducedMotion() });
  const camTarget = useRef(new THREE.Vector3());
  const lookTarget = useRef(new THREE.Vector3());

  useFrame((_state, rawDelta) => {
    const dt = Math.min(rawDelta, 1 / 20);
    const reduced = reducedMotionLive;

    const axes: HodiInput = { steer: input.steer, throttle: input.throttle };
    const next = step(hodiStateRef.current, axes, dt, { reducedMotion: reduced });
    hodiStateRef.current = next;
    motionObjectRef.current = next.autopilot ? groupRef.current : ghostRef.current;

    // Manual driving positions the hull directly (lateral offset included);
    // autopilot leaves it to MotionPathControls via motionObjectRef above.
    if (!next.autopilot && groupRef.current) {
      groupRef.current.position.set(next.x, WATER_Y, next.z);
      groupRef.current.rotation.y = next.heading;
    }
    const lookAheadZ = clamp01((next.z - zStart) / zSpan + AUTOPILOT_FOCUS_LEAD);
    curve.getPointAt(lookAheadZ, focusObjectRef.current.position);
    // focusObjectRef is never mounted into the scene graph (it exists only
    // to hand MotionPathControls' dampLookAt a moving point), so nothing
    // else ever calls updateMatrixWorld() on it — without this, its
    // matrixWorld stays frozen at identity and getWorldPosition() would
    // always read back (0,0,0) instead of the point just set above.
    focusObjectRef.current.updateMatrixWorld();

    if (waterUniforms) {
      waterUniforms.uHodiPos.value.set(next.x, next.z);
      waterUniforms.uHodiHeading.value = next.heading;
      const oarX = next.x + Math.cos(next.heading) * OAR_BEAM_OFFSET;
      const oarZ = next.z - Math.sin(next.heading) * OAR_BEAM_OFFSET;
      waterUniforms.uOarPos.value.set(oarX, oarZ);
    }

    const boatPos = groupRef.current?.position ?? new THREE.Vector3(next.x, WATER_Y, next.z);
    const boatHeading = groupRef.current?.rotation.y ?? next.heading;

    // world-v2-spec §4 "Fly-in": a held-then-eased descent before the chase
    // camera takes over; a cut (skipped outright) under reduced motion.
    if (!flyIn.current.done) {
      flyIn.current.elapsed += dt;
      const t = clamp01(flyIn.current.elapsed / FLY_IN_DURATION_S);
      const eased = FLY_IN_EASE(t);
      const highVantage = new THREE.Vector3(boatPos.x + 30, boatPos.y + FLY_IN_HEIGHT, boatPos.z - 40);
      const chasePose = new THREE.Vector3(
        boatPos.x - Math.sin(boatHeading) * CHASE_BACK,
        boatPos.y + CHASE_UP,
        boatPos.z - Math.cos(boatHeading) * CHASE_BACK,
      );
      camera.position.lerpVectors(highVantage, chasePose, eased);
      camera.lookAt(boatPos.x, boatPos.y + 1, boatPos.z);
      if (t >= 1) flyIn.current.done = true;
      return;
    }

    if (!dragging.current) {
      const springT = 1 - Math.exp(-ORBIT_SPRING_BACK_RATE * dt);
      orbitYaw.current += (0 - orbitYaw.current) * springT;
      orbitPitch.current += (0 - orbitPitch.current) * springT;
    }

    const yaw = boatHeading + orbitYaw.current;
    const pitch = orbitPitch.current;
    const backXZ = Math.cos(pitch) * CHASE_BACK;
    camTarget.current.set(
      boatPos.x - Math.sin(yaw) * backXZ,
      boatPos.y + CHASE_UP + Math.sin(pitch) * CHASE_BACK,
      boatPos.z - Math.cos(yaw) * backXZ,
    );
    const easeT = 1 - Math.exp(-CAMERA_EASE_RATE * dt);
    camera.position.lerp(camTarget.current, easeT);

    lookTarget.current.set(
      boatPos.x + Math.sin(boatHeading) * CHASE_LOOKAHEAD,
      boatPos.y + 1,
      boatPos.z + Math.cos(boatHeading) * CHASE_LOOKAHEAD,
    );
    camera.lookAt(lookTarget.current);
  });

  return (
    <group>
      <MotionPathControls
        curves={[curve]}
        object={motionObjectRef}
        focus={focusObjectRef}
        loop={false}
        damping={0.25}
        focusDamping={0.2}
      >
        <AutopilotProgressDriver hodiStateRef={hodiStateRef} zStart={zStart} zSpan={zSpan} />
      </MotionPathControls>
      <group ref={groupRef}>
        <mesh material={hullMaterial} position={[0, 0.25, 0]}>
          <boxGeometry args={[HULL_MAX_HALF_BEAM * 2, 0.5, HULL_LENGTH]} />
        </mesh>
        <mesh material={hullMaterial} position={[0, 0.7, -HULL_LENGTH * 0.1]}>
          <boxGeometry args={[HULL_MAX_HALF_BEAM * 1.2, 0.5, HULL_LENGTH * 0.45]} />
        </mesh>
      </group>
    </group>
  );
}
