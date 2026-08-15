import { useMemo, useRef, useState, type JSX } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html, Instance, Instances, Line, OrbitControls, PerformanceMonitor } from "@react-three/drei";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import type { Mesh } from "three";
import { anthology } from "./data/anthology.ts";
import type { StarWorld } from "./data/anthology.ts";

/**
 * The starmap — every world the Journals ever named, plus the anonymous field
 * around them, rendered as one 3D sky rather than a list.
 *
 * The point of the whole component is the time axis: `concluded` (611..671)
 * is the count of Directory entries that have been filed, and exactly that
 * many of the 671 background worlds render dark. The number on screen equals
 * the number of lights out — this is a counter you can watch, not a decoration.
 */

export interface StarmapProps {
  /** How many of the 671 field worlds — and any named world whose `at` has
   *  been reached — are filed and dark. 611..671. */
  concluded: number;
  /** Called with a world's reader key ("season-idx") when a clickable named
   *  world is opened. */
  onOpen: (key: string) => void;
}

// A world's position is its home system, pulled in tight, plus its own offset
// inside that system, spread out wide. These multipliers came from the data
// generator, not this file — they were tuned so the labels in Alpha Axmoiri
// (ten of the twenty named worlds packed into one system) don't collide, and
// changing them here would silently undo that tuning.
const SYSTEM_SCALE = 0.82;
const OFFSET_SCALE = 2.6;

function worldPosition(world: StarWorld): [number, number, number] {
  const system = anthology.starmap.systems[world.s];
  // The generator guarantees every world's `s` is a real key in `systems`.
  // Throwing here instead of falling back to the origin means a broken build
  // of anthology.ts fails loudly in dev rather than quietly stacking worlds
  // on top of each other in production.
  if (!system) throw new Error(`Starmap: "${world.n}" points at an unknown system "${world.s}".`);
  const [sx, sy, sz] = system;
  const [ox, oy, oz] = world.o;
  return [sx * SYSTEM_SCALE + ox * OFFSET_SCALE, sy * SYSTEM_SCALE + oy * OFFSET_SCALE, sz * SYSTEM_SCALE + oz * OFFSET_SCALE];
}

/** A named world's displayed state can differ from its data `st`: two worlds
 *  carry an `at` (the Concluded count at which they were filed) and render as
 *  their pre-conclusion selves — "lit", an open entry — until the counter
 *  reaches it, then flip to the grey, unlit `st` already baked into the data. */
function effectiveState(world: StarWorld, concluded: number): string {
  if (world.at !== undefined && concluded < world.at) return "lit";
  return world.st;
}

const STATE_COLOR: Record<string, string> = {
  lit: "#8FD3FF",
  open: "#7EE787",
  concluded: "#39424E",
  ruin: "#8A6A2F",
  self: "#D9A441",
};

/** Six-digit hex to rgba(), for the label borders.
 *
 *  These used to append two alpha digits straight onto the colour string, which
 *  is why themeConcat.test.ts failed on this file. That guard exists because appending
 *  alpha digits to a colour is silently wrong the moment the colour is a CSS
 *  variable: `var(--x)88` is not a colour, it is nothing, and it fails at
 *  runtime rather than at build. The label styles here legitimately read
 *  `var(--color-text)` from the theme, so the file is exactly the mix the guard
 *  is looking for. Going through rgba() removes the pattern instead of dodging
 *  the test, and keeps the borders correct if a state colour is ever tokenised. */
