import { SceneActivity } from "./SceneActivity.tsx";
import { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Stars } from "@react-three/drei";
import { MathUtils } from "three";
import type { Group } from "three";

/** 0..1 scroll progress through the whole document, read cheaply per frame. */
function scrollProgress() {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  return max > 0 ? Math.min(window.scrollY / max, 1) : 0;
}

/** Slow-drifting starfield; the whole field also yaws gently with scroll. */
function Field() {
  const group = useRef<Group>(null);
  useFrame((_, delta) => {
    const g = group.current;
    if (!g) return;
    g.rotation.y += delta * 0.02;
    g.rotation.x = MathUtils.damp(g.rotation.x, scrollProgress() * 0.35, 2, delta);
  });
  return (
    <group ref={group}>
      <Stars radius={70} depth={35} count={600} factor={1.1} saturation={0} fade speed={0.35} />
    </group>
  );
}

/**
 * Lazy ambient WebGL layer (loaded only via React.lazy in AmbientBackground.tsx,
 * so three/@react-three/* ship in their own chunk, never the main entry).
 * Low-cost by design: one quiet particle field, capped dpr,
 * no postprocessing.
 */
export default function AmbientScene() {
  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ position: [0, 0, 1], fov: 75 }}
      gl={{ antialias: false, alpha: true, powerPreference: "low-power" }}
      style={{ position: "absolute", inset: 0 }}
    >
      <SceneActivity />
      <Field />
    </Canvas>
  );
}
