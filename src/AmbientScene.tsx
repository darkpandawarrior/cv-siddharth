import { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Stars } from "@react-three/drei";
import type { Group } from "three";

/** Slow-drifting starfield — the only moving part, kept to one draw call via drei's Stars. */
function Field() {
  const group = useRef<Group>(null);
  useFrame((_, delta) => {
    if (group.current) group.current.rotation.y += delta * 0.02;
  });
  return (
    <group ref={group}>
      <Stars radius={70} depth={35} count={1400} factor={2.2} saturation={0} fade speed={0.35} />
    </group>
  );
}

/**
 * Lazy ambient WebGL layer (loaded only via React.lazy in AmbientBackground.tsx,
 * so three/@react-three/* ship in their own chunk, never the main entry).
 * Low-cost by design: one particle field, capped dpr, no postprocessing.
 */
export default function AmbientScene() {
  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ position: [0, 0, 1], fov: 75 }}
      gl={{ antialias: false, alpha: true, powerPreference: "low-power" }}
      style={{ position: "absolute", inset: 0 }}
    >
      <Field />
    </Canvas>
  );
}
