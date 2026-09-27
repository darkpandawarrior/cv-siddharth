/**
 * world-v2-spec.md §8 "Warm-up": "`gl.compile(scene, camera)` runs with
 * every layer enabled and every object visible before the first frame, and
 * the real visibility is restored afterwards." A shader compiling for the
 * first time it is actually drawn is a real, visible hitch (a lamp shaft or
 * a kit that only turns visible at night, say, popping in with a stutter
 * the first time night falls); running the compile once, eagerly, against
 * every object the scene graph already holds moves that cost off the frame
 * that would otherwise show it.
 *
 * A `layers/*.tsx` canvas layer like every other one here (`layers.ts`'s
 * own `import.meta.glob` contract), so `WorldV2.tsx` never needs an edit to
 * pick this up. Given the HIGHEST `order` of any layer, on purpose: React
 * fires sibling `useLayoutEffect`s in mount order, so this one runs its
 * traverse-and-compile AFTER every other layer already mounted (including
 * "layer 6" — whichever future sky-objects layer lands at that order,
 * §8's own example) and added its objects to the scene graph, not before.
 * It renders nothing itself.
 */
import { useLayoutEffect } from "react";
import { useThree } from "@react-three/fiber";
import type { Camera, Object3D } from "three";
import type { WebGLRenderer } from "three";

export const layer = { id: "warmup", order: 9999 };

/** The pure core: force every object in `scene` visible, compile every
 *  program that implies against `camera`, then restore each object's own
 *  prior visibility. Exported and gl-agnostic (`gl` is typed down to just
 *  the one method used) so a test can hand it a plain `{ compile: vi.fn()
 *  }` stub and a real (WebGL-free) `THREE.Object3D` tree. */
export function warmupScene(gl: Pick<WebGLRenderer, "compile">, scene: Object3D, camera: Camera): void {
  const previousVisibility = new Map<Object3D, boolean>();
  scene.traverse((obj) => {
    previousVisibility.set(obj, obj.visible);
    obj.visible = true;
  });
  gl.compile(scene, camera);
  for (const [obj, visible] of previousVisibility) obj.visible = visible;
}

export default function Warmup() {
  const { gl, scene, camera } = useThree();
  useLayoutEffect(() => {
    warmupScene(gl, scene, camera);
    // Runs once, against whatever the scene graph holds the instant every
    // other layer's own mount effect has already run (this file's own
    // `order` note) — not on every camera/gl identity change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
