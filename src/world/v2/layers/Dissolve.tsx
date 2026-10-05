/** Capture-then-dissolve, based on Rich Harris's MIT gl-transitions perlin.
 * https://github.com/gl-transitions/gl-transitions/blob/master/transitions/perlin.glsl
 * Full licence and shader attribution are in ../dissolve.glsl.ts.
 */
import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Color, FramebufferTexture, Mesh, OrthographicCamera, PlaneGeometry, Scene, ShaderMaterial, Vector2 } from "three";
import { readToken } from "../../../themeColor.ts";
import { useReducedMotion } from "../../../SceneActivity.tsx";
import { dissolveFragment, dissolveVertex, getLandmarkEnter, setLandmarkEnter, subscribeLandmarkEnter } from "../dissolve.glsl.ts";

export const layer = { id: "landmark-dissolve", order: 100 };
const DURATION_S = 0.35;

export default function Dissolve() {
  const { gl, invalidate } = useThree();
  const reduced = useReducedMotion();
  const enter = useSyncExternalStore(subscribeLandmarkEnter, getLandmarkEnter, () => null);
  const capture = useRef<FramebufferTexture | null>(null);
  const started = useRef<number | null>(null);
  const navigating = useRef(false);
  const overlay = useMemo(() => {
    const material = new ShaderMaterial({
      vertexShader: dissolveVertex, fragmentShader: dissolveFragment,
      uniforms: { frame: { value: null }, progress: { value: 0 },
        ink: { value: new Color() }, rimColor: { value: new Color() } },
      depthTest: false, depthWrite: false, toneMapped: false,
    });
    const geometry = new PlaneGeometry(2, 2);
    const scene = new Scene();
    scene.add(new Mesh(geometry, material));
    return { scene, material, geometry, camera: new OrthographicCamera(-1, 1, 1, -1, 0, 1) };
  }, []);

  useEffect(() => {
    invalidate();
  }, [enter, reduced, invalidate]);
  useEffect(() => () => {
    capture.current?.dispose();
    overlay.material.dispose(); overlay.geometry.dispose();
    setLandmarkEnter(null);
  }, [overlay]);

  // Priority 2 runs after Post's composer (priority 1), so the texture includes
  // grading and bloom. No second canvas or renderer and no permanent render target.
  useFrame(({ scene, camera }) => {
    if (gl.xr.isPresenting) gl.render(scene, camera);
    if (!enter) return;
    const finish = () => {
      if (navigating.current) return;
      navigating.current = true;
      void enter.navigate().finally(() => {
        setLandmarkEnter(null);
        navigating.current = false; started.current = null;
        capture.current?.dispose(); capture.current = null;
      });
    };
    if (reduced || gl.xr.isPresenting || gl.getContext().isContextLost()) { finish(); return; }
    if (!capture.current) {
      const size = gl.getDrawingBufferSize(new Vector2());
      capture.current = new FramebufferTexture(size.x, size.y);
      gl.copyFramebufferToTexture(capture.current);
      // The copied framebuffer already contains display colors, so the overlay
      // uses display colors too and avoids applying the grade a second time.
      overlay.material.uniforms.ink.value.set(readToken("--color-ink", "#0a0d0c")).convertLinearToSRGB();
      overlay.material.uniforms.rimColor.value.set(readToken("--color-accent", "#f2a13d")).convertLinearToSRGB();
      overlay.material.uniforms.frame.value = capture.current;
      started.current = performance.now();
      gl.domElement.dataset.dissolve = "captured";
    }
    const progress = Math.min(1, (performance.now() - started.current!) / (DURATION_S * 1000));
    overlay.material.uniforms.progress.value = progress;
    const autoClear = gl.autoClear;
    gl.autoClear = false;
    gl.render(overlay.scene, overlay.camera);
    gl.autoClear = autoClear;
    gl.domElement.dataset.dissolve = progress === 1 ? "complete" : "running";
    if (progress === 1) finish();
    else invalidate();
  }, 2);
  return null;
}
