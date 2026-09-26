import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { createSkyDomeMaterial } from "./SkyDome.tsx";
import type { SkyUniformName } from "./skyChunk.glsl.ts";

// A unit sphere is enough for the bake target (PMREMGenerator samples every
// direction regardless of radius); a plain, low-poly sphere keeps the bake
// itself cheap.
const BAKE_SEGMENTS = 24;
const BAKE_RINGS = 16;

/**
 * world-v2-spec §7 "Environment": "the sky dome is rendered once into
 * `PMREMGenerator.fromScene`. That costs zero bytes and matches the sky
 * exactly, so there is no runtime HDRI." Reuses `SkyDome.tsx`'s own
 * material factory (not a second hand-written shader) so the baked
 * reflection can never drift from what the dome itself shows.
 *
 * Re-bakes (disposing the previous env map) whenever `uniforms` changes
 * identity — a later live-sky lane's hook for keeping the environment map
 * in step with a live sun without this file changing.
 */
export function useSkyEnvironment(uniforms?: Record<SkyUniformName, THREE.IUniform>): void {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    pmrem.compileEquirectangularShader();

    const material = createSkyDomeMaterial(uniforms);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1, BAKE_SEGMENTS, BAKE_RINGS), material);
    const bakeScene = new THREE.Scene();
    bakeScene.add(dome);

    const renderTarget = pmrem.fromScene(bakeScene, 0.04);
    const previousEnvironment = scene.environment;
    // Imperative three.js scene mutation from an effect is the documented
    // R3F escape hatch for exactly this (drei's own useEnvironment/
    // <Environment> does the same) — not a React-owned value.
    // eslint-disable-next-line react-hooks/immutability
    scene.environment = renderTarget.texture;

    return () => {
      scene.environment = previousEnvironment;
      renderTarget.dispose();
      pmrem.dispose();
      material.dispose();
      dome.geometry.dispose();
    };
  }, [gl, scene, uniforms]);
}

/** Component form of `useSkyEnvironment`, for a caller that mounts an
 *  element rather than calling a hook directly (mirrors `SceneActivity`). */
export function Env({ uniforms }: { uniforms?: Record<SkyUniformName, THREE.IUniform> }) {
  useSkyEnvironment(uniforms);
  return null;
}
