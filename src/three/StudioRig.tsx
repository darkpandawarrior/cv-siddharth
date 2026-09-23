import { Environment, Lightformer } from "@react-three/drei";
import { readToken } from "../themeColor";

/**
 * The shared studio lighting rig, extracted verbatim from Phone3DScene.tsx
 * (hemisphere fill, key directional, a signal-green point light, and a
 * local three-lightformer environment: white left, amber right, mint top).
 *
 * Every sculptural GLB in the Evidence Atlas (the hero plinth, the Blueprint
 * instrument, the skills core, the chess handoff marker) mounts this one rig
 * instead of hand-rolling its own lights, so "cyber" comes from the shared
 * Anodized amber / Brushed titanium / Signal ceramic materials and this one
 * light recipe, not from a per-scene guess. `<Environment resolution={128}>`
 * with inline Lightformers is a LOCAL environment — no HDR fetch, so CSP is
 * unaffected and there is no network request to budget for.
 *
 * Does not include `<SceneActivity/>`: that is the frameloop/idle contract,
 * orthogonal to lighting, and every scene already mounts it separately.
 */
export function StudioRig() {
  return (
    <>
      <hemisphereLight args={["#d8f4e7", "#162b23", 1.5]} />
      <directionalLight position={[3, 4, 5]} intensity={2.4} color="#fff2df" />
      <pointLight position={[-3, 0, 2]} intensity={9} color={readToken("--color-signal", "#3ddc84")} />
      <Environment resolution={128}>
        <Lightformer intensity={3} position={[-3, 2, 4]} scale={[2, 5, 1]} />
        <Lightformer intensity={2} position={[3, 1, 2]} scale={[1, 4, 1]} color="#f2a13d" />
        <Lightformer intensity={2} position={[0, 4, -2]} scale={[5, 1, 1]} color="#bdebdc" />
      </Environment>
    </>
  );
}