function withAlpha(hex: string, alpha: number): string {
  const v = hex.replace("#", "");
  const n = Number.parseInt(v, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

// ---------------------------------------------------------------------------
// The anonymous field: 671 background worlds, one of which goes dark on every
// filed entry.

const FIELD_SEED = 20260815;
const FIELD_COUNT = 671;
const FIELD_RADIUS_MIN = 240;
const FIELD_RADIUS_MAX = 800;
const FIELD_Y_SQUASH = 0.6;
const FIELD_LIT_COLOR = "#c9d6e3";

/** A tiny deterministic PRNG (Numerical Recipes' LCG constants) so the sky is
 *  the same sky on every render. Math.random() would reshuffle all 671 points
 *  on every remount, and the entire point of a "field" — as opposed to a
 *  particle effect — is that it's a fixed sky you can watch go dark. */
function makeLcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function generateField(seed: number, count: number): [number, number, number][] {
  const rand = makeLcg(seed);
  const points: [number, number, number][] = [];
  for (let i = 0; i < count; i++) {
    // Uniform points on a sphere shell (not a cube or a naive lat/long grid,
    // which would clump at the poles), then flatten the shell on y so the
    // field reads as a wide sky rather than a ball around the camera.
    const theta = rand() * Math.PI * 2;
    const phi = Math.acos(2 * rand() - 1);
    const radius = FIELD_RADIUS_MIN + rand() * (FIELD_RADIUS_MAX - FIELD_RADIUS_MIN);
    points.push([
      radius * Math.sin(phi) * Math.cos(theta),
      radius * Math.cos(phi) * FIELD_Y_SQUASH,
      radius * Math.sin(phi) * Math.sin(theta),
    ]);
  }
  return points;
}

function FieldStars({ concluded }: { concluded: number }) {
  // Computed once and never again: the seed and count never change, so this
  // array is stable for the component's whole life regardless of how many
  // times `concluded` re-renders it.
  const points = useMemo(() => generateField(FIELD_SEED, FIELD_COUNT), []);

  return (
    // The single most important performance decision in this file. 671
    // separate <mesh> instances would be 671 draw calls before a single named
    // world or fence line gets drawn; <Instances>/<Instance> collapses all of
    // them into one instanced draw call, with per-instance colour carried on
    // the instanceColor buffer instead of 671 individual materials.
    // frames={1}: the field is static, so there is nothing to recompute after
    // mount — except that this component function re-runs whenever `concluded`
    // changes, which resets the internal frame counter and produces exactly
    // one fresh recompute per change. That is the re-render the brief asks
    // for, and no more.
    <Instances limit={FIELD_COUNT} range={FIELD_COUNT} frames={1}>
      <sphereGeometry args={[1.4, 6, 6]} />
      <meshBasicMaterial vertexColors toneMapped={false} />
      {points.map((position, i) => (
        // A field world goes dark once `concluded` has passed its index —
        // the count on screen and the number of dark points here are the
        // same number by construction, not by coincidence.
        <Instance key={i} position={position} color={i < concluded ? STATE_COLOR.concluded : FIELD_LIT_COLOR} />
      ))}
    </Instances>
  );
}

// ---------------------------------------------------------------------------
// The named worlds.

const NAMED_RADIUS = 3.4;
// World units, not pixels — roughly where the field shell begins, so labels
// surface as the reader crosses from "looking at the whole sky" into "looking
// at one cluster", instead of appearing at some fixed pixel radius on screen.
const LABEL_DISTANCE = 260;

interface NamedWorldProps {
  world: StarWorld;
  concluded: number;
  hoveredName: string | null;
  onHover: (name: string | null) => void;
  onOpen: (key: string) => void;
}

function NamedWorld({ world, concluded, hoveredName, onHover, onOpen }: NamedWorldProps): JSX.Element {
  const position = useMemo(() => worldPosition(world), [world]);
  const state = effectiveState(world, concluded);
  const dark = state === "concluded";
  const color = STATE_COLOR[state] ?? STATE_COLOR.lit;
  const isHovered = hoveredName === world.n;
  const key = world.k;

  const meshRef = useRef<Mesh>(null);
  const [near, setNear] = useState(false);
  useFrame(({ camera }) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    // Toggled, not stored raw: setState only fires on the frame the reader
    // actually crosses the threshold, not on every one of the ~60 frames a
    // second they spend on either side of it.
    const isNear = camera.position.distanceTo(mesh.position) < LABEL_DISTANCE;
    if (isNear !== near) setNear(isNear);
  });

  return (
    <mesh
      ref={meshRef}
      position={position}
      onPointerOver={(e) => {
        e.stopPropagation();
        onHover(world.n);
        if (key) document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        onHover(null);
        document.body.style.cursor = "default";
      }}
      onClick={(e) => {
        if (!key) return;
        e.stopPropagation();
        onOpen(key);
      }}
    >
      {state === "ruin" ? (
        // Ruins are outline-only: the one world in the data that was never
        // filed and never will be gets no fill, no glow — just a wire ghost.
        <>
          <sphereGeometry args={[NAMED_RADIUS, 12, 8]} />
          <meshBasicMaterial color={color} wireframe />
        </>
      ) : (
        <>
          <sphereGeometry args={[NAMED_RADIUS, 20, 16]} />
          <meshStandardMaterial
            color={color}
            emissive={dark ? "#000000" : color}
            // A dark world loses its glow entirely rather than just dimming —
            // "filed" is meant to read as off, not as quieter.
            emissiveIntensity={dark ? 0 : isHovered ? 2.2 : 1.1}
          />
        </>
      )}

      {(near || isHovered) && (
        <Html center distanceFactor={120} position={[0, NAMED_RADIUS + 3, 0]} style={{ pointerEvents: key ? "auto" : "none" }}>
          {key ? (
            <button
              type="button"
              onClick={() => onOpen(key)}
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "12px",
                whiteSpace: "nowrap",
                cursor: "pointer",
                color: "var(--color-text)",
                background: "rgba(20,16,12,0.75)",
                padding: "3px 10px",
                borderRadius: "999px",
                border: `1px solid ${withAlpha(color, 0.53)}`,
              }}
            >
              {world.n}
              {isHovered && <span style={{ color: "var(--color-muted)", marginLeft: 6, fontSize: "10.5px" }}>{world.d}</span>}
            </button>
          ) : (
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "12px",
                whiteSpace: "nowrap",
                color: "var(--color-text)",
                background: "rgba(20,16,12,0.6)",
                padding: "3px 10px",
                borderRadius: "999px",
                border: `1px solid ${withAlpha(color, 0.33)}`,
              }}
            >
              {world.n}
              {isHovered && <span style={{ color: "var(--color-muted)", marginLeft: 6, fontSize: "10.5px" }}>{world.d}</span>}
            </span>
          )}
        </Html>
      )}
    </mesh>
  );
}

