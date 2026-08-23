import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { RoundedBox } from "@react-three/drei";
import { step, spawnState, type DriveEnv, type DriveState } from "./drive.ts";
import { heightAt, slopeAt } from "./heightfield.ts";
import { worldObstacles } from "./obstacles.ts";
import { SPAWN_POSITION, WORLD_BOUNDS, CHASSIS_RESTING_HEIGHT } from "./craftPhysics.ts";
import { input, isCaptured, isInteractiveTarget } from "./input.ts";
import { telemetry } from "./telemetry.ts";
import { worldPalette } from "./palette.ts";
import { playBoost, playImpact, updateEngine } from "./audio.ts";

/**
 * The one car, kinematic. Replaces Craft.tsx's `DynamicRayCastVehicleController`
 * with drive.ts's pure `step()` — see that file's block comment for why: a
 * dynamic rigid body meeting a tall static collider at speed resolves its
 * penetration explosively, and no amount of retuning fixed it because the
 * defect was structural to the physics choice, not a bad constant.
 *
 * This component owns none of the driving model. Its job is the same as
 * Craft.tsx's always was: turn `drive.ts`'s per-frame state into a chase
 * camera, spinning/steering wheel visuals, the audio calls and the telemetry
 * writes the HUD reads — plus `props.onState`, whose contract (`{ position:
 * [x,y,z] }`, called every frame) World.tsx depends on unchanged.
 */

// Chassis half-extents (metres) — unchanged from Craft.tsx: a toy car, ~1.1m
// wide, 0.6m tall, 1.9m long, matching worldData.ts's desk-scale primitives.
const HALF = { x: 0.55, y: 0.3, z: 0.95 };

// Wheel layout, in the chassis's local frame — identical to Craft.tsx's.
// Front is +Z because forward is +Z; the leading pair steers, the trailing
// pair only spins (there is no separate "driven" distinction to visualise
// any more — every wheel just rolls at the car's own speed).
const TRACK_X = 0.62;
const AXLE_FRONT_Z = 0.82;
const AXLE_REAR_Z = -0.82;
const WHEEL_RADIUS = 0.3;

type WheelDef = { x: number; z: number; steer: boolean };
const WHEELS: WheelDef[] = [
  { x: -TRACK_X, z: AXLE_FRONT_Z, steer: true },
  { x: TRACK_X, z: AXLE_FRONT_Z, steer: true },
  { x: -TRACK_X, z: AXLE_REAR_Z, steer: false },
  { x: TRACK_X, z: AXLE_REAR_Z, steer: false },
];

// Steer visual only — drive.ts's own STEER_RATE governs the car's actual
// turning. -1: the same sign flip Craft.tsx's STEER_SIGN carried, verified by
// driving rather than derived (see that file's own comment on the trap).
const MAX_STEER_RAD = 0.6;
const STEER_SIGN = -1;

// Chase camera — unchanged from Craft.tsx.
const CAMERA_BASE_DISTANCE = 6.2;
const CAMERA_SPEED_PULLBACK = 0.16;
const CAMERA_HEIGHT = 1.7;
const CAMERA_LOOK_HEIGHT = 0.6;
const CAMERA_FOLLOW_SPEED = 4;
const CAMERA_BASE_FOV = 55; // matches World.tsx's <Canvas camera={{ fov }}>
const CAMERA_FOV_SPREAD = 14;

// Boost — a tank that drains while held and refills while not, same shape as
// Craft.tsx's. drive.ts only takes a bool; the tank bookkeeping (whether
// there's any left to spend) still belongs to the component reading input,
// same as it always did.
const BOOST_DRAIN_PER_S = 0.35; // full tank ≈ 3s of boost
const BOOST_RECHARGE_PER_S = 0.22; // ~4.5s from empty to full

// How long the car may sit pinned against an obstacle with the throttle down
// before it's recovered — drive.ts's collisions can never launch the car, but
// they can still park it nose-first against a wall it can't climb. Shorter
// than Craft.tsx's 3000ms flip+beach pair collapsed into one: there is no
// flip state left to time separately.
const BEACHED_RESPAWN_MS = 3000;

