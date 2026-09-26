import { SceneActivity } from "./SceneActivity.tsx";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Line, Html, OrbitControls } from "@react-three/drei";
import { MathUtils, SphereGeometry, Vector3 } from "three";
import type { BufferGeometry, Mesh } from "three";
import { EDGES, NODES, type StoryNode } from "./StoryMap.tsx";
import { readToken } from "./themeColor";
import { useStudioModel } from "./three/models.ts";

// Used only if the GLB's named mesh is ever missing (a Blender export
// renaming it) — a node should never vanish for want of geometry.
const FALLBACK_GEOMETRY = new SphereGeometry(1, 24, 24);

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
  doori: 0.5,
  gaddi: -0.4,
  "paymentslab-kmp": 0.6,
  candidai: -0.3,
  stutter: 0.45,
  "sinc-p": -0.6,
  "kmp-family": 0.35,
  experience: -0.8,
  skills: 0.4,
  "the-loopdown": 0.7,
  books: -0.5,
  chat: 0.3,
};

const pos3 = (n: StoryNode): [number, number, number] => [
  (n.x - 0.5) * 11,
  (0.5 - n.y) * 5.8,
  DEPTH[n.id] ?? 0,
];

const byId = Object.fromEntries(NODES.map((n) => [n.id, n]));

// The hex-capsule's own half-height (signal-marker.py's HALF_BODY + CAP,
// 0.08 + 0.09) — the baseline the old sphere radius scaled against, kept so
// a node's `r` still reads as its footprint after swapping the geometry.
const MARKER_BASE = 0.17;

function Star({
  node,
  active,
  dim,
  collapsed,
  geometry,
  labelRef,
  onHover,
  onNavigate,
}: {
  node: StoryNode;
  active: boolean;
  dim: boolean;
  collapsed: boolean;
  geometry: BufferGeometry | undefined;
  labelRef: (id: string, el: HTMLElement | null) => void;
  onHover: (id: string | null) => void;
  onNavigate: (target: string) => void;
}) {
  const mesh = useRef<Mesh>(null);
  const base = useMemo(() => pos3(node), [node]);
  const seed = useMemo(() => node.x * 11 + node.y * 5, [node]);
  const r = node.r / 150; // 2D pixel radius → world units
  const markerScale = Math.max(r, 0.08) / MARKER_BASE;

  useFrame(({ clock }, delta) => {
    const m = mesh.current;
    if (!m) return;
    m.position.y = base[1] + Math.sin(clock.elapsedTime * 0.6 + seed) * 0.08;
    const s = MathUtils.damp(m.scale.x / markerScale, active ? 1.5 : 1, 6, delta);
    m.scale.setScalar(s * markerScale);
  });

  // A label the collision pass loses stays a bare marker (the mesh above)
  // until it is hovered — "collapses to a dot", never fully unmounted, so
  // it keeps a stable box to re-measure every pass.
  const showLabel = active || !collapsed;

  return (
    <mesh
      ref={mesh}
      position={base}
      scale={markerScale}
      geometry={geometry ?? FALLBACK_GEOMETRY}
      onPointerOver={(e) => { e.stopPropagation(); onHover(node.id); document.body.style.cursor = "pointer"; }}
      onPointerOut={() => { onHover(null); document.body.style.cursor = "default"; }}
      onClick={(e) => { e.stopPropagation(); document.body.style.cursor = "default"; onNavigate(node.target); }}
    >
      <meshStandardMaterial
        color={node.color}
        emissive={node.color}
        emissiveIntensity={active ? .75 : .12}
        metalness={.4}
        roughness={.28}
        transparent
        opacity={dim ? 0.22 : 1}
      />
      <Html center position={[0, -(Math.max(r, 0.08) + 0.26), 0]} style={{ pointerEvents: "none" }}>
        <span
          ref={(el) => labelRef(node.id, el)}
          data-story-node-label={node.id}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "11px",
            whiteSpace: "nowrap",
            // <Html> is real DOM — var() works here, unlike the r3f props below.
            color: dim ? "color-mix(in srgb, var(--color-text) 30%, transparent)" : "var(--color-text)",
            background: "rgba(5,7,10,0.55)",
            padding: "2px 7px",
            borderRadius: "999px",
            border: `1px solid ${dim ? "rgba(36,48,41,0.5)" : node.color}44`,
            // visibility, not display:none or unmount — a hidden label keeps
            // its layout box so the collision pass can re-measure it and
            // bring it back the moment its rival moves away.
            visibility: showLabel ? "visible" : "hidden",
          }}
        >
          {node.label}
          {node.sub && active && (
            <span style={{ color: `${node.color}cc`, marginLeft: 6, fontSize: "9.5px" }}>{node.sub}</span>
          )}
        </span>
      </Html>
    </mesh>
  );
}

// Hub labels always win; everything else falls in behind them ordered by
// radius (a bigger node's name matters more when two collide). ~150ms is
// slow enough that a visitor never sees a label flicker mid-drag, fast
// enough that the resolved set tracks an orbit in progress.
const ALWAYS_SHOWN = new Set(["sid", "work"]);
const COLLISION_INTERVAL_MS = 150;

