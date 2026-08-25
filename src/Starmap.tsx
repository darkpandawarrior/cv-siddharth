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
  /** Which season of the record to raise. null (the default) raises all of
   *  them. Out-of-season worlds keep their position and their state colour
   *  and lose their glow and their label — the sky is the same sky, so
   *  nothing re-instances and nothing moves when this changes. */
  season?: number | null;
}

// A world's position is its home system, pulled in tight, plus its own offset
// inside that system, spread out wide. These multipliers came from the data
// generator, not this file — they were tuned so the labels in Alpha Axmoiri
// (ten of the named worlds packed into one system) don't collide, and
// changing them here would silently undo that tuning.
// Exported, along with worldPosition below, so starmapIntegrity.test.ts
// asserts against the numbers the renderer actually uses instead of a copy of
// them. A copy is how a tuning constant drifts out from under its own test.
export const SYSTEM_SCALE = 0.82;
export const OFFSET_SCALE = 2.6;

export function worldPosition(world: StarWorld): [number, number, number] {
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

/** A named world's displayed state can differ from its data `st`: a world that
 *  carries an `at` (the Concluded count at which it was filed) renders as its
 *  pre-conclusion self — "lit", an open entry — until the counter reaches it,
 *  then flips to the grey, unlit `st` already baked into the data.
 *
 *  A world with no `at` is returned untouched at every position of the slider,
 *  and that is not an oversight for `withdrawn`, it is the whole mechanic: the
 *  Directory never held those records, so no count can ever reach them. Push
 *  the slider to 671 and the three scorch bodies are the last things burning. */
function effectiveState(world: StarWorld, concluded: number): string {
  if (world.at !== undefined && concluded < world.at) return "lit";
  return world.st;
}

/** Season, read off the reader key rather than stored. null is the furniture
 *  that belongs to the whole record instead of to one season (today: the
 *  ruin), which is always shown at full. A season four world is a world with
 *  `k: "4-3"` — no new field, no new branch, no generator change. */
export const seasonOf = (world: StarWorld): number | null => (world.k ? Number(world.k.split("-")[0]) : null);

// Exported so the integrity test can assert that every state in the data has
// a colour here, rather than against a second list that can fall behind.
export const STATE_COLOR: Record<string, string> = {
  lit: "#8FD3FF",
  open: "#7EE787",
  concluded: "#39424E",
  ruin: "#8A6A2F",
  self: "#D9A441",
  // Withdrawn: the page was burned by the only person holding it and the
  // world is still turning. Scorch, lifted from the plate renderer's SCORCH
  // (#7A4526, morkinstar-plates.mjs) and raised for an emissive body under
  // bloom. Measured 3.77:1 against the label chip's rgba(20,16,12,0.75)
  // ground — used only as a border and as a torus, both non-text, where the
  // WCAG floor is 3:1. It is never used for text.
  withdrawn: "#A85A38",
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
// Exported because the slider's ceiling is the field's population by
// construction, not by coincidence, and its floor is the count at s1-09.
// Both numbers are currently written out again in anthology.tsx.
export const FIELD_COUNT = 671;
export const CONCLUDED_START = 611;
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
// Every named world's label is always on — that's the whole point of a map
// versus a list — so what these three control is only how much it fades as
// the world recedes, never whether it's there. LABEL_NEAR is full opacity;
// past LABEL_FAR the label settles at LABEL_MIN_OPACITY and stays legible
// rather than continuing to fade toward invisible. World units, not pixels,
// same reasoning as the old fixed-reveal-radius this replaced: distance in
// the scene, not a fixed pixel size on screen.
const LABEL_NEAR = 200;
const LABEL_FAR = 750;
const LABEL_MIN_OPACITY = 0.5;

interface NamedWorldProps {
  world: StarWorld;
  concluded: number;
  hoveredName: string | null;
  onHover: (name: string | null) => void;
  onOpen: (key: string) => void;
  /** false when a season filter is on and this world belongs to another one. */
  inSeason: boolean;
}

function NamedWorld({ world, concluded, hoveredName, onHover, onOpen, inSeason }: NamedWorldProps): JSX.Element {
  const position = useMemo(() => worldPosition(world), [world]);
  const state = effectiveState(world, concluded);
  const dark = state === "concluded";
  const color = STATE_COLOR[state] ?? STATE_COLOR.lit;
  const isHovered = hoveredName === world.n;
  const key = world.k;
  const withdrawn = state === "withdrawn";
  // Lowered, never removed: a filtered world keeps its position and its state
  // colour so the sky does not change shape, and stays clickable.
  const glow = dark ? 0 : !inSeason ? 0.2 : isHovered ? 2.2 : withdrawn ? 1.3 : 1.1;

  const meshRef = useRef<Mesh>(null);
  const [opacity, setOpacity] = useState(1);
  useFrame(({ camera }) => {
    const mesh = meshRef.current;
    // Nothing to fade when the label is not mounted, and skipping the work is
    // the whole reason the season filter unmounts it rather than hiding it.
    if (!mesh || !inSeason) return;
    const distance = camera.position.distanceTo(mesh.position);
    const raw = 1 - (distance - LABEL_NEAR) / (LABEL_FAR - LABEL_NEAR);
    const eased = Math.min(1, Math.max(LABEL_MIN_OPACITY, raw));
    // Quantized to 5% steps and only committed on an actual change: with a
    // label per named world running this every frame, setState on every
    // fractional wobble would be one re-render per world per frame for a fade
    // nobody can see the difference of at that resolution.
    // ponytail: one useFrame per world, hoist to a single imperative loop in
    // Scene writing el.style.opacity if a trace shows >16ms frames. Measure
    // first — at 24 worlds this has not been shown to cost anything.
    const quantized = Math.round(eased * 20) / 20;
    if (quantized !== opacity) setOpacity(quantized);
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
      ) : withdrawn ? (
        // The exact inverse of a ruin, and the inversion is the point. A ruin
        // is hollow because nothing is left of either the world or the record.
        // A withdrawn world is emphatically solid — the graves still point,
        // the blind fish still turn toward the door — and what is missing is
        // the record, drawn as a pin with nothing joining it to anything.
        // s3-10: "the six pins with nothing behind them ... meaning six
        // positions and nothing else, forever."
        <>
          <sphereGeometry args={[NAMED_RADIUS, 20, 16]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={glow} />
          <mesh rotation={[Math.PI / 2.6, 0, 0]}>
            <torusGeometry args={[NAMED_RADIUS * 1.9, 0.35, 8, 40]} />
            <meshBasicMaterial color={color} transparent opacity={inSeason ? 0.35 : 0.12} />
          </mesh>
        </>
      ) : (
        <>
          <sphereGeometry args={[NAMED_RADIUS, 20, 16]} />
          <meshStandardMaterial
            color={color}
            emissive={dark ? "#000000" : color}
            // A dark world loses its glow entirely rather than just dimming —
            // "filed" is meant to read as off, not as quieter.
            emissiveIntensity={glow}
          />
        </>
      )}

      {/* Always mounted — a map where you have to hover every world to find
          out what it's called isn't a map. Opacity (not presence) is what
          fades with distance, and hover pins it back to full regardless of
          how far the world has receded. The name is always readable; `d`
          joins it only on hover, so the twenty labels a reader sees at once
          stay to one line each instead of a paragraph pile. Text colour is
          fixed to the theme foreground rather than the world's state colour
          on purpose: `concluded` worlds are a near-black grey, and a label
          in that colour on this canvas would be unreadable exactly when the
          reader most wants to confirm a world went dark. The state colour
          still does its job on the sphere itself and on the label border.

          Out-of-season labels are not mounted rather than hidden. drei's Html
          runs its own projection every frame per instance, so this is the only
          per-frame saving a season filter buys; hiding them would keep paying
          for all of them. The mesh underneath stays clickable either way. */}
      {inSeason && (
        <Html
          center
          distanceFactor={120}
          position={[0, NAMED_RADIUS + 3, 0]}
          style={{ pointerEvents: key ? "auto" : "none", opacity: isHovered ? 1 : opacity }}
        >
          {key ? (
            <button
              type="button"
              onClick={() => onOpen(key)}
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "11px",
                whiteSpace: "nowrap",
                cursor: "pointer",
                // A withdrawn world's name is the one label on this map that is
                // not intact, so it reads at the same weight as the `d` gloss
                // rather than as body text. var(--color-muted) on the chip
                // ground measures 5.91:1 in the default theme and 6.65:1 in
                // ink, both past the 4.5:1 floor for 11px text.
                color: withdrawn ? "var(--color-muted)" : "var(--color-text)",
                background: "rgba(20,16,12,0.75)",
                padding: "3px 10px",
                borderRadius: "999px",
                // Dashed, not a different colour: the border is already the
                // state colour, and a broken outline is what "this record is
                // not intact" looks like at 11px. Full alpha rather than the
                // 0.53 the other states use, because scorch is a dark hue: at
                // 0.53 over this chip it measures 1.89:1 and at 1.0 it measures
                // 3.77:1, and 3:1 is the floor for a non-text boundary.
                border: `1px ${withdrawn ? "dashed" : "solid"} ${withAlpha(color, withdrawn ? 1 : 0.53)}`,
              }}
            >
              {world.n}
              {isHovered && <span style={{ color: "var(--color-muted)", marginLeft: 6, fontSize: "10.5px" }}>{world.d}</span>}
            </button>
          ) : (
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "11px",
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
// The fences: lines between named worlds, drawn from the data by name. Three
// of them today, one per reciprocal pair — s2-07's six fences are six aims
// along three axes, and drawing them as a closed hexagon (which this file used
// to do) says the six worlds are one circuit, when the whole horror is that
// each pair is a private two-hander neither side knows it is in.

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

function Scene({ concluded, onOpen, season = null }: StarmapProps): JSX.Element {
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
          // A world with no season belongs to the whole record rather than to
          // one part of it, so a filter never lowers it.
          inSeason={season === null || seasonOf(world) === null || seasonOf(world) === season}
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

export function Starmap({ concluded, onOpen, season = null }: StarmapProps): JSX.Element {
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <Canvas
        dpr={[1, 1.5]}
        camera={{ position: [0, 140, 420], fov: 50, near: 1, far: 3000 }}
        gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
        style={{ position: "absolute", inset: 0 }}
      >
        <Scene concluded={concluded} onOpen={onOpen} season={season} />
      </Canvas>
    </div>
  );
}
