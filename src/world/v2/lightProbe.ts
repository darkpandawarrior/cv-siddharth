/**
 * L2 (visual-catalogue.md#L2, master-plan.md#M67): bakes ONE ambient
 * `LightProbe` at the deepmal's centroid, from whatever the instancer has
 * already placed into the scene (its lit niches included) — never a
 * PointLight per niche. A per-niche light would scale the deepmal's own
 * draw-call/light count with `fleetStats.live`; one baked probe costs a
 * fixed six `renderer.render()` calls (`CubeCamera.update`'s own six cube
 * faces) whether the fleet has 10 live listings or 10,000, which is the
 * whole point of baking a probe here instead of lighting the niches
 * directly (lightProbe.test.ts's own acceptance line).
 *
 * `bakeDeepmalLightProbe` takes its renderer and scene as arguments rather
 * than reading a module-level Canvas ref, so `lightProbe.test.ts` can swap
 * in a stub renderer that (a) counts its own `render()` calls the way
 * `renderer.info.render.calls` would and (b) fabricates its own cube-face
 * pixels for `LightProbeGenerator.fromCubeRenderTarget` to read — no real
 * WebGL context, no jsdom canvas polyfill, and the exact same production
 * code path a real browser runs.
 */
import { CubeCamera, FloatType, NoColorSpace, RGBAFormat, WebGLCubeRenderTarget, type Object3D, type Scene, type WebGLRenderer } from "three";
import { LightProbeGenerator } from "three/addons/lights/LightProbeGenerator.js";

/** Cube-face resolution for the bake — small on purpose: a light probe only
 *  needs enough samples for its 9 spherical-harmonics coefficients, not a
 *  reflection-quality environment map. */
export const PROBE_SIZE_DEFAULT = 16;
export const PROBE_NEAR = 0.1;
export const PROBE_FAR = 2000;

/**
 * Bakes one light probe at `position` from whatever is currently in
 * `scene`. The transient `CubeCamera` and its render target are torn down
 * before this resolves; only the probe survives, added to the scene once by
 * the caller (`layers/LandmarksRecords.tsx`) after this promise settles.
 */
export async function bakeDeepmalLightProbe(
  renderer: WebGLRenderer,
  scene: Scene | Object3D,
  position: readonly [number, number, number],
  size: number = PROBE_SIZE_DEFAULT,
) {
  const renderTarget = new WebGLCubeRenderTarget(size, { format: RGBAFormat, type: FloatType, colorSpace: NoColorSpace });
  const cubeCamera = new CubeCamera(PROBE_NEAR, PROBE_FAR, renderTarget);
  cubeCamera.position.set(position[0], position[1], position[2]);
  scene.add(cubeCamera);
  cubeCamera.update(renderer, scene as Scene);
  scene.remove(cubeCamera);
  try {
    return await LightProbeGenerator.fromCubeRenderTarget(renderer, renderTarget);
  } finally {
    renderTarget.dispose();
  }
}

/** The DOM-mirror formatter for `renderer.info.render.calls` —
 *  `GrammarInstancesDom`'s "world state also lands on a real DOM node"
 *  idiom, applied to the deepmal's own draw-call count so a verifier can
 *  confirm it holds flat as the fleet grows, without reading back WebGL
 *  pixels (G11). */
export function drawCallsAttr(info: { render: { calls: number } }): string {
  return String(info.render.calls);
}