function rectsOverlap(a: DOMRect, b: DOMRect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

/** Screen-space AABB overlap pass over every mounted label, run on an
 *  interval rather than every frame — text position is what changes (camera
 *  drag/orbit), and re-measuring 14-ish DOM rects at 60fps buys nothing a
 *  visitor could perceive.
 *  // ponytail: O(n²) pairwise-via-linear-scan below — fine at this node
 *  // count; a spatial index only earns its keep past ~50 nodes. */
function useLabelCollision(hoverRef: { current: string | null }) {
  const labels = useRef<Map<string, HTMLElement>>(new Map());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const labelRef = (id: string, el: HTMLElement | null) => {
    if (el) labels.current.set(id, el);
    else labels.current.delete(id);
  };

  useEffect(() => {
    const priority = [
      ...NODES.filter((n) => ALWAYS_SHOWN.has(n.id)),
      ...NODES.filter((n) => !ALWAYS_SHOWN.has(n.id)).sort((a, b) => b.r - a.r),
    ];
    const tick = () => {
      const hovered = hoverRef.current;
      const accepted: DOMRect[] = [];
      const next = new Set<string>();
      for (const n of priority) {
        const el = labels.current.get(n.id);
        if (!el) continue;
        if (ALWAYS_SHOWN.has(n.id) || n.id === hovered) {
          accepted.push(el.getBoundingClientRect());
          continue;
        }
        const rect = el.getBoundingClientRect();
        if (accepted.some((r) => rectsOverlap(r, rect))) next.add(n.id);
        else accepted.push(rect);
      }
      setCollapsed((prev) => {
        if (prev.size === next.size && [...prev].every((id) => next.has(id))) return prev;
        return next;
      });
    };
    const id = window.setInterval(tick, COLLISION_INTERVAL_MS);
    tick();
    return () => window.clearInterval(id);
  }, [hoverRef]);

  return { collapsed, labelRef };
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
      <meshBasicMaterial color={lit ? readToken("--color-signal", "#3ddc84") : readToken("--color-probe", "#5ee6ff")} transparent opacity={lit ? 1 : 0.5} />
    </mesh>
  );
}

function Constellation({ onNavigate }: { onNavigate: (target: string) => void }) {
  const [hover, setHover] = useState<string | null>(null);
  const hoverRef = useRef<string | null>(null);
  hoverRef.current = hover;
  const { collapsed, labelRef } = useLabelCollision(hoverRef);

  // Every project node clones the same shared marker mesh (models.ts's
  // useStudioModel dedupes the fetch/parse across this scene,
  // FoundationGraphScene and SkillsOrbitScene).
  const { scene: markerScene } = useStudioModel("signal-marker");
  const markerGeometry = useMemo(
    () => (markerScene.getObjectByName("SignalMarker") as Mesh | undefined)?.geometry,
    [markerScene],
  );

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
      {EDGES.map(([a, b], i) => {
        const lit = !!(neighbourhood?.has(a) && neighbourhood?.has(b));
        return (
          <group key={`${a}-${b}`}>
            <Line
              points={[pos3(byId[a]), pos3(byId[b])]}
              color={lit ? readToken("--color-signal", "#3ddc84") : readToken("--color-line", "#262e2b")}
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
          collapsed={collapsed.has(n.id)}
          geometry={markerGeometry}
          labelRef={labelRef}
          onHover={setHover}
          onNavigate={onNavigate}
        />
      ))}
    </group>
  );
}

export default function StoryMapScene({ onNavigate }: { onNavigate: (target: string) => void }) {
  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ position: [0, 0, 6.8], fov: 46 }}
      gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
      style={{ position: "absolute", inset: 0 }}
      // Decorative, same as its 2D twin (StoryMapCanvas, aria-hidden below
      // the fold in StoryMap.tsx): the chip row under the canvas is the real
      // keyboard/screen-reader path to every node, so this one hides rather
      // than duplicating a name for the same links.
      aria-hidden
    >
      <SceneActivity />
      {/* enableDamping (not false): every OTHER OrbitControls in this codebase
          that lets a visitor orbit-drag (Blueprint3D, Starmap) runs damped —
          this was the one exception, and a from-scratch measurement showed
          a 700px drag here moving the camera by roughly the same amount as
          its own idle-frame GPU noise, while the identical drag on
          Blueprint3D's damped controls visibly reorients the whole scene
          (e2e/studio-visuals.spec.ts: "dragging the map background orbits
          its nodes"). */}
      <OrbitControls enablePan={false} enableZoom={false} enableDamping dampingFactor={0.12} minAzimuthAngle={-.6} maxAzimuthAngle={.6} minPolarAngle={1.15} maxPolarAngle={1.95} />
      <hemisphereLight args={["#e2f4ed", "#18251f", 1.5]} />
      <directionalLight position={[2, 4, 5]} intensity={2} />
      <pointLight position={[4, 3, 4]} intensity={9} color={readToken("--color-probe", "#5ee6ff")} />
      <pointLight position={[-4, -2, 3]} intensity={9} color={readToken("--color-signal", "#3ddc84")} />
      {/* Suspense scoped to the marker fetch alone — lights/controls mount
          immediately, only the GLB-backed nodes wait on it. */}
      <Suspense fallback={null}>
        <Constellation onNavigate={onNavigate} />
      </Suspense>
    </Canvas>
  );
}
