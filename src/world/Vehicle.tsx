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
import { worldPalette, READHEAD_HEX } from "./palette.ts";
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

// Chassis half-extents (metres) — §9's site-inspection cart, ~2.4m x 1.5m.
// Purely a render size now (drive.ts's collision model reads obstacles.ts's
// footprints, not this box), so this can carry the doc's real dimensions
// without touching craftPhysics.ts's WORLD_BOUNDS/SPAWN_POSITION, which are
// sized for clearance rather than for the car's own silhouette.
const HALF = { x: 0.75, y: 0.28, z: 1.2 };

// Wheel layout, in the chassis's local frame. Front is +Z because forward is
// +Z; the leading pair steers, the trailing pair only spins (there is no
// separate "driven" distinction to visualise any more — every wheel just
// rolls at the car's own speed). Pushed wider/further out than the old toy
// car to sit under the wider tray, and the tread itself is oversized (§9).
const TRACK_X = 0.82;
const AXLE_FRONT_Z = 0.95;
const AXLE_REAR_Z = -0.95;
const WHEEL_RADIUS = 0.34;
const WHEEL_WIDTH = 0.42; // "oversized tread" — a chunky offroad-cart tyre, not a car wheel

// §9 body — the one fixed literal on this cart (not a CSS token: it is
// deliberately near-black-but-not-void, the same "structural colour that
// isn't in the theme's own palette rotation" exception READHEAD_HEX carries
// in palette.ts) plus its hazard-trim geometry, in local (chassis) space.
const CART_BODY_HEX = "#0d100f";
const TRIM_WIDTH = 0.06;
const CORNER_X = HALF.x - TRIM_WIDTH / 2;
const CORNER_Z = HALF.z - TRIM_WIDTH / 2;
const TRIM_HEIGHT = HALF.y * 2 + 0.1;

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

      {/* §9 — THE SITE-INSPECTION CART. Body #0d100f, roughness 0.45,
          metalness 0.5: matte enough to read as equipment, metallic enough
          to pick up rim light off the fixtures it passes (gantries,
          bollards, lampposts) rather than reading as flat geometry — the
          whole point of a non-zero metalness on a night scene with exactly
          two lights. No chrome, no gloss, no racing cues. */}
      <RoundedBox
        args={[HALF.x * 2, HALF.y * 2, HALF.z * 2]}
        position={[0, CHASSIS_RESTING_HEIGHT, 0]}
        radius={0.08}
        smoothness={2}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color={CART_BODY_HEX} metalness={0.5} roughness={0.45} />
      </RoundedBox>

      {/* Boxy cab, pushed toward the front (+Z). */}
      <RoundedBox
        args={[0.92, 0.62, 0.9]}
        radius={0.05}
        smoothness={2}
        position={[0, CHASSIS_RESTING_HEIGHT + HALF.y + 0.31, 0.35]}
        castShadow
      >
        <meshStandardMaterial color={CART_BODY_HEX} metalness={0.5} roughness={0.45} />
      </RoundedBox>

      {/* Exposed roll bar over the cab — two verticals plus a top rail, bare
          equipment steel, no shell around it. */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 0.42, CHASSIS_RESTING_HEIGHT + HALF.y + 0.68, 0.05]} castShadow>
          <cylinderGeometry args={[0.025, 0.025, 0.62, 8]} />
          <meshStandardMaterial color={CART_BODY_HEX} metalness={0.6} roughness={0.4} />
        </mesh>
      ))}
      <mesh
        position={[0, CHASSIS_RESTING_HEIGHT + HALF.y + 0.98, 0.05]}
        rotation={[0, 0, Math.PI / 2]}
        castShadow
      >
        <cylinderGeometry args={[0.025, 0.025, 0.84, 8]} />
        <meshStandardMaterial color={CART_BODY_HEX} metalness={0.6} roughness={0.4} />
      </mesh>

      {/* Roof light bar — a physical fixture, not itself a Light. */}
      <mesh position={[0, CHASSIS_RESTING_HEIGHT + HALF.y + 0.72, 0.35]} castShadow>
        <boxGeometry args={[0.5, 0.1, 0.16]} />
        <meshStandardMaterial color={CART_BODY_HEX} metalness={0.55} roughness={0.4} />
      </mesh>

      {/* Whip antenna, off the rear deck. */}
      <mesh position={[-0.55, CHASSIS_RESTING_HEIGHT + HALF.y + 0.55, -1.0]} rotation={[0.12, 0, 0.08]} castShadow>
        <cylinderGeometry args={[0.012, 0.02, 1.15, 6]} />
        <meshStandardMaterial color={CART_BODY_HEX} metalness={0.5} roughness={0.45} />
      </mesh>

      {/* Corner-guard hazard trim — the ONLY saturated paint on the cart, on
          all four verticals of the tray, the livery real inspection
          equipment wears. */}
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <mesh key={`${sx}-${sz}`} position={[sx * CORNER_X, CHASSIS_RESTING_HEIGHT, sz * CORNER_Z]} castShadow>
            <boxGeometry args={[TRIM_WIDTH, TRIM_HEIGHT, TRIM_WIDTH]} />
            <meshStandardMaterial color={c.signal} emissive={c.signal} emissiveIntensity={0.25} roughness={0.4} />
          </mesh>
        )),
      )}

      {/* The "lamp" — NOT a Light. An emissive bar plus a small additive
          sprite, so the real light count in the scene stays at two; the
          ground ahead is lit by Terrain.tsx's read-line band instead. */}
      <mesh position={[0, CHASSIS_RESTING_HEIGHT, HALF.z + 0.02]}>
        <boxGeometry args={[0.6, 0.08, 0.04]} />
        <meshStandardMaterial color={READHEAD_HEX} emissive={READHEAD_HEX} emissiveIntensity={1.6} toneMapped={false} />
      </mesh>
      <mesh position={[0, CHASSIS_RESTING_HEIGHT, HALF.z + 0.05]}>
        <planeGeometry args={[0.7, 0.24]} />
        <meshBasicMaterial
          color={READHEAD_HEX}
          transparent
          opacity={0.5}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>

      {/* Tail strip — the wake ribbon's emit point. */}
      <mesh position={[0, CHASSIS_RESTING_HEIGHT, -HALF.z - 0.02]}>
        <boxGeometry args={[0.5, 0.06, 0.03]} />
        <meshStandardMaterial color={c.signal} emissive={c.signal} emissiveIntensity={1.2} toneMapped={false} />
      </mesh>

      {/* Wheels — oversized tread, planted on the ground plane
          (y = WHEEL_RADIUS) rather than hung off a suspension: nothing left
          to bounce, there is no suspension. */}
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
              <cylinderGeometry args={[WHEEL_RADIUS, WHEEL_RADIUS, WHEEL_WIDTH, 14]} />
              <meshStandardMaterial color={c.void} roughness={0.8} />
            </mesh>
          </group>
        </group>
      ))}
    </group>
  );
}
