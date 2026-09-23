import { Suspense } from "react";
import { SceneActivity } from "./SceneActivity.tsx";
import { Canvas } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import { skills } from "./data/profile.ts";
import { readToken } from "./themeColor";
import { useStudioModel } from "./three/models.ts";
import type { Mesh } from "three";

/**
 * The skill cloud as an orbiting word-sphere — every chip from the flat
 * cloud, distributed on a Fibonacci sphere, spinning slowly, draggable.
 * Clicking a word toggles that word's group filter (same state as the
 * buttons below). DOM labels via drei Html — house pattern, no font loading.
 */

// The two scene-token entries are resolved at call time (readToken, never a
// frozen module-scope literal) so they follow a theme swap like every other
// scene colour; the other three are their own categorical hues, untouched by
// the CAL-1/scene-token sweep.
const GROUP_COLOR_LITERAL: Record<string, string> = {
  "Platform & Systems": "#8ff0b4",
  "Security & Ops": "#f0883e",
  "Leadership & Process": "#c9a7ff",
};
function groupColor(group: string): string {
  if (group === "UI & Architecture") return readToken("--color-signal", "#3ddc84");
  if (group === "Concurrency & Data") return readToken("--color-probe", "#5ee6ff");
  return GROUP_COLOR_LITERAL[group] ?? readToken("--color-signal", "#3ddc84");
}

const WORDS = skills.flatMap((s) => s.items.map((item) => ({ item, group: s.group })));

// Fibonacci sphere: even spread without clumping at the poles.
const POINTS = WORDS.map((w, i) => {
  const n = WORDS.length;
  const y = 1 - (i / (n - 1)) * 2;
  const r = Math.sqrt(1 - y * y);
  const theta = i * Math.PI * (3 - Math.sqrt(5));
  const R = 2.35;
  return { ...w, pos: [Math.cos(theta) * r * R, y * R * 0.82, Math.sin(theta) * r * R] as [number, number, number] };
});

// signal-marker.glb's own longest half-extent — see FoundationGraphScene's
// identical constant for how it was measured.
const MARKER_UNIT_RADIUS = 0.17;
const MARKER_R = 0.05;

/** The shared faceted marker, one per skill point — cached across this
 *  scene, StoryMapScene and FoundationGraphScene (useLoader dedupes by URL). */
function SkillMarker({ pos, color }: { pos: [number, number, number]; color: string }) {
  const marker = useStudioModel("signal-marker");
  const geometry = (marker.scene.children[0] as Mesh)?.geometry;
  const scale = MARKER_R / MARKER_UNIT_RADIUS;
  return (
    <mesh position={pos} scale={scale}>
      {geometry ? <primitive object={geometry} attach="geometry" /> : <sphereGeometry args={[MARKER_UNIT_RADIUS, 12, 12]} />}
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} metalness={0.4} roughness={0.3} />
    </mesh>
  );
}

/** The bevel-inset gem-cut icosphere core (scripts/blender/skills-core.py) —
 *  replaces the old faint wireframe sphereGeometry(2.35,18,12) anchor. Its
 *  own studio-orbit.py materials ship baked into the GLB, so this renders
 *  the loaded scene as-is rather than overriding a material. */
function SkillsCore() {
  const { scene } = useStudioModel("skills-core");
  return <primitive object={scene} />;
}

function Orbit({ active, onSelect, onSelectItem }: { active: string | null; onSelect: (group: string) => void; onSelectItem?: (item: string) => void }) {
  return (
    <group>
      <Suspense fallback={null}>
        <SkillsCore />
      </Suspense>
      {POINTS.map((p) => {
        const color = groupColor(p.group);
        const dim = active !== null && active !== p.group;
        return (
          <group key={p.item}>
            <Suspense fallback={null}>
              <SkillMarker pos={p.pos} color={color} />
            </Suspense>
            <Html position={p.pos} center distanceFactor={6.5} zIndexRange={[10, 0]}>
              <button
                onClick={() => { onSelect(p.group); onSelectItem?.(p.item); }}
                title={p.group}
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "12px",
                  whiteSpace: "nowrap",
                  cursor: "pointer",
                  color: dim ? "rgba(232,239,233,0.22)" : "#e8efe9",
                  background: dim ? "rgba(5,7,10,0.35)" : "rgba(5,7,10,0.6)",
                  padding: "3px 9px",
                  borderRadius: "999px",
                  border: `1px solid ${dim ? "rgba(36,48,41,0.4)" : `${color}66`}`,
                  transition: "color 0.25s, border-color 0.25s, background 0.25s",
                }}
              >
                {p.item}
              </button>
            </Html>
          </group>
        );
      })}
    </group>
  );
}

export default function SkillsOrbitScene({ active, onSelect, onSelectItem }: { active: string | null; onSelect: (group: string) => void; onSelectItem?: (item: string) => void }) {
  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ position: [0, 0, 5.6], fov: 45 }}
      gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
      style={{ position: "absolute", inset: 0 }}
      role="img"
      aria-label="3D orbit of every skill, grouped by category — drag to rotate, click a skill to filter"
    >
      <SceneActivity />
      <OrbitControls enablePan={false} enableZoom={false} enableDamping={false} />
      <Orbit active={active} onSelect={onSelect} onSelectItem={onSelectItem} />
    </Canvas>
  );
}
