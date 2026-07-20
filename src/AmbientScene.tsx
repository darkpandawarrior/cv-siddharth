import { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Stars } from "@react-three/drei";
import { Color, MathUtils } from "three";
import type { Group, Mesh, MeshBasicMaterial } from "three";

const GREEN = new Color("#3ddc84");
const CYAN = new Color("#5ee6ff");

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
      <Stars radius={70} depth={35} count={1400} factor={2.2} saturation={0} fade speed={0.35} />
    </group>
  );
}

/**
 * Faint wireframe solids drifting at different depths. They parallax upward
 * as the page scrolls and their tint lerps green→cyan with progress, so the
 * background subtly "travels" with the visitor. Three meshes, basic
 * materials — still effectively free.
 */
const SHARDS: { pos: [number, number, number]; scale: number; speed: number; kind: "ico" | "torus" | "octa" }[] = [
  { pos: [-1.6, 0.4, -2.5], scale: 0.9, speed: 0.12, kind: "ico" },
  { pos: [1.8, -0.6, -3.5], scale: 1.3, speed: 0.08, kind: "torus" },
  { pos: [0.6, 1.1, -5], scale: 1.6, speed: 0.05, kind: "octa" },
];

function Shard({ pos, scale, speed, kind }: (typeof SHARDS)[number]) {
  const mesh = useRef<Mesh>(null);
  const mat = useRef<MeshBasicMaterial>(null);
  useFrame((_, delta) => {
    const m = mesh.current;
    if (!m) return;
    const p = scrollProgress();
    m.rotation.x += delta * speed;
    m.rotation.y += delta * speed * 1.4;
    // Parallax: deeper shards climb slower.
    m.position.y = pos[1] + p * (2.2 / -pos[2]) * 3;
    if (mat.current) mat.current.color.copy(GREEN).lerp(CYAN, p);
  });
  return (
    <mesh ref={mesh} position={pos} scale={scale}>
      {kind === "ico" && <icosahedronGeometry args={[1, 0]} />}
      {kind === "torus" && <torusKnotGeometry args={[0.7, 0.18, 64, 8, 2, 3]} />}
      {kind === "octa" && <octahedronGeometry args={[1, 0]} />}
      <meshBasicMaterial ref={mat} wireframe transparent opacity={0.1} color={GREEN} />
    </mesh>
  );
}

/**
 * Lazy ambient WebGL layer (loaded only via React.lazy in AmbientBackground.tsx,
 * so three/@react-three/* ship in their own chunk, never the main entry).
 * Low-cost by design: one particle field + three wireframe shards, capped dpr,
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
      <Field />
      {SHARDS.map((s) => (
        <Shard key={s.kind} {...s} />
      ))}
    </Canvas>
  );
}
