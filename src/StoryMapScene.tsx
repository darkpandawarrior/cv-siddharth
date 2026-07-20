import { useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Line, Html } from "@react-three/drei";
import { MathUtils, Vector3 } from "three";
import type { Group, Mesh } from "three";
import { EDGES, NODES, navigate, type StoryNode } from "./StoryMap.tsx";

/**
 * The Storyboard, in depth — the same node/edge data as the 2D canvas
 * fallback, lifted into a draggable 3D constellation (same idiom as
 * FoundationGraphScene). Signal pulses travel the wires, hovering a node
 * lights up its neighbourhood, clicking travels to the destination.
 * Loaded lazily so three.js never touches the main chunk.
 */

// Lift the hand-tuned 2D layout into 3D: x spreads wide, y flips (screen →
// world), z gives each node its own depth so orbiting reveals parallax.
const DEPTH: Record<string, number> = {
  sid: 0,
  work: -0.7,
  mileway: 0.5,
  kursi: -0.4,
  paymentslab: 0.6,
  experience: -0.8,
  skills: 0.4,
  writing: 0.7,
  books: -0.5,
  chat: 0.3,
};

const pos3 = (n: StoryNode): [number, number, number] => [
  (n.x - 0.5) * 7.2,
  (0.5 - n.y) * 3.6,
  DEPTH[n.id] ?? 0,
];

const byId = Object.fromEntries(NODES.map((n) => [n.id, n]));

function Star({ node, active, dim, onHover }: { node: StoryNode; active: boolean; dim: boolean; onHover: (id: string | null) => void }) {
  const mesh = useRef<Mesh>(null);
  const base = useMemo(() => pos3(node), [node]);
  const seed = useMemo(() => node.x * 11 + node.y * 5, [node]);
  const r = node.r / 55; // 2D pixel radius → world units

  useFrame(({ clock }, delta) => {
    const m = mesh.current;
    if (!m) return;
    m.position.y = base[1] + Math.sin(clock.elapsedTime * 0.6 + seed) * 0.08;
    m.scale.setScalar(MathUtils.damp(m.scale.x, active ? 1.5 : 1, 6, delta));
  });

  return (
    <mesh
      ref={mesh}
      position={base}
      onPointerOver={(e) => { e.stopPropagation(); onHover(node.id); document.body.style.cursor = "pointer"; }}
      onPointerOut={() => { onHover(null); document.body.style.cursor = "default"; }}
      onClick={(e) => { e.stopPropagation(); document.body.style.cursor = "default"; navigate(node.target); }}
    >
      <sphereGeometry args={[Math.max(r, 0.16), 24, 24]} />
      <meshStandardMaterial
        color={node.color}
        emissive={node.color}
        emissiveIntensity={active ? 2.4 : 1}
        transparent
        opacity={dim ? 0.22 : 1}
      />
      <Html center distanceFactor={7.5} position={[0, -(Math.max(r, 0.16) + 0.26), 0]} style={{ pointerEvents: "none" }}>
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
          {node.sub && (active || node.id === "sid") && (
            <span style={{ color: `${node.color}cc`, marginLeft: 6, fontSize: "9.5px" }}>{node.sub}</span>
          )}
        </span>
      </Html>
    </mesh>
  );
}

/** A dot of light traveling its wire, brighter when the wire is lit. */
function Pulse({ a, b, offset, lit }: { a: [number, number, number]; b: [number, number, number]; offset: number; lit: boolean }) {
  const mesh = useRef<Mesh>(null);
  const va = useMemo(() => new Vector3(...a), [a]);
  const vb = useMemo(() => new Vector3(...b), [b]);

  useFrame(({ clock }) => {
    const m = mesh.current;
    if (!m) return;
    const k = (clock.elapsedTime / 2.6 + offset) % 1;
    m.position.lerpVectors(va, vb, k);
  });

  return (
    <mesh ref={mesh}>
      <sphereGeometry args={[lit ? 0.045 : 0.028, 8, 8]} />
      <meshBasicMaterial color={lit ? "#3ddc84" : "#5ee6ff"} transparent opacity={lit ? 1 : 0.5} />
    </mesh>
  );
}

function Constellation() {
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
    drag.current.vel = MathUtils.damp(drag.current.vel, 0, 2, delta);
    g.rotation.y += delta * (hover ? 0.015 : 0.07) + drag.current.vel;
    g.rotation.y = MathUtils.clamp(g.rotation.y, -0.55, 0.55);
  });

  return (
    <group
      ref={group}
      onPointerDown={(e) => { drag.current.on = true; drag.current.x = e.clientX; }}
      onPointerUp={() => { drag.current.on = false; }}
      onPointerLeave={() => { drag.current.on = false; }}
      onPointerMove={(e) => {
        if (!drag.current.on) return;
        drag.current.vel = (e.clientX - drag.current.x) * 0.0004;
        drag.current.x = e.clientX;
      }}
    >
      {EDGES.map(([a, b], i) => {
        const lit = !!(neighbourhood?.has(a) && neighbourhood?.has(b));
        return (
          <group key={`${a}-${b}`}>
            <Line
              points={[pos3(byId[a]), pos3(byId[b])]}
              color={lit ? "#3ddc84" : "#24445a"}
              lineWidth={lit ? 2 : 1}
              transparent
              opacity={neighbourhood && !lit ? 0.12 : 0.55}
            />
            <Pulse a={pos3(byId[a])} b={pos3(byId[b])} offset={(i * 0.37) % 1} lit={lit} />
          </group>
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

export default function StoryMapScene() {
  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ position: [0, 0, 5.4], fov: 46 }}
      gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
      style={{ position: "absolute", inset: 0 }}
    >
      <ambientLight intensity={0.55} />
      <pointLight position={[4, 3, 4]} intensity={9} color="#5ee6ff" />
      <pointLight position={[-4, -2, 3]} intensity={9} color="#3ddc84" />
      <Constellation />
    </Canvas>
  );
}
