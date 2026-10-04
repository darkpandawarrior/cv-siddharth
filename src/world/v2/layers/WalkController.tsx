import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3 } from "three";
import { deviceTier } from "../../deviceTier.ts";
import { input } from "../../input.ts";
import { useReducedMotion } from "../../../SceneActivity.tsx";
import { useTerrainHeight } from "../terrainSurface.tsx";
import { landmarkPositions } from "../landmarkPositions.ts";
import { recordBindings } from "../recordBindings.ts";
import { getTourStop } from "../tour.ts";
import { getWalk, moveWalk, returnToBoat, setWalkControls, startWalk, walkDirection, walkLandings } from "../walk.ts";
import { playImpact, playPickup } from "../haptics.ts";
import { cancelXR, registerXR, startXR } from "../xr.ts";

export const layer = { id: "walk-controller", order: 90 };
const SPEED = 2.5;
const EYE_HEIGHT = 1.65;

export default function WalkController() {
  const { gl, camera } = useThree();
  const heightAt = useTerrainHeight();
  const reduced = useReducedMotion();
  const heading = useRef(0);
  const distance = useRef(0);
  const reference = useRef<XRReferenceSpace | null>(null);
  const forward = useRef(new Vector3());
  const landings = useMemo(() => walkLandings(landmarkPositions(), recordBindings())
    .filter((p) => heightAt(p.x, p.z) > 0), [heightAt]);

  useEffect(() => {
    const start = (id: string) => {
      if (deviceTier() === 3 || getTourStop()) return false;
      const landing = landings.find((l) => l.id === id);
      if (!landing || !startWalk(landing, landings, heightAt)) return false;
      heading.current = 0;
      distance.current = 0;
      playImpact();
      return true;
    };
    const back = async () => {
      if (!getWalk()) return;
      await gl.xr.getSession()?.end();
      returnToBoat();
      reference.current = null;
      playPickup();
    };
    setWalkControls({ landings, start, back });
    const unregister = registerXR(async () => {
      const alreadyWalking = !!getWalk();
      // VR locomotion uses the same dry landing and shoreline clamp.
      try {
        if (!alreadyWalking && (!landings[0] || !start(landings[0].id))) throw new Error("Choose a dry landing after exiting the tour.");
        await startXR(gl);
        reference.current = gl.xr.getReferenceSpace();
      }
      catch (error) { if (!alreadyWalking) returnToBoat(); cancelXR(); throw error; }
    });
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.key.toLowerCase() !== "b" || event.repeat || target?.isContentEditable
        || target?.closest("input,select,textarea") || !getWalk()) return;
      event.preventDefault();
      void back().catch(() => {});
    };
    window.addEventListener("keydown", onKey);
    return () => {
      unregister();
      void gl.xr.getSession()?.end().catch(() => {});
      setWalkControls(null);
      returnToBoat();
      window.removeEventListener("keydown", onKey);
    };
  }, [gl, heightAt, landings]);

  useFrame((_, delta) => {
    const walk = getWalk();
    if (!walk) return;
    const dt = Math.min(Math.max(delta, 0), 0.05);
    let steer = input.steer;
    let throttle = input.throttle;
    for (const source of gl.xr.getSession()?.inputSources ?? []) {
      const axes = source.gamepad?.axes;
      if (axes && axes.length >= 2) {
        const x = axes[axes.length - 2], y = axes[axes.length - 1];
        if (Math.abs(x) > 0.15) steer = x;
        if (Math.abs(y) > 0.15) throttle = -y;
      }
    }
    if (gl.xr.isPresenting) gl.xr.getCamera().getWorldDirection(forward.current);
    else heading.current += steer * dt * 1.5;
    const direction = walkDirection(heading.current, throttle, steer, gl.xr.isPresenting ? forward.current : undefined);
    moveWalk({ x: walk.position.x + direction.x * SPEED * dt,
      z: walk.position.z + direction.z * SPEED * dt }, heightAt);
    const position = getWalk()!.position;
    distance.current += Math.hypot(position.x - walk.position.x, position.z - walk.position.z);
    const ground = heightAt(position.x, position.z);
    if (gl.xr.isPresenting && reference.current) {
      gl.xr.setReferenceSpace(reference.current.getOffsetReferenceSpace(new XRRigidTransform({ x: -position.x, y: -ground, z: -position.z })));
    } else {
      const bob = !reduced && deviceTier() === 1 ? Math.sin(distance.current * 8) * 0.025 : 0;
      camera.position.set(position.x, ground + EYE_HEIGHT + bob, position.z);
      camera.lookAt(position.x + Math.sin(heading.current), ground + EYE_HEIGHT, position.z + Math.cos(heading.current));
    }
  });
  return null;
}