export function Vehicle(props: {
  onState: (s: { position: [number, number, number] }) => void;
  paused: boolean;
}) {
  const c = worldPalette();
  const { camera } = useThree();

  const env = useMemo<DriveEnv>(
    () => ({
      obstacles: worldObstacles(),
      heightAt,
      bounds: WORLD_BOUNDS,
    }),
    [],
  );
  const stateRef = useRef<DriveState>(spawnState(SPAWN_POSITION[0], SPAWN_POSITION[2], env));

  const groupRef = useRef<THREE.Group>(null);
  const boostRef = useRef(1);
  const boostingRef = useRef(false);
  const boostSoundRef = useRef(false);
  const beachedMsRef = useRef(0);
  const wheelSpinAngleRef = useRef(0);
  const respawnRequestedRef = useRef(false);

  const wheelYawRefs = useRef<(THREE.Group | null)[]>([null, null, null, null]);
  const wheelSpinRefs = useRef<(THREE.Group | null)[]>([null, null, null, null]);

  // Scratch objects reused every frame — same GC-pressure rationale as
  // Craft.tsx's own scratch object.
  const scratch = useMemo(
    () => ({
      normal: new THREE.Vector3(),
      forwardFlat: new THREE.Vector3(),
      right: new THREE.Vector3(),
      forward: new THREE.Vector3(),
      basis: new THREE.Matrix4(),
      quat: new THREE.Quaternion(),
      camTarget: new THREE.Vector3(),
      lookTarget: new THREE.Vector3(),
      state: { position: [0, 0, 0] as [number, number, number] },
    }),
    [],
  );

  // Same manual-recovery escape hatch as Craft.tsx: press R to respawn.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "r" || !isCaptured() || isInteractiveTarget(e.target)) return;
      respawnRequestedRef.current = true;
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useFrame((_, delta) => {
    if (props.paused) return; // "stops integrating" — World.tsx's Physics(paused) equivalent

    const manualRespawn = respawnRequestedRef.current;
    respawnRequestedRef.current = false;

    let s = stateRef.current;
    const beforeSpeed = Math.abs(s.speed);

    if (manualRespawn || beachedMsRef.current > BEACHED_RESPAWN_MS) {
      s = spawnState(SPAWN_POSITION[0], SPAWN_POSITION[2], env);
      beachedMsRef.current = 0;
    } else {
      const wantsBoost = input.boost && boostRef.current > 0 && input.throttle > 0;
      boostRef.current = Math.max(
        0,
        Math.min(1, boostRef.current + (wantsBoost ? -BOOST_DRAIN_PER_S : BOOST_RECHARGE_PER_S) * delta),
      );
      boostingRef.current = wantsBoost;

      s = step(s, { steer: input.steer, throttle: input.throttle, boost: wantsBoost }, delta, env);

      const tryingToMove = Math.abs(input.throttle) > 0.2;
      const goingNowhere = tryingToMove && Math.abs(s.speed) < 0.8;
      beachedMsRef.current = goingNowhere ? beachedMsRef.current + delta * 1000 : 0;
    }
    stateRef.current = s;

    telemetry.stuck = beachedMsRef.current > 1200;

    // Sound, driven from the same values the model just produced — never
    // able to disagree with what the car is actually doing.
    updateEngine(s.speed, false);
    if (boostingRef.current && !boostSoundRef.current) playBoost();
    boostSoundRef.current = boostingRef.current;
    // A collision resolves as a sharp drop in speed this frame — the honest
    // replacement for Craft.tsx's grounded-landing/impact heuristic, since
    // there is no airborne state left to distinguish it from.
    const speedDrop = beforeSpeed - Math.abs(s.speed);
    if (speedDrop > 4) playImpact(Math.min(1, speedDrop / 14));

    // Orient to the slope under the wheels: build a basis whose up axis is
    // the terrain normal at this point and whose forward axis is the car's
    // own heading projected onto that plane, so the car banks and pitches
    // with the ground instead of floating flat above it.
    const slope = slopeAt(s.x, s.z);
    scratch.normal.set(-slope.dx, 1, -slope.dz).normalize();
    scratch.forwardFlat.set(Math.sin(s.heading), 0, Math.cos(s.heading));
    scratch.right.crossVectors(scratch.normal, scratch.forwardFlat).normalize();
    scratch.forward.crossVectors(scratch.right, scratch.normal).normalize();
    scratch.basis.makeBasis(scratch.right, scratch.normal, scratch.forward);
    scratch.quat.setFromRotationMatrix(scratch.basis);

    const group = groupRef.current;
    if (group) {
      group.position.set(s.x, s.y, s.z);
      group.quaternion.copy(scratch.quat);
    }

    // Wheels: front pair yaws with steer input, all four spin with distance
    // travelled (rolling without slipping — angle += speed*dt/radius).
    wheelSpinAngleRef.current += (s.speed * delta) / WHEEL_RADIUS;
    const steerAngle = STEER_SIGN * input.steer * MAX_STEER_RAD;
    for (let i = 0; i < WHEELS.length; i++) {
      const yaw = wheelYawRefs.current[i];
      const spin = wheelSpinRefs.current[i];
      if (yaw) yaw.rotation.y = WHEELS[i].steer ? steerAngle : 0;
      if (spin) spin.rotation.x = wheelSpinAngleRef.current;
    }

    // Chase camera — unchanged in feel from Craft.tsx, reading `scratch.forward`
    // (already the slope-aligned forward axis computed above) rather than a
    // rigid body's own transform. `s.y` is ground height (drive.ts's own
    // doc comment); CHASSIS_RESTING_HEIGHT lifts the reference point to
    // roughly where the chassis itself sits, same as it did as a rigid body.
    const chassisY = s.y + CHASSIS_RESTING_HEIGHT;
    const distance = CAMERA_BASE_DISTANCE + Math.abs(s.speed) * CAMERA_SPEED_PULLBACK;
    scratch.camTarget.set(s.x, chassisY, s.z).addScaledVector(scratch.forward, -distance);
    scratch.camTarget.y += CAMERA_HEIGHT;
    camera.position.lerp(scratch.camTarget, Math.min(1, delta * CAMERA_FOLLOW_SPEED));
    scratch.lookTarget.set(s.x, chassisY + CAMERA_LOOK_HEIGHT, s.z);
    camera.lookAt(scratch.lookTarget);

    if ("fov" in camera) {
      const perspective = camera as THREE.PerspectiveCamera;
      const target =
        CAMERA_BASE_FOV + Math.min(1, Math.abs(s.speed) / 24) * CAMERA_FOV_SPREAD + (boostingRef.current ? 6 : 0);
      const next = perspective.fov + (target - perspective.fov) * Math.min(1, delta * 4);
      if (Math.abs(next - perspective.fov) > 0.01) {
        perspective.fov = next;
        perspective.updateProjectionMatrix();
      }
    }

    scratch.state.position[0] = s.x;
    scratch.state.position[1] = s.y;
    scratch.state.position[2] = s.z;
    telemetry.x = s.x;
    telemetry.y = s.y;
    telemetry.z = s.z;
    telemetry.heading = s.heading;
    telemetry.speed = s.speed;
    telemetry.boost = boostRef.current;
    telemetry.boosting = boostingRef.current;

    props.onState(scratch.state);
  });

  return (
    <group ref={groupRef}>
      {/* `group` sits at ground height (drive.ts's `s.y`); everything below
          is offset up from there by CHASSIS_RESTING_HEIGHT, the same number
          the old rigid body's suspension used to hold the chassis above the
          surface — kept here purely as a visual constant now. */}
      <RoundedBox
        args={[HALF.x * 2, HALF.y * 2, HALF.z * 2]}
        position={[0, CHASSIS_RESTING_HEIGHT, 0]}
        radius={0.12}
        smoothness={3}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color={c.signal} metalness={0.35} roughness={0.35} />
      </RoundedBox>

      {/* Cabin */}
      <RoundedBox
        args={[0.68, 0.32, 0.9]}
        radius={0.08}
        smoothness={3}
        position={[0, CHASSIS_RESTING_HEIGHT + HALF.y + 0.16, -0.1]}
        castShadow
      >
        <meshStandardMaterial color={c.void} metalness={0.5} roughness={0.25} />
      </RoundedBox>

      {/* Wheels — planted on the ground plane (y = WHEEL_RADIUS) rather than
          hung off a suspension: nothing left to bounce, there is no suspension. */}
      {WHEELS.map((w, i) => (
        <group
          key={i}
          ref={(g) => {
            wheelYawRefs.current[i] = g;
          }}
          position={[w.x, WHEEL_RADIUS, w.z]}
        >
          <group
            ref={(g) => {
              wheelSpinRefs.current[i] = g;
            }}
          >
            <mesh castShadow rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[WHEEL_RADIUS, WHEEL_RADIUS, 0.26, 14]} />
              <meshStandardMaterial color={c.void} roughness={0.7} />
            </mesh>
          </group>
        </group>
      ))}
    </group>
  );
}
