import { useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Line, Html } from "@react-three/drei";
import { MathUtils } from "three";
import type { Group, Mesh } from "three";

/**
 * "Platform constellation" — the two shared KMP libraries as hub stars with
 * their consumer apps and toolkit modules in orbit, edges glowing along real
 * dependency lines. Hover a node to light up its neighbourhood; click to
 * open the repo. This is the dependency graph I actually maintain, drawn as
 * a constellation instead of a Gradle diagram.
 */

interface Node {
  id: string;
  label: string;
  pos: [number, number, number];
  r: number;
  color: string;
  url?: string;
  kind: "hub" | "app" | "module";
}

const NODES: Node[] = [
  { id: "toolkit", label: "kmp-toolkit", pos: [0, 0.4, 0], r: 0.34, color: "#3ddc84", url: "https://github.com/darkpandawarrior/kmp-toolkit", kind: "hub" },
  { id: "buildlogic", label: "kmp-build-logic", pos: [-2.3, -0.7, -0.4], r: 0.3, color: "#3ddc84", url: "https://github.com/darkpandawarrior/kmp-build-logic", kind: "hub" },
  { id: "mileway", label: "Mileway", pos: [2.4, 1.2, -0.6], r: 0.26, color: "#5ee6ff", url: "https://github.com/darkpandawarrior/Mileway", kind: "app" },
  { id: "paymentslab", label: "PaymentsLab", pos: [2.2, -1.1, 0.3], r: 0.26, color: "#5ee6ff", url: "https://github.com/darkpandawarrior/PaymentsLab", kind: "app" },
  { id: "mvi", label: "mvi-core", pos: [-0.9, 1.7, 0.5], r: 0.14, color: "#8ff0b4", kind: "module" },
  { id: "security", label: "security", pos: [-1.4, 1.1, -1], r: 0.14, color: "#8ff0b4", kind: "module" },
  { id: "designsystem", label: "designsystem", pos: [0.2, -1.6, -0.8], r: 0.14, color: "#8ff0b4", kind: "module" },
  { id: "feedback", label: "feedback", pos: [-0.6, -1.3, 0.9], r: 0.14, color: "#8ff0b4", kind: "module" },
];

const EDGES: [string, string][] = [
  ["mileway", "toolkit"],
  ["mileway", "buildlogic"],
  ["paymentslab", "toolkit"],
  ["paymentslab", "buildlogic"],
  ["toolkit", "mvi"],
  ["toolkit", "security"],
  ["toolkit", "designsystem"],
  ["toolkit", "feedback"],
];

const byId = Object.fromEntries(NODES.map((n) => [n.id, n]));

function Star({ node, active, dim, onHover }: { node: Node; active: boolean; dim: boolean; onHover: (id: string | null) => void }) {
  const mesh = useRef<Mesh>(null);
  const seed = useMemo(() => node.pos[0] * 7 + node.pos[1] * 3, [node]);

  useFrame(({ clock }, delta) => {
    const m = mesh.current;
    if (!m) return;
    const t = clock.elapsedTime;
    // Each star breathes on its own phase; hovered stars swell.
    m.position.y = node.pos[1] + Math.sin(t * 0.7 + seed) * 0.08;
    const target = active ? 1.5 : 1;
    m.scale.setScalar(MathUtils.damp(m.scale.x, target, 6, delta));
  });

  return (
    <mesh
      ref={mesh}
      position={node.pos}
      onPointerOver={(e) => { e.stopPropagation(); onHover(node.id); document.body.style.cursor = node.url ? "pointer" : "default"; }}
      onPointerOut={() => { onHover(null); document.body.style.cursor = "default"; }}
      onClick={(e) => { e.stopPropagation(); if (node.url) window.open(node.url, "_blank", "noreferrer"); }}
    >
      <sphereGeometry args={[node.r, 24, 24]} />
      <meshStandardMaterial
        color={node.color}
        emissive={node.color}
        emissiveIntensity={active ? 2.2 : 0.9}
        transparent
        opacity={dim ? 0.25 : 1}
      />
      {(node.kind !== "module" || active) && (
        <Html center distanceFactor={7} position={[0, -(node.r + 0.28), 0]} style={{ pointerEvents: "none" }}>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "11px",
              whiteSpace: "nowrap",
              color: dim ? "rgba(232,239,233,0.3)" : "#e8efe9",
              background: "rgba(5,7,10,0.55)",
              padding: "2px 7px",
              borderRadius: "999px",
              border: `1px solid ${dim ? "rgba(36,48,41,0.5)" : node.color}44`,
            }}
          >
            {node.label}
          </span>
        </Html>
      )}
    </mesh>
  );
}

function Graph() {
  const group = useRef<Group>(null);
  const [hover, setHover] = useState<string | null>(null);
  const drag = useRef({ on: false, x: 0, vel: 0 });

  const neighbourhood = useMemo(() => {
    if (!hover) return null;
    const set = new Set([hover]);
    for (const [a, b] of EDGES) {
      if (a === hover) set.add(b);
      if (b === hover) set.add(a);
    }
    return set;
  }, [hover]);

  useFrame((_, delta) => {
    const g = group.current;
    if (!g) return;
    // Idle spin, pausable-feeling: drag velocity decays into the base drift.
    drag.current.vel = MathUtils.damp(drag.current.vel, 0, 2, delta);
    g.rotation.y += delta * (hover ? 0.02 : 0.12) + drag.current.vel;
  });

  return (
    <group
      ref={group}
      onPointerDown={(e) => { drag.current.on = true; drag.current.x = e.clientX; }}
      onPointerUp={() => { drag.current.on = false; }}
      onPointerMove={(e) => {
        if (!drag.current.on) return;
        drag.current.vel = (e.clientX - drag.current.x) * 0.0004;
        drag.current.x = e.clientX;
      }}
    >
      {EDGES.map(([a, b]) => {
        const lit = neighbourhood?.has(a) && neighbourhood?.has(b);
        return (
          <Line
            key={`${a}-${b}`}
            points={[byId[a].pos, byId[b].pos]}
            color={lit ? "#3ddc84" : "#243029"}
            lineWidth={lit ? 2 : 1}
            transparent
            opacity={neighbourhood && !lit ? 0.15 : 0.9}
          />
        );
      })}
      {NODES.map((n) => (
        <Star
          key={n.id}
          node={n}
          active={hover === n.id}
          dim={!!neighbourhood && !neighbourhood.has(n.id)}
          onHover={setHover}
        />
      ))}
    </group>
  );
}

export default function FoundationGraphScene() {
  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ position: [0, 0, 5.2], fov: 45 }}
      gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
      style={{ position: "absolute", inset: 0 }}
    >
      <ambientLight intensity={0.5} />
      <pointLight position={[4, 4, 4]} intensity={8} color="#5ee6ff" />
      <pointLight position={[-4, -2, 3]} intensity={8} color="#3ddc84" />
      <Graph />
    </Canvas>
  );
}