// ---------------------------------------------------------------------------
// The fences: six lines between named worlds, drawn from the data by name.

function Fences(): JSX.Element {
  const worldByName = useMemo(() => new Map(anthology.starmap.worlds.map((w) => [w.n, w])), []);
  return (
    <>
      {anthology.starmap.fences.map(([a, b]) => {
        const wa = worldByName.get(a);
        const wb = worldByName.get(b);
        // The generator only ever writes fence pairs it also wrote worlds
        // for, so this should never trigger — it exists so a future edit to
        // the source data fails as a missing line, not a thrown render.
        if (!wa || !wb) return null;
        return (
          <Line
            key={`${a}-${b}`}
            points={[worldPosition(wa), worldPosition(wb)]}
            color="#c9932f"
            lineWidth={1}
            dashed
            dashSize={4}
            gapSize={3}
            transparent
            opacity={0.32}
          />
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------------------

function Scene({ concluded, onOpen }: StarmapProps): JSX.Element {
  const [hoveredName, setHoveredName] = useState<string | null>(null);
  const [quality, setQuality] = useState(true);
  // Read once at mount, same as every other 3D scene in this codebase — a
  // setting change mid-session getting a stale answer here is an acceptable
  // trade against re-checking matchMedia every render.
  const reducedMotion = useMemo(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches, []);

  return (
    <>
      <ambientLight intensity={0.45} />
      <pointLight position={[220, 280, 200]} intensity={1.6} color="#fff4da" />

      <FieldStars concluded={concluded} />
      <Fences />
      {anthology.starmap.worlds.map((world) => (
        <NamedWorld
          key={world.n}
          world={world}
          concluded={concluded}
          hoveredName={hoveredName}
          onHover={setHoveredName}
          onOpen={onOpen}
        />
      ))}

      <OrbitControls enableDamping enablePan={false} minDistance={90} maxDistance={900} autoRotate={!reducedMotion} autoRotateSpeed={0.12} regress />

      {/* drei's PerformanceMonitor is the useThree-backed fps regression
          system this scene needs — it already samples the render loop and
          debounces the verdict, so hand-rolling a second one on top of
          useThree(state => state.performance) would just be a worse copy. */}
      {!reducedMotion && <PerformanceMonitor onDecline={() => setQuality(false)} onIncline={() => setQuality(true)} />}
      {!reducedMotion && quality && (
        <EffectComposer>
          <Bloom luminanceThreshold={0.35} luminanceSmoothing={0.85} intensity={0.5} mipmapBlur />
        </EffectComposer>
      )}
    </>
  );
}

export function Starmap({ concluded, onOpen }: StarmapProps): JSX.Element {
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <Canvas
        dpr={[1, 1.5]}
        camera={{ position: [0, 140, 420], fov: 50, near: 1, far: 3000 }}
        gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
        style={{ position: "absolute", inset: 0 }}
      >
        <Scene concluded={concluded} onOpen={onOpen} />
      </Canvas>
    </div>
  );
}
