import { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { MathUtils } from "three";
import type { Group } from "three";
import { skills } from "./data/profile.ts";
import { readToken } from "./themeColor";

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

function Orbit({ active, onSelect }: { active: string | null; onSelect: (group: string) => void }) {
  const group = useRef<Group>(null);
  const drag = useRef({ on: false, x: 0, vel: 0 });

  useFrame((_, delta) => {
    const g = group.current;
    if (!g) return;
    drag.current.vel = MathUtils.damp(drag.current.vel, 0, 2, delta);
    g.rotation.y += delta * 0.12 + drag.current.vel;
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
      {/* faint wire sphere anchoring the cloud */}
      <mesh>
        <sphereGeometry args={[2.35, 18, 12]} />
        <meshBasicMaterial color={readToken("--color-probe", "#5ee6ff")} wireframe transparent opacity={0.05} />
      </mesh>
      {POINTS.map((p) => {
        const color = groupColor(p.group);
        const dim = active !== null && active !== p.group;
        return (
          <Html key={p.item} position={p.pos} center distanceFactor={6.5} zIndexRange={[10, 0]}>
            <button
              onClick={() => onSelect(p.group)}
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
        );
      })}
    </group>
  );
}

export default function SkillsOrbitScene({ active, onSelect }: { active: string | null; onSelect: (group: string) => void }) {
  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ position: [0, 0, 5.6], fov: 45 }}
      gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
      style={{ position: "absolute", inset: 0 }}
      role="img"
      aria-label="3D orbit of every skill, grouped by category — drag to rotate, click a skill to filter"
    >
      <Orbit active={active} onSelect={onSelect} />
    </Canvas>
  );
}
