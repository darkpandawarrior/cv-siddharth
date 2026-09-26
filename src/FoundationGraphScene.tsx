import { SceneActivity } from "./SceneActivity.tsx";
import { Suspense, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Line, Html, OrbitControls } from "@react-three/drei";
import { MathUtils } from "three";
import { readToken } from "./themeColor";
import type { Mesh } from "three";
import { useStudioModel } from "./three/models.ts";
import { projects } from "./data/profile/projects.ts";
import { FOUNDATION_APP_SLUGS, FOUNDATION_APP_EDGES } from "./data/foundationGraph.ts";

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
  /** Theme token name. Resolved via readToken() at render — r3f will not parse var(). */
  color: string;
  /** Used only if the token fails to resolve (SSR/test). Must match the token's
      real value: a mismatched fallback silently renders the pre-theme palette. */
  fallbackHex: string;
  url?: string;
  kind: "hub" | "app" | "module";
}

// signal-marker.glb's own longest half-extent (its capsule length, off the
// GLB's accessor bounds) — every node scales the shared mesh by node.r /
// this constant instead of baking node.r straight into a primitive.
const MARKER_UNIT_RADIUS = 0.17;

const HUB_NODES: Node[] = [
  { id: "toolkit", label: "kmp-toolkit", pos: [0, 0.4, 0], r: 0.34, color: "--color-signal", fallbackHex: "#3ddc84", url: "https://github.com/darkpandawarrior/kmp-toolkit", kind: "hub" },
  { id: "buildlogic", label: "kmp-build-logic", pos: [-2.3, -0.7, -0.4], r: 0.3, color: "--color-signal", fallbackHex: "#3ddc84", url: "https://github.com/darkpandawarrior/kmp-build-logic", kind: "hub" },
];

// Hand-placed stubs for the toolkit's own internal modules — these aren't
// registry projects, so they can't be derived the way the app nodes below are.
const MODULE_NODES: Node[] = [
  { id: "mvi", label: "mvi-core", pos: [-0.9, 1.7, 0.5], r: 0.14, color: "--color-signal-dim", fallbackHex: "#8ff0b4", kind: "module" },
  { id: "security", label: "security", pos: [-1.4, 1.1, -1], r: 0.14, color: "--color-signal-dim", fallbackHex: "#8ff0b4", kind: "module" },
  { id: "designsystem", label: "designsystem", pos: [0.2, -1.6, -0.8], r: 0.14, color: "--color-signal-dim", fallbackHex: "#8ff0b4", kind: "module" },
  { id: "feedback", label: "feedback", pos: [-0.6, -1.3, 0.9], r: 0.14, color: "--color-signal-dim", fallbackHex: "#8ff0b4", kind: "module" },
];

// Node placement layer only — which apps and edges exist comes from
// src/data/foundationGraph.ts (a pure module, no @react-three/* import), so
// this scene and the flat twin (FoundationGraph.tsx) read the exact same set
// without either dragging the other's dependency across the SSR boundary.
function appPosition(i: number, total: number): [number, number, number] {
  const angle = (i / total) * Math.PI * 2;
  return [Math.cos(angle) * 2.3, Math.sin(angle) * 1.15 + 0.15, Math.sin(angle * 1.7) * 0.55];
}

const APP_NODES: Node[] = FOUNDATION_APP_SLUGS.map((slug, i) => {
  const project = projects.find((p) => p.slug === slug)!;
  const url = project.links.find((l) => l.label === "GitHub")?.url ?? project.links[0]?.url;
  return {
    id: slug,
    label: project.name,
    pos: appPosition(i, FOUNDATION_APP_SLUGS.length),
    r: 0.26,
    color: "--color-probe",
    fallbackHex: "#5ee6ff",
    url,
    kind: "app",
  };
});

const NODES: Node[] = [...HUB_NODES, ...APP_NODES, ...MODULE_NODES];

const EDGES: [string, string][] = [
  ...FOUNDATION_APP_EDGES,
  ["toolkit", "mvi"],
  ["toolkit", "security"],
  ["toolkit", "designsystem"],
  ["toolkit", "feedback"],
];

const byId = Object.fromEntries(NODES.map((n) => [n.id, n]));

