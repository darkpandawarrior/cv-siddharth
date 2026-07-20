import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Float, Grid, Html, Lightformer, Line, OrbitControls, Sparkles, Stars, Trail } from "@react-three/drei";
import { Bloom, ChromaticAberration, EffectComposer, Glitch, Scanline, Vignette } from "@react-three/postprocessing";
import { BlendFunction, GlitchMode } from "postprocessing";
import * as THREE from "three";
import type { Mesh } from "three";
import type { Line2, LineSegments2, OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { ARROWS, COLOR_HEX, FRAMES, METRICS, NODES, NOTES, PINS, TOUR, centerOf, type NodeSpec } from "./blueprintData.ts";
import { CountUp, HoloCore, ShapeBoundary, hasWebGL } from "./blueprintShared.tsx";
import { AsciiEffect } from "./asciiEffect.ts";
import { RippleEffect } from "./rippleEffect.ts";

/* Custom Effect instances (anything not shipped by @react-three/postprocessing)
 * plug into <EffectComposer> as a <primitive>, per the library's documented
 * pattern for user-authored effects. */
const AsciiPass = forwardRef<AsciiEffect, { cellSize?: number; color?: string }>(function AsciiPass(
  { cellSize, color },
  ref,
) {
  const effect = useMemo(() => new AsciiEffect({ cellSize, color }), [cellSize, color]);
  return <primitive ref={ref} object={effect} dispose={null} />;
});

const RipplePass = forwardRef<RippleEffect>(function RipplePass(_props, ref) {
  const effect = useMemo(() => new RippleEffect(), []);
  const { size, pointer } = useThree();
  useFrame((_, delta) => {
    const u = effect.uniforms;
    u.get("uTime")!.value += delta;
    u.get("uAspect")!.value = size.width / size.height;
    // pointer is -1..1 with +y up; the shader wants 0..1 with +y up too.
    u.get("uMouse")!.value.set(pointer.x * 0.5 + 0.5, pointer.y * 0.5 + 0.5);
  });
  return <primitive ref={ref} object={effect} dispose={null} />;
});

/* The Blueprint Room's "Fly" view — the same seeded content as the tldraw
 * sketch board, laid out as an orbit-able three.js scene instead of a flat
 * whiteboard: nodes float as camera-facing cards at a depth per cluster,
 * arrows become flowing dashed lines, and a guided tour glides the camera
 * between chapters. Screenshots/notes/metrics render through drei's <Html
 * transform> so they stay crisp HTML while genuinely living in 3D space. */

const SCALE = 1 / 45;
const WORLD_CX = 1450;
const WORLD_CY = 900;

function toWorld(x: number, y: number, z = 0): [number, number, number] {
  return [(x - WORLD_CX) * SCALE, -(y - WORLD_CY) * SCALE, z];
}

function frameDepth(x: number, y: number): number {
  for (const f of FRAMES) {
    if (x >= f.x && x <= f.x + f.w && y >= f.y && y <= f.y + f.h) {
      if (f.key === "frame-work") return -5.5;
      if (f.key === "frame-writing") return 5.5;
      return 0;
    }
  }
  return 0;
}

// The "where does this 2D-space point live in the 3D scene" combo — every
// floating card, line endpoint and pin position goes through this.
function worldPosAt(x: number, y: number, extraZ = 0): [number, number, number] {
  return toWorld(x, y, frameDepth(x, y) + extraZ);
}

const OVERVIEW = { pos: new THREE.Vector3(3, 4, 27), look: new THREE.Vector3(0, 0, 0) };

function cloneOverview() {
  return { pos: OVERVIEW.pos.clone(), look: OVERVIEW.look.clone() };
}

function tourTarget3D(stopIndex: number): { pos: THREE.Vector3; look: THREE.Vector3 } | null {
  if (stopIndex < 0 || !TOUR[stopIndex]) return null;
  const [x, y, w, h] = TOUR[stopIndex].bounds;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const [wx, wy] = toWorld(cx, cy, 0);
  const z = frameDepth(cx, cy);
  const span = Math.max(w, h) * SCALE;
  const camDist = Math.max(span * 1.15, 7);
  return { pos: new THREE.Vector3(wx, wy, z + camDist), look: new THREE.Vector3(wx, wy, z) };
}

const MIN_DIST = 4;
const MAX_DIST = 60;

function CameraRig({
  tourStop,
  resetTick,
  zoomInTick,
  zoomOutTick,
  onZoomChange,
}: {
  tourStop: number;
  resetTick: number;
  zoomInTick: number;
  zoomOutTick: number;
  onZoomChange: (percent: number) => void;
}) {
  const controls = useRef<OrbitControlsImpl | null>(null);
  const target = useRef(cloneOverview());
  // Only the tour/reset flight actively drives the camera. It's true for the
  // duration of that flight and false otherwise, so free orbit/zoom/pan is
  // never fought by a lerp trying to pull the camera back to a stale target —
  // the bug that made the zoom buttons (and manual scroll-zoom/drag-orbit)
  // silently undo themselves within about a second.
  const transitioning = useRef(false);
  const lastResetTick = useRef(resetTick);
  const lastZoomIn = useRef(zoomInTick);
  const lastZoomOut = useRef(zoomOutTick);
  const lastReportedZoom = useRef(-1);

  useEffect(() => {
    target.current = tourTarget3D(tourStop) ?? cloneOverview();
    transitioning.current = true;
  }, [tourStop]);

  useEffect(() => {
    if (resetTick === lastResetTick.current) return;
    lastResetTick.current = resetTick;
    target.current = cloneOverview();
    transitioning.current = true;
  }, [resetTick]);

  // Zoom buttons drive the same dolly OrbitControls itself uses for scroll —
  // same math, so a button-click zoom and a scroll-wheel zoom feel identical.
  // Note: three-stdlib's dollyIn/dollyOut naming is the inverse of what it
  // sounds like — dollyIn(x>1) multiplies distance (zooms OUT); dollyOut(x>1)
  // divides it (zooms IN). Confirmed empirically, not just from reading the
  // source: the first version of this called dollyIn for "zoom in" and it
  // visibly zoomed out instead.
  useEffect(() => {
    if (zoomInTick === lastZoomIn.current) return;
    lastZoomIn.current = zoomInTick;
    controls.current?.dollyOut(1.35);
    controls.current?.update();
  }, [zoomInTick]);

  useEffect(() => {
    if (zoomOutTick === lastZoomOut.current) return;
    lastZoomOut.current = zoomOutTick;
    controls.current?.dollyIn(1.35);
    controls.current?.update();
  }, [zoomOutTick]);

  // The moment the user grabs the controls (drag, wheel, pinch), any in-flight
  // programmatic flight yields — their input is always authoritative.
  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    const stop = () => {
      transitioning.current = false;
    };
    c.addEventListener("start", stop);
    return () => c.removeEventListener("start", stop);
  }, []);

  // Reused every frame instead of `new THREE.Vector3()`-ing inside useFrame —
  // that runs 60x/second, so a fresh allocation there is a steady stream of
  // garbage for the collector instead of a one-time cost.
  const scratchDir = useRef(new THREE.Vector3());
  const scratchRight = useRef(new THREE.Vector3());
  const scratchMove = useRef(new THREE.Vector3());
  const scratchSway = useRef(new THREE.Vector3());
  const scratchLook = useRef(new THREE.Vector3());

  // WASD/arrow-key fly movement alongside orbit — this is a "Fly" mode, and
  // an orbit rig alone never lets you actually go somewhere new, just look
  // around one fixed point.
  const keys = useRef<Record<string, boolean>>({});
  useEffect(() => {
    const isTypingTarget = (el: EventTarget | null) =>
      el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
    const down = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      keys.current[e.key.toLowerCase()] = true;
      if ("wasdarrowup arrowdown arrowleft arrowright".includes(e.key.toLowerCase())) transitioning.current = false;
    };
    const up = (e: KeyboardEvent) => {
      keys.current[e.key.toLowerCase()] = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  useFrame((state, delta) => {
    if (transitioning.current && controls.current) {
      const t = 1 - Math.pow(0.0025, delta);
      state.camera.position.lerp(target.current.pos, t);
      controls.current.target.lerp(target.current.look, t);
      controls.current.update();
      if (state.camera.position.distanceTo(target.current.pos) < 0.02) transitioning.current = false;
    }

    if (!transitioning.current && controls.current) {
      const k = keys.current;
      const forward = k["w"] || k["arrowup"] ? 1 : k["s"] || k["arrowdown"] ? -1 : 0;
      const strafe = k["d"] || k["arrowright"] ? 1 : k["a"] || k["arrowleft"] ? -1 : 0;
      if (forward || strafe) {
        const speed = 9 * delta;
        const dir = state.camera.getWorldDirection(scratchDir.current);
        const right = scratchRight.current.crossVectors(dir, state.camera.up).normalize();
        const move = scratchMove.current.copy(dir).multiplyScalar(forward * speed).addScaledVector(right, strafe * speed);
        state.camera.position.add(move);
        controls.current.target.add(move);
        controls.current.update();
      }
    }
    // A small cursor-driven sway on the look-target — the "whole scene subtly
    // tilts toward the cursor" trick from award-winning WebGL sites. Nudging
    // the target (not the camera position) leaves zoom distance and orbit
    // angle alone, so it never fights the user's own control of the camera.
    if (controls.current && !transitioning.current) {
      const sway = scratchSway.current.set(state.pointer.x * 0.35, state.pointer.y * 0.2, 0);
      const lookAt = scratchLook.current.copy(target.current.look).add(sway);
      controls.current.target.lerp(lookAt, 0.03);
      controls.current.update();
    }
    // Report zoom as a 0-100% readout (tldraw shows the same thing in Sketch
    // mode) so switching modes doesn't lose that sense of "how far am I".
    const dist = state.camera.position.distanceTo(controls.current?.target ?? OVERVIEW.look);
    const percent = Math.round((1 - (dist - MIN_DIST) / (MAX_DIST - MIN_DIST)) * 100);
    if (Math.abs(percent - lastReportedZoom.current) >= 1) {
      lastReportedZoom.current = percent;
      onZoomChange(percent);
    }
  });

  return (
    <OrbitControls
      ref={controls}
      enableDamping
      dampingFactor={0.08}
      minDistance={MIN_DIST}
      maxDistance={MAX_DIST}
      minPolarAngle={0.15}
      maxPolarAngle={Math.PI * 0.85}
    />
  );
}

function FlowLine({ from, to, color }: { from: [number, number, number]; to: [number, number, number]; color: string }) {
  const ref = useRef<Line2 | LineSegments2>(null);
  useFrame((_, delta) => {
    const mat = ref.current?.material as { dashOffset?: number } | undefined;
    if (mat && typeof mat.dashOffset === "number") mat.dashOffset -= delta * 0.6;
  });
  return (
    <Line ref={ref} points={[from, to]} color={color} lineWidth={1.1} dashed dashSize={0.35} dashScale={1} gapSize={0.25} transparent opacity={0.55} />
  );
}

function FrameBackdrop({ frame }: { frame: (typeof FRAMES)[number] }) {
  const cx = frame.x + frame.w / 2;
  const cy = frame.y + frame.h / 2;
  const z = frameDepth(cx, cy) - 0.6;
  const w = frame.w * SCALE;
  const h = frame.h * SCALE;
  const [wx, wy] = toWorld(cx, cy, 0);
  const [lx, ly] = toWorld(frame.x + 24, frame.y - 12, 0);
  // A thin corner outline reads as a technical-drawing frame without a filled
  // plane's large flat area — which, under bloom, washes out as a glow blob.
  const corners: [number, number, number][] = [
    [wx - w / 2, wy - h / 2, z],
    [wx + w / 2, wy - h / 2, z],
    [wx + w / 2, wy + h / 2, z],
    [wx - w / 2, wy + h / 2, z],
    [wx - w / 2, wy - h / 2, z],
  ];
  return (
    <>
      <Line points={corners} color="#3ddc84" lineWidth={0.6} transparent opacity={0.2} />
      <Html position={[lx, ly, z + 0.15]} style={{ pointerEvents: "none" }}>
        <span className="whitespace-nowrap font-mono text-[11px] uppercase tracking-[0.3em] text-zinc-400/70">{frame.name}</span>
      </Html>
    </>
  );
}

/* The ASCII postprocess pass only sees the WebGL framebuffer — drei's <Html>
 * elements are a separate DOM overlay it can't touch. So "ascii mode" fakes
 * the terminal look on these cards directly (flat black/green, no glow, no
 * per-node color) instead of leaving them full-color and looking out of
 * place next to glyph-ified geometry. */
const TERMINAL_GREEN = "#3ddc84";

function NodeCard({ node, ascii }: { node: NodeSpec; ascii: boolean }) {
  const c = centerOf(node);
  const pos = worldPosAt(c.x, c.y);
  const color = ascii ? TERMINAL_GREEN : (COLOR_HEX[node.color] ?? "#3ddc84");
  return (
    <Float speed={1.4} rotationIntensity={0.12} floatIntensity={0.6}>
      <Html transform position={pos} distanceFactor={8} occlude="blending">
        <div
          style={{
            width: (node.w ?? 220) * 0.42,
            minHeight: (node.h ?? 90) * 0.42,
            padding: "10px 14px",
            borderRadius: ascii ? 0 : node.geo === "ellipse" ? 999 : 12,
            border: `1px solid ${color}`,
            background: "#000",
            boxShadow: ascii ? "none" : `0 0 22px -10px ${color}`,
            color: ascii ? TERMINAL_GREEN : "#e8efe9",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            lineHeight: 1.35,
            whiteSpace: "pre-line",
            textAlign: "center",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {node.label}
        </div>
      </Html>
    </Float>
  );
}

function MetricTile({ m, ascii }: { m: (typeof METRICS)[number]; ascii: boolean }) {
  // Note: frameDepth is intentionally keyed on the tile's origin (m.x, m.y),
  // not its shifted center — worldPosAt doesn't fit here without changing
  // which frame a tile near a boundary gets assigned to.
  const pos = toWorld(m.x + 100, m.y + 56, frameDepth(m.x, m.y) + 0.8);
  return (
    <Float speed={1.7} rotationIntensity={0.1} floatIntensity={0.7}>
      <Html transform position={pos} distanceFactor={8}>
        <div
          style={{
            width: 150,
            padding: "10px 16px",
            borderRadius: ascii ? 0 : 14,
            background: "#000",
            border: `1px solid ${ascii ? TERMINAL_GREEN : "rgba(61,220,132,0.4)"}`,
            boxShadow: ascii ? "none" : "0 0 30px -10px rgba(61,220,132,0.5)",
            fontFamily: "var(--font-mono)",
          }}
        >
          <div style={{ fontSize: 24, fontWeight: 700, color: TERMINAL_GREEN, lineHeight: 1.1 }}>
            <CountUp value={m.value} />
          </div>
          <div style={{ fontSize: 10, color: ascii ? "rgba(61,220,132,0.6)" : "rgba(232,239,233,0.6)", marginTop: 4 }}>{m.label}</div>
        </div>
      </Html>
    </Float>
  );
}

function StickyNote({ note, ascii }: { note: (typeof NOTES)[number]; ascii: boolean }) {
  const pos = toWorld(note.x + 100, note.y + 60, frameDepth(note.x, note.y) + 1.4);
  return (
    <Float speed={1.1} rotationIntensity={0.25} floatIntensity={0.8}>
      <Html transform position={pos} distanceFactor={8}>
        <div
          style={{
            width: 170,
            padding: 12,
            background: ascii ? "#000" : "#3a3208",
            color: ascii ? TERMINAL_GREEN : "#ffe8a3",
            border: ascii ? `1px solid ${TERMINAL_GREEN}` : "none",
            fontFamily: "var(--font-mono)",
            fontSize: 10.5,
            lineHeight: 1.4,
            borderRadius: ascii ? 0 : 4,
            boxShadow: ascii ? "none" : "0 8px 24px -8px rgba(0,0,0,0.6)",
            transform: "rotate(-1.5deg)",
          }}
        >
          {note.text}
        </div>
      </Html>
    </Float>
  );
}

function ImagePin({ pin, ascii }: { pin: (typeof PINS)[number]; ascii: boolean }) {
  const pos = toWorld(pin.x + pin.w / 2, pin.y + pin.h / 2, frameDepth(pin.x, pin.y) + 1.3);
  return (
    <Float speed={1} rotationIntensity={0.2} floatIntensity={0.5}>
      <Html transform position={pos} distanceFactor={8} rotation={[0, 0, pin.rot]}>
        {/* eslint-disable-next-line jsx-a11y/alt-text -- decorative moodboard pin, gif keeps animating (unlike a WebGL texture) */}
        <img
          src={pin.src}
          style={{
            width: pin.w * 0.5,
            borderRadius: ascii ? 0 : 10,
            border: `1px solid ${ascii ? TERMINAL_GREEN : "rgba(94,230,255,0.4)"}`,
            boxShadow: ascii ? "none" : "0 0 30px -8px rgba(94,230,255,0.5)",
            display: "block",
            // Fakes a monochrome-green terminal readout for a real screenshot —
            // there's no way to run an <img> through the WebGL ascii shader.
            filter: ascii ? "grayscale(1) brightness(1.1) sepia(1) hue-rotate(70deg) saturate(4)" : "none",
          }}
        />
      </Html>
    </Float>
  );
}

/* Five clicks on the hologram within 2.5s = LEGEND MODE — a hidden overdrive
 * state (bigger sparkles, comet trails, hotter glitch) for ~9s. Not
 * discoverable from the UI on purpose; it's a reward for poking at things. */
function useLegendMode() {
  const [legend, setLegend] = useState(false);
  const clicksRef = useRef<number[]>([]);
  const timeoutRef = useRef<number | undefined>(undefined);
  const trigger = () => {
    const now = performance.now();
    clicksRef.current = [...clicksRef.current.filter((t) => now - t < 4000), now];
    if (clicksRef.current.length >= 5) {
      clicksRef.current = [];
      setLegend(true);
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = window.setTimeout(() => setLegend(false), 9000);
    }
  };
  useEffect(() => () => window.clearTimeout(timeoutRef.current), []);
  return { legend, trigger };
}

function Comet({ color, radius, speed, tilt }: { color: string; radius: number; speed: number; tilt: number }) {
  const ref = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * speed;
    ref.current?.position.set(Math.cos(t) * radius, Math.sin(t * 0.6) * radius * 0.3 + tilt, Math.sin(t) * radius);
  });
  return (
    <Trail width={2.4} length={7} color={color} attenuation={(t) => t * t}>
      <mesh ref={ref}>
        <sphereGeometry args={[0.12, 8, 8]} />
        <meshBasicMaterial color={color} />
      </mesh>
    </Trail>
  );
}

// Effect props that never change — hoisted so they're allocated once instead
// of on every Scene re-render (tour/reset/zoom clicks all re-render Scene,
// none of them change these). New object references here would otherwise
// make @react-three/postprocessing think the effect chain's config changed
// on every click, which is exactly the kind of thing that turns a zoom
// button from "instant" into "has a hitch."
const GLITCH_DURATION = new THREE.Vector2(0.1, 0.3);
const CHROMATIC_OFFSET = new THREE.Vector2(0.0006, 0.0006);
const GLITCH_CHROMATIC_OFFSET = new THREE.Vector2(0.01, 0.01);

function Scene({
  tourStop,
  resetTick,
  zoomInTick,
  zoomOutTick,
  onZoomChange,
  ascii,
}: {
  tourStop: number;
  resetTick: number;
  zoomInTick: number;
  zoomOutTick: number;
  onZoomChange: (percent: number) => void;
  ascii: boolean;
}) {
  const byKey = useMemo(() => Object.fromEntries(NODES.map((n) => [n.key, n])), []);
  const { legend, trigger } = useLegendMode();
  // Only recomputed when legend actually flips, not on every tour/reset/zoom
  // re-render — see the note on the hoisted constants above.
  const asciiGlitchDelay = useMemo(() => (legend ? new THREE.Vector2(0.6, 1.5) : new THREE.Vector2(4, 10)), [legend]);
  const asciiGlitchStrength = useMemo(() => (legend ? new THREE.Vector2(0.3, 0.5) : new THREE.Vector2(0.1, 0.25)), [legend]);
  const glitchDelay = useMemo(() => (legend ? new THREE.Vector2(0.6, 1.5) : new THREE.Vector2(6, 14)), [legend]);
  const glitchStrength = useMemo(() => (legend ? new THREE.Vector2(0.15, 0.3) : new THREE.Vector2(0.05, 0.15)), [legend]);
  return (
    <>
      <color attach="background" args={["#05070a"]} />
      <fog attach="fog" args={["#05070a", 22, 58]} />
      <ambientLight intensity={0.5} />
      <pointLight position={[8, 8, 12]} intensity={22} color="#3ddc84" />
      <pointLight position={[-8, -4, 8]} intensity={16} color="#5ee6ff" />
      {/* Procedural env (not a fetched HDRI — a portfolio shouldn't depend on a
       * CDN being up) so the hologram's metallic material actually reflects
       * something instead of looking flat despite metalness={0.8}. */}
      <Environment resolution={256}>
        <Lightformer intensity={3} color="#3ddc84" position={[0, 4, -6]} scale={12} />
        <Lightformer intensity={2} color="#5ee6ff" position={[-6, 2, 4]} scale={9} />
        <Lightformer intensity={1.5} color="#b98bff" position={[6, -2, 3]} scale={7} />
      </Environment>
      <Stars radius={60} depth={30} count={2200} factor={2.2} saturation={0} fade speed={0.35} />
      <Sparkles
        count={legend ? 260 : 70}
        scale={legend ? [20, 14, 20] : [16, 11, 16]}
        size={legend ? 3.5 : 2}
        speed={legend ? 1.2 : 0.25}
        color="#5ee6ff"
        opacity={legend ? 0.8 : 0.4}
      />
      {legend && (
        <>
          <Comet color="#ffd866" radius={9} speed={0.9} tilt={2} />
          <Comet color="#5ee6ff" radius={12} speed={-0.6} tilt={-3} />
          <Comet color="#ff6b6b" radius={7} speed={1.3} tilt={0} />
          <Html fullscreen style={{ pointerEvents: "none" }}>
            <div className="flex h-full items-start justify-center pt-6">
              <span className="animate-pulse rounded-full border border-accent2/60 bg-black/70 px-4 py-1 font-mono text-xs uppercase tracking-[0.4em] text-accent2">
                legend mode
              </span>
            </div>
          </Html>
        </>
      )}
      <Grid
        position={[0, -13, 0]}
        args={[10, 10]}
        cellSize={1}
        cellThickness={0.4}
        cellColor="#123b28"
        sectionSize={5}
        sectionThickness={1}
        sectionColor="#3ddc84"
        fadeDistance={45}
        fadeStrength={1.4}
        infiniteGrid
      />
      {FRAMES.map((f) => (
        <FrameBackdrop key={f.key} frame={f} />
      ))}
      {ARROWS.map(([a, b, color]) => {
        const na = byKey[a];
        const nb = byKey[b];
        if (!na || !nb) return null;
        const ca = centerOf(na);
        const cb = centerOf(nb);
        return (
          <FlowLine
            key={`${a}-${b}`}
            from={worldPosAt(ca.x, ca.y)}
            to={worldPosAt(cb.x, cb.y)}
            color={COLOR_HEX[color] ?? "#3ddc84"}
          />
        );
      })}
      <group scale={1.9}>
        <HoloCore />
      </group>
      {/* Mesh raycasting for onClick here fights OrbitControls' own pointer
       * handling on the same canvas and never reliably fires — a plain Html
       * hotspot (same DOM-click mechanism every card/button in this scene
       * already uses) is the boring, working answer. */}
      <Html transform position={[0, 0, 0]} distanceFactor={8}>
        <div onClick={trigger} style={{ width: 340, height: 340, borderRadius: "50%", cursor: "pointer" }} title="???" />
      </Html>
      {NODES.map((n) => (
        <NodeCard key={n.key} node={n} ascii={ascii} />
      ))}
      {METRICS.map((m) => (
        <MetricTile key={m.key} m={m} ascii={ascii} />
      ))}
      {NOTES.map((note, i) => (
        <StickyNote key={i} note={note} ascii={ascii} />
      ))}
      {PINS.map((p) => (
        <ImagePin key={p.key} pin={p} ascii={ascii} />
      ))}
      <CameraRig
        tourStop={tourStop}
        resetTick={resetTick}
        zoomInTick={zoomInTick}
        zoomOutTick={zoomOutTick}
        onZoomChange={onZoomChange}
      />
      {ascii ? (
        // Ascii already fully stylizes the frame — piling Bloom/ChromaticAberration
        // on top just smears the glyphs. Glitch stays: a glyph grid glitching is
        // the single wackiest thing this whole room does.
        <EffectComposer multisampling={0}>
          <RipplePass />
          <AsciiPass cellSize={9} color="#3ddc84" />
          <Glitch mode={GlitchMode.SPORADIC} delay={asciiGlitchDelay} duration={GLITCH_DURATION} strength={asciiGlitchStrength} />
        </EffectComposer>
      ) : (
        // Bloom does the heavy lifting for the glow look. The rest are kept
        // deliberately subtle — ChromaticAberration/Scanline read as "blueprint
        // schematic on an old CRT" texture rather than a filter slapped on top,
        // and Glitch fires rarely (SPORADIC mode, long random delay) so it reads
        // as an occasional signal hiccup, not a constant distraction.
        <EffectComposer multisampling={0}>
          <RipplePass />
          <Bloom mipmapBlur luminanceThreshold={0.5} luminanceSmoothing={0.2} intensity={legend ? 0.6 : 0.4} radius={0.15} />
          <ChromaticAberration offset={CHROMATIC_OFFSET} radialModulation={true} modulationOffset={0.4} />
          <Scanline blendFunction={BlendFunction.OVERLAY} density={1.3} />
          <Glitch
            mode={GlitchMode.SPORADIC}
            delay={glitchDelay}
            duration={GLITCH_DURATION}
            strength={glitchStrength}
            chromaticAberrationOffset={GLITCH_CHROMATIC_OFFSET}
          />
          <Vignette eskil={false} offset={0.2} darkness={0.6} />
        </EffectComposer>
      )}
    </>
  );
}

const noWebGLFallback = (
  <div className="flex h-full flex-col items-center justify-center gap-2 bg-void px-6 text-center font-mono text-sm text-zinc-500">
    <p>This browser can't run the 3D fly-through (no WebGL).</p>
    <p>Switch to Sketch mode above to explore the whiteboard instead.</p>
  </div>
);

export default function Blueprint3D({
  tourStop,
  resetTick,
  zoomInTick = 0,
  zoomOutTick = 0,
  onZoomChange,
  ascii = false,
}: {
  tourStop: number;
  resetTick: number;
  zoomInTick?: number;
  zoomOutTick?: number;
  onZoomChange?: (percent: number) => void;
  ascii?: boolean;
}) {
  if (!hasWebGL()) return noWebGLFallback;
  return (
    <div className="absolute inset-0 bg-void">
      <ShapeBoundary fallback={noWebGLFallback}>
        <Canvas
          camera={{ position: [OVERVIEW.pos.x, OVERVIEW.pos.y, OVERVIEW.pos.z], fov: 50 }}
          dpr={[1, 1.5]}
          gl={{ antialias: true, powerPreference: "high-performance", failIfMajorPerformanceCaveat: false }}
        >
          <Scene
            tourStop={tourStop}
            resetTick={resetTick}
            zoomInTick={zoomInTick}
            zoomOutTick={zoomOutTick}
            onZoomChange={onZoomChange ?? (() => {})}
            ascii={ascii}
          />
        </Canvas>
      </ShapeBoundary>
    </div>
  );
}
