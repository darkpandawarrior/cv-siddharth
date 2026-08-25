import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { CITY } from "./city.ts";

const HOLD_S = 1.5;
const EASE_S = 1.2;
const STATIC_FOV = 45;
const STATIC_POS = new THREE.Vector3(0, 14, CITY.z0 - 12);
const LOOK_TARGET = new THREE.Vector3(0, 1.5, CITY.z0 + 70);

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;
}

/**
 * §4 — THE SPAWN FLY-IN. A five-second read before the driver touches a key:
 * hold on a static wide shot of the whole corridor — "four ridge profiles
 * line up in rank" — then hand off to Vehicle.tsx's own chase camera, which
 * already runs a per-frame lerp (`camera.position.lerp(camTarget, ...)`)
 * every frame regardless of this component.
 *
 * Rather than choreograph a second camera path that has to agree with
 * Vehicle's, this component only REFUSES to let anything move the camera
 * during the hold — re-asserting the static pose every frame, mounted after
 * Vehicle in World.tsx's JSX so its `useFrame` runs later and wins the
 * frame's last write — then gets out of the way. At that point Vehicle's own
 * lerp naturally eases the camera from the frozen fly-in vantage to chase,
 * with no second easing curve to keep in sync.
 *
 * `prefers-reduced-motion` skips the hold outright: this component becomes
 * a no-op from its first frame, so Vehicle owns the camera from frame one
 * — "starts in chase", per the doc.
 */
export function SpawnFlyIn() {
  const { camera } = useThree();
  const reduced = useRef(prefersReducedMotion());
  const elapsed = useRef(0);
  const done = useRef(reduced.current);

  useEffect(() => {
    if (reduced.current) return;
    camera.position.copy(STATIC_POS);
    camera.lookAt(LOOK_TARGET);
    if ("fov" in camera) {
      const persp = camera as THREE.PerspectiveCamera;
      persp.fov = STATIC_FOV;
      persp.updateProjectionMatrix();
    }
  }, [camera]);

  useFrame((_, delta) => {
    if (done.current) return;
    elapsed.current += delta;
    if (elapsed.current < HOLD_S) {
      camera.position.copy(STATIC_POS);
      camera.lookAt(LOOK_TARGET);
      return;
    }
    if (elapsed.current > HOLD_S + EASE_S) done.current = true;
  });

  return null;
}