function Star({ node, active, dim, onHover }: { node: Node; active: boolean; dim: boolean; onHover: (id: string | null) => void }) {
  const mesh = useRef<Mesh>(null);
  const seed = useMemo(() => node.pos[0] * 7 + node.pos[1] * 3, [node]);
  // Resolve once per render, before the `${...}44` alpha concat below — a raw
  // token name there would produce "--color-signal44" and kill the border.
  const hex = readToken(node.color, node.fallbackHex);
  // The shared faceted hex-capsule marker (scripts/blender/signal-marker.py) —
  // one GLTFLoader fetch/parse cached across this scene, StoryMapScene and
  // SkillsOrbitScene (useLoader caches by URL). Geometry only: the tinting,
  // hover-swell and dim/active material logic below is unchanged — the GLB
  // ships one neutral mesh, this scene's own meshStandardMaterial still does
  // the per-node colouring.
  const marker = useStudioModel("signal-marker");
  const geometry = (marker.scene.children[0] as Mesh)?.geometry;
  // The marker's own longest half-extent (measured off the exported GLB,
  // scripts/blender/signal-marker.py) — nodes used to size a bare
  // sphereGeometry directly by `node.r`; the shared GLB is a fixed authored
  // size, so it scales up/down by this ratio to land at the same `node.r`
  // instead.
  const restScale = node.r / MARKER_UNIT_RADIUS;

  useFrame(({ clock }, delta) => {
    const m = mesh.current;
    if (!m) return;
    const t = clock.elapsedTime;
    // Each star breathes on its own phase; hovered stars swell. Bobbing and
    // scale live on the mesh alone now (group below carries node.pos), so
    // neither multiplies into the label's Html sibling.
    m.position.y = Math.sin(t * 0.7 + seed) * 0.08;
    const target = (active ? 1.5 : 1) * restScale;
    m.scale.setScalar(MathUtils.damp(m.scale.x, target, 6, delta));
  });

  return (
    <group
      position={node.pos}
      onPointerOver={(e) => { e.stopPropagation(); onHover(node.id); document.body.style.cursor = node.url ? "pointer" : "default"; }}
      onPointerOut={() => { onHover(null); document.body.style.cursor = "default"; }}
      onClick={(e) => { e.stopPropagation(); if (node.url) window.open(node.url, "_blank", "noreferrer"); }}
    >
      <mesh ref={mesh} scale={restScale}>
        {geometry ? <primitive object={geometry} attach="geometry" /> : <sphereGeometry args={[MARKER_UNIT_RADIUS, 24, 24]} />}
        <meshStandardMaterial
          color={hex}
          emissive={hex}
          emissiveIntensity={active ? .8 : .15}
          metalness={.4}
          roughness={.28}
          transparent
          opacity={dim ? 0.25 : 1}
        />
      </mesh>
      {(node.kind !== "module" || active) && (
        <Html center position={[0, -(node.r + 0.28), 0]} style={{ pointerEvents: "none" }}>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "11px",
              whiteSpace: "nowrap",
              // drei's <Html> renders real DOM, so var() works here — unlike the
              // r3f material props above.
              color: dim ? "color-mix(in srgb, var(--color-text) 30%, transparent)" : "var(--color-text)",
              background: "rgba(5,7,10,0.55)",
              padding: "2px 7px",
              borderRadius: "999px",
              border: `1px solid ${dim ? "rgba(36,48,41,0.5)" : hex}44`,
            }}
          >
            {node.label}
          </span>
        </Html>
      )}
    </group>
  );
}

function Graph() {
  const [hover, setHover] = useState<string | null>(null);

  const neighbourhood = useMemo(() => {
    if (!hover) return null;
    const set = new Set([hover]);
    for (const [a, b] of EDGES) {
      if (a === hover) set.add(b);
      if (b === hover) set.add(a);
    }
    return set;
  }, [hover]);

  return (
    <group>
      {EDGES.map(([a, b]) => {
        const lit = neighbourhood?.has(a) && neighbourhood?.has(b);
        return (
          <Line
            key={`${a}-${b}`}
            points={[byId[a].pos, byId[b].pos]}
            color={lit ? readToken("--color-signal", "#3ddc84") : readToken("--color-line", "#262e2b")}
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
      role="img"
      aria-label="3D constellation of the shared KMP libraries and the apps built on them — hover a node to trace a dependency, click to open its repo"
    >
      <SceneActivity />
      {/* enableDamping: see StoryMapScene.tsx's identical control block —
          the same enableDamping={false} config measurably failed to orbit
          there; kept consistent here since this is the same copy-pasted
          constellation-drag setup. */}
      <OrbitControls enablePan={false} enableZoom={false} enableDamping dampingFactor={0.12} minAzimuthAngle={-.6} maxAzimuthAngle={.6} minPolarAngle={1.15} maxPolarAngle={1.95} />
      <hemisphereLight args={["#e2f4ed", "#18251f", 1.5]} />
      <directionalLight position={[2, 4, 5]} intensity={2} />
      <pointLight position={[4, 4, 4]} intensity={8} color={readToken("--color-probe", "#5ee6ff")} />
      <pointLight position={[-4, -2, 3]} intensity={8} color={readToken("--color-signal", "#3ddc84")} />
      <Suspense fallback={null}>
        <Graph />
      </Suspense>
    </Canvas>
  );
}
