import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import {
  AssetRecordType,
  Box,
  HTMLContainer,
  Rectangle2d,
  ShapeUtil,
  Tldraw,
  createShapeId,
  toRichText,
  type Editor,
  type TLDefaultColorStyle,
  type TLShape,
  type TLShapePartial,
} from "tldraw";
import "tldraw/tldraw.css";
import { Canvas, useFrame } from "@react-three/fiber";
import type { Mesh } from "three";
import { ArrowLeft, Compass, Play, RotateCcw } from "lucide-react";
import { openChat } from "./FloatingChat.tsx";

/* Cheap one-shot WebGL capability probe. The 3D hologram shape only mounts a
 * three.js <Canvas> when this passes — otherwise it shows a static fallback,
 * so a machine without WebGL (or one that's exhausted its context budget after
 * repeated visits) never blanks the whole whiteboard. */
let webglOK: boolean | null = null;
function hasWebGL(): boolean {
  if (webglOK !== null) return webglOK;
  try {
    const c = document.createElement("canvas");
    webglOK = !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    webglOK = false;
  }
  return webglOK;
}

/* Local boundary so a crash *inside* a single custom shape (e.g. a lost WebGL
 * context in the hologram) can't propagate up and take the canvas down. */
class ShapeBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * The Blueprint Room — the portfolio as an infinite tldraw canvas, now with
 * custom shapes that most whiteboards never reach: live animated metric
 * tiles and a spinning three.js hologram, both first-class canvas citizens
 * you can drag, rotate and arrange like any sticky note. Cluster frames
 * zone the map, real app screenshots are pinned like a moodboard, and a
 * guided tour flies the camera between chapters. Everything persists
 * locally, so a visitor's rearrangements survive their next visit.
 */

/* ── Custom shapes: live metrics + a 3D hologram on the whiteboard ────── */

declare module "tldraw" {
  interface TLGlobalShapePropsMap {
    "sid-metric": { w: number; h: number; value: string; label: string };
    "sid-holo": { w: number; h: number };
  }
}
type MetricShape = TLShape<"sid-metric">;
type HoloShape = TLShape<"sid-holo">;

function CountUp({ value }: { value: string }) {
  const [text, setText] = useState("0");
  useEffect(() => {
    const m = /^(-?)(\d+)(.*)$/.exec(value);
    if (!m) {
      setText(value);
      return;
    }
    const [, sign, digits, suffix] = m;
    const target = parseInt(digits, 10);
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min((now - start) / 1200, 1);
      const eased = 1 - (1 - t) ** 3;
      setText(`${sign}${Math.round(target * eased)}${suffix}`);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{text}</>;
}

class MetricShapeUtil extends ShapeUtil<MetricShape> {
  static override type = "sid-metric" as const;

  getDefaultProps(): MetricShape["props"] {
    return { w: 200, h: 112, value: "95%", label: "metric" };
  }

  getGeometry(shape: MetricShape) {
    return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true });
  }

  component(shape: MetricShape) {
    return (
      <HTMLContainer
        style={{
          width: shape.props.w,
          height: shape.props.h,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 18px",
          borderRadius: 14,
          background: "rgba(11, 15, 13, 0.92)",
          border: "1px solid rgba(61, 220, 132, 0.4)",
          boxShadow: "0 0 30px -10px rgba(61, 220, 132, 0.5)",
          fontFamily: "var(--font-mono)",
        }}
      >
        <span style={{ fontSize: 30, fontWeight: 700, color: "#3ddc84", lineHeight: 1.1 }}>
          <CountUp value={shape.props.value} />
        </span>
        <span style={{ fontSize: 11, color: "rgba(232, 239, 233, 0.6)", marginTop: 4 }}>{shape.props.label}</span>
      </HTMLContainer>
    );
  }

  getIndicatorPath(shape: MetricShape) {
    const path = new Path2D();
    path.rect(0, 0, shape.props.w, shape.props.h);
    return path;
  }
}

function HoloCore() {
  const knot = useRef<Mesh>(null);
  const shell = useRef<Mesh>(null);
  useFrame((_, delta) => {
    if (knot.current) {
      knot.current.rotation.x += delta * 0.5;
      knot.current.rotation.y += delta * 0.7;
    }
    if (shell.current) shell.current.rotation.y -= delta * 0.25;
  });
  return (
    <>
      <ambientLight intensity={0.6} />
      <pointLight position={[3, 3, 3]} intensity={10} color="#3ddc84" />
      <pointLight position={[-3, -2, 2]} intensity={8} color="#5ee6ff" />
      <mesh ref={knot}>
        <torusKnotGeometry args={[0.85, 0.26, 110, 16]} />
        <meshStandardMaterial color="#0b0f0d" emissive="#3ddc84" emissiveIntensity={0.5} metalness={0.8} roughness={0.25} />
      </mesh>
      <mesh ref={shell}>
        <icosahedronGeometry args={[1.7, 1]} />
        <meshBasicMaterial color="#5ee6ff" wireframe transparent opacity={0.14} />
      </mesh>
    </>
  );
}

class HoloShapeUtil extends ShapeUtil<HoloShape> {
  static override type = "sid-holo" as const;

  getDefaultProps(): HoloShape["props"] {
    return { w: 300, h: 230 };
  }

  getGeometry(shape: HoloShape) {
    return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true });
  }

  component(shape: HoloShape) {
    const holoFallback = (
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          placeItems: "center",
          background: "radial-gradient(circle at 50% 40%, rgba(94,230,255,0.18), transparent 70%)",
          color: "rgba(94, 230, 255, 0.7)",
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          letterSpacing: 2,
          textTransform: "uppercase",
        }}
      >
        3D preview
      </div>
    );
    return (
      <HTMLContainer
        style={{
          width: shape.props.w,
          height: shape.props.h,
          borderRadius: 16,
          overflow: "hidden",
          background: "rgba(5, 7, 10, 0.9)",
          border: "1px solid rgba(94, 230, 255, 0.35)",
          boxShadow: "0 0 40px -12px rgba(94, 230, 255, 0.5)",
        }}
      >
        {hasWebGL() ? (
          <ShapeBoundary fallback={holoFallback}>
            <Canvas
              dpr={1}
              camera={{ position: [0, 0, 4.4], fov: 45 }}
              gl={{ antialias: true, alpha: true, powerPreference: "low-power", failIfMajorPerformanceCaveat: false }}
            >
              <HoloCore />
            </Canvas>
          </ShapeBoundary>
        ) : (
          holoFallback
        )}
        <span
          style={{
            position: "absolute",
            bottom: 8,
            left: 0,
            right: 0,
            textAlign: "center",
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            letterSpacing: 2,
            textTransform: "uppercase",
            color: "rgba(94, 230, 255, 0.7)",
          }}
        >
          live three.js — on the whiteboard
        </span>
      </HTMLContainer>
    );
  }

  getIndicatorPath(shape: HoloShape) {
    const path = new Path2D();
    path.rect(0, 0, shape.props.w, shape.props.h);
    return path;
  }
}

/* ── The seeded scene ─────────────────────────────────────────────────── */

const id = (s: string) => createShapeId(s);

type NodeSpec = {
  key: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
  geo?: "ellipse" | "rectangle" | "cloud" | "hexagon";
  color: TLDefaultColorStyle;
  fill?: "none" | "semi" | "solid" | "pattern";
  label: string;
};

const NODES: NodeSpec[] = [
  { key: "sid", x: 1150, y: 640, w: 300, h: 140, geo: "hexagon", color: "green", fill: "semi", label: "SID\nprototype → platform" },
  { key: "work", x: 300, y: 180, w: 260, h: 110, geo: "rectangle", color: "green", fill: "semi", label: "Case studies\nthe numbers" },
  { key: "gps", x: 60, y: 480, w: 220, h: 90, geo: "rectangle", color: "light-green", label: "GPS 50% → 95%" },
  { key: "crash", x: 100, y: 720, w: 220, h: 90, geo: "rectangle", color: "light-green", label: "-80% crashes" },
  { key: "compose", x: 60, y: 960, w: 240, h: 90, geo: "rectangle", color: "light-green", label: "92% Compose · 738k LOC" },
  { key: "mileway", x: 700, y: 1150, w: 260, h: 110, geo: "ellipse", color: "light-blue", fill: "semi", label: "Mileway\n5 platforms · offline AI" },
  { key: "kursi", x: 1250, y: 1260, w: 220, h: 100, geo: "ellipse", color: "light-blue", label: "Kursi\nlive web build" },
  { key: "paymentslab", x: 1800, y: 1150, w: 240, h: 100, geo: "ellipse", color: "light-blue", label: "PaymentsLab\ngateway lab" },
  { key: "toolkit", x: 1270, y: 1560, w: 260, h: 100, geo: "hexagon", color: "green", label: "kmp-toolkit\nshared foundation" },
  { key: "loopdown", x: 2050, y: 300, w: 280, h: 120, geo: "cloud", color: "violet", fill: "semi", label: "The Loopdown\nfield notes that tell stories" },
  { key: "sensors", x: 1720, y: 40, w: 230, h: 80, geo: "rectangle", color: "violet", label: "Sensors Who Lie" },
  { key: "court", x: 2450, y: 60, w: 240, h: 80, geo: "rectangle", color: "violet", label: "The Coroutine Court" },
  { key: "ghosts", x: 2520, y: 620, w: 280, h: 80, geo: "rectangle", color: "violet", label: "Ghosts In The Recomposition" },
  { key: "books", x: 2500, y: 950, w: 260, h: 110, geo: "cloud", color: "orange", fill: "semi", label: "Books Before Bros\nthe origin blog (2018–2020)" },
  { key: "chat", x: 1180, y: 120, w: 240, h: 100, geo: "ellipse", color: "light-blue", fill: "semi", label: "Ask my AI\nhas read all of this" },
];

const ARROWS: [string, string, TLDefaultColorStyle][] = [
  ["sid", "work", "green"],
  ["sid", "mileway", "light-blue"],
  ["sid", "kursi", "light-blue"],
  ["sid", "paymentslab", "light-blue"],
  ["sid", "loopdown", "violet"],
  ["sid", "chat", "light-blue"],
  ["work", "gps", "light-green"],
  ["work", "crash", "light-green"],
  ["work", "compose", "light-green"],
  ["gps", "sensors", "violet"],
  ["crash", "court", "violet"],
  ["compose", "ghosts", "violet"],
  ["sensors", "loopdown", "violet"],
  ["court", "loopdown", "violet"],
  ["ghosts", "loopdown", "violet"],
  ["books", "loopdown", "orange"],
  ["mileway", "toolkit", "green"],
  ["kursi", "toolkit", "green"],
  ["paymentslab", "toolkit", "green"],
  ["mileway", "sensors", "violet"],
];

// Cluster frames — named zones so the map reads like chapters.
const FRAMES = [
  { key: "frame-work", x: 0, y: 100, w: 640, h: 1020, name: "the work" },
  { key: "frame-builds", x: 620, y: 1080, w: 1520, h: 640, name: "the builds" },
  { key: "frame-writing", x: 1660, y: -40, w: 1220, h: 1180, name: "the writing" },
];

// Real screenshots pinned like a moodboard, slightly rotated.
const PINS = [
  { key: "pin-mileway", src: "/projects/mileway/screenshots/track_a_trip.gif", mime: "image/gif", animated: true, x: 660, y: 1290, w: 150, h: 320, rot: -0.06 },
  { key: "pin-kursi", src: "/projects/kursi/screenshots/home.gif", mime: "image/gif", animated: true, x: 1500, y: 1300, w: 150, h: 320, rot: 0.05 },
  { key: "pin-plab", src: "/projects/paymentslab/screenshots/lab_home_screen_catalog.png", mime: "image/png", animated: false, x: 2070, y: 1270, w: 150, h: 320, rot: -0.04 },
];

const METRICS = [
  { key: "m-gps", x: 340, y: 470, value: "95%", label: "gps accuracy — live count" },
  { key: "m-crash", x: 380, y: 715, value: "-80%", label: "production crashes" },
  { key: "m-mau", x: 620, y: 300, value: "50k+", label: "monthly active users" },
  { key: "m-compose", x: 340, y: 955, value: "92%", label: "jetpack compose of 738k loc" },
];

const NOTES: { x: number; y: number; color: TLDefaultColorStyle; text: string }[] = [
  { x: 620, y: 60, color: "yellow", text: "Every arrow is real: the writing grew out of the work, the apps share one foundation." },
  { x: 2100, y: 1400, color: "yellow", text: "This canvas is yours too — drag things, sketch, leave a note. It stays in your browser." },
  { x: 1500, y: 820, color: "yellow", text: "The tiles with counting numbers and the spinning hologram are live React + three.js — custom tldraw shapes." },
];

// Guided tour stops: bounds the camera flies between.
const TOUR: { title: string; bounds: [number, number, number, number] }[] = [
  { title: "the work", bounds: [0, 100, 700, 1020] },
  { title: "the builds", bounds: [620, 1080, 1520, 640] },
  { title: "the writing", bounds: [1660, -40, 1220, 1180] },
  { title: "live shapes", bounds: [950, 550, 900, 500] },
  { title: "everything", bounds: [-100, -100, 3000, 1900] },
];

function centerOf(n: NodeSpec) {
  return { x: n.x + (n.w ?? 220) / 2, y: n.y + (n.h ?? 90) / 2 };
}

function seed(editor: Editor) {
  const byKey = Object.fromEntries(NODES.map((n) => [n.key, n]));
  const shapes: TLShapePartial[] = [];

  for (const f of FRAMES) {
    shapes.push({ id: id(f.key), type: "frame", x: f.x, y: f.y, props: { w: f.w, h: f.h, name: f.name } });
  }

  for (const [a, b, color] of ARROWS) {
    const pa = centerOf(byKey[a]);
    const pb = centerOf(byKey[b]);
    shapes.push({
      id: id(`arrow-${a}-${b}`),
      type: "arrow",
      props: { start: { x: pa.x, y: pa.y }, end: { x: pb.x, y: pb.y }, color, dash: "dotted", size: "s" },
    });
  }

  for (const n of NODES) {
    shapes.push({
      id: id(n.key),
      type: "geo",
      x: n.x,
      y: n.y,
      props: {
        geo: n.geo ?? "rectangle",
        w: n.w ?? 220,
        h: n.h ?? 90,
        color: n.color,
        fill: n.fill ?? "none",
        dash: "draw",
        size: "s",
        font: "mono",
        richText: toRichText(n.label),
      },
    });
  }

  for (const m of METRICS) {
    shapes.push({ id: id(m.key), type: "sid-metric", x: m.x, y: m.y, props: { w: 200, h: 112, value: m.value, label: m.label } });
  }
  shapes.push({ id: id("holo"), type: "sid-holo", x: 1620, y: 560, props: { w: 300, h: 230 } });

  for (const [i, note] of NOTES.entries()) {
    shapes.push({ id: id(`note-${i}`), type: "note", x: note.x, y: note.y, props: { color: note.color, size: "s", font: "mono", richText: toRichText(note.text) } });
  }

  editor.createShapes(shapes);

  // Screenshot pins need assets first.
  for (const p of PINS) {
    const assetId = AssetRecordType.createId();
    editor.createAssets([
      AssetRecordType.create({
        id: assetId,
        type: "image",
        props: { src: p.src, w: p.w * 3, h: p.h * 3, mimeType: p.mime, name: p.key, isAnimated: p.animated },
      }),
    ]);
    editor.createShape({ id: id(p.key), type: "image", x: p.x, y: p.y, rotation: p.rot, props: { assetId, w: p.w, h: p.h } });
  }

  editor.zoomToFit({ animation: { duration: 400 } });
  editor.selectNone();
}

const shapeUtils = [MetricShapeUtil, HoloShapeUtil];

const PERSISTENCE_KEY = "sid-blueprint-room-v2";

/**
 * Wipe the locally-persisted whiteboard. tldraw keeps each `persistenceKey`
 * in its own IndexedDB database; if a stale or half-written snapshot is what's
 * blanking the canvas, deleting the DB and reloading rebuilds it from `seed()`.
 * We match defensively on name rather than hard-coding tldraw's internal
 * scheme, then reload.
 */
async function clearBlueprintPersistence(): Promise<void> {
  try {
    const anyIDB = indexedDB as IDBFactory & { databases?: () => Promise<{ name?: string }[]> };
    const dbs = (await anyIDB.databases?.()) ?? [];
    await Promise.all(
      dbs
        .map((d) => d.name)
        .filter((n): n is string => !!n && (/tldraw/i.test(n) || n.includes(PERSISTENCE_KEY)))
        .map(
          (name) =>
            new Promise<void>((resolve) => {
              const req = indexedDB.deleteDatabase(name);
              req.onsuccess = req.onerror = req.onblocked = () => resolve();
            }),
        ),
    );
  } catch {
    /* best effort — reload still gives the visitor a clean shot */
  }
}

/** Top-level recovery: if anything in the tldraw subtree throws, offer a way
 *  out instead of a dead blank screen. */
class RoomBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-void px-6 text-center">
        <p className="font-mono text-sm text-zinc-400">The Blueprint Room hit a snag loading your saved canvas.</p>
        <button
          onClick={async () => {
            await clearBlueprintPersistence();
            window.location.reload();
          }}
          className="flex items-center gap-2 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-ink transition hover:bg-accent-dim"
        >
          <RotateCcw size={15} /> Reset the canvas & reload
        </button>
        <a href="#top" className="text-sm text-zinc-500 transition hover:text-accent">
          ← Back to the portfolio
        </a>
      </div>
    );
  }
}

function BlueprintRoomInner() {
  const editorRef = useRef<Editor | null>(null);
  const [stop, setStop] = useState(-1);

  const tourNext = () => {
    const editor = editorRef.current;
    if (!editor) return;
    const next = (stop + 1) % TOUR.length;
    setStop(next);
    const [x, y, w, h] = TOUR[next].bounds;
    editor.zoomToBounds(new Box(x, y, w, h), { animation: { duration: 900 }, targetZoom: 1 });
  };

  // Re-seed in place: clear the current page, drop the persisted DB, reseed.
  // Recovers a blanked/half-loaded canvas without a full reload where possible.
  const resetCanvas = async () => {
    const editor = editorRef.current;
    if (editor) {
      try {
        const ids = [...editor.getCurrentPageShapeIds()];
        if (ids.length) editor.deleteShapes(ids);
        seed(editor);
        setStop(-1);
        return;
      } catch {
        /* fall through to the hard reset */
      }
    }
    await clearBlueprintPersistence();
    window.location.reload();
  };

  return (
    <div className="flex h-screen flex-col">
      <header className="z-10 border-b border-line bg-ink/90 backdrop-blur">
        <nav className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <a href="#top" className="flex items-center gap-2 text-sm text-zinc-400 transition hover:text-accent">
            <ArrowLeft size={16} /> <span className="hidden sm:inline">Back to portfolio</span>
          </a>
          <span className="hidden items-center gap-2 font-mono text-xs uppercase tracking-widest text-zinc-500 lg:flex">
            <Compass size={13} className="text-accent" /> The Blueprint Room — live shapes on an infinite canvas
          </span>
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={tourNext}
              className="flex items-center gap-1.5 rounded-full border border-accent2/40 px-3 py-1.5 text-sm font-semibold text-accent2 transition hover:border-accent2 hover:bg-accent2/10 sm:px-4"
            >
              <Play size={13} /> <span className="hidden sm:inline">{stop === -1 ? "guided tour" : `next: ${TOUR[(stop + 1) % TOUR.length].title}`}</span>
            </button>
            <button
              onClick={resetCanvas}
              title="Reset the canvas to its original layout"
              className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-sm font-semibold text-zinc-400 transition hover:border-accent hover:text-accent"
            >
              <RotateCcw size={13} /> <span className="hidden sm:inline">Reset</span>
            </button>
            <button
              onClick={() => openChat()}
              className="rounded-full bg-accent px-3 py-1.5 text-sm font-semibold text-ink transition hover:bg-accent-dim sm:px-4"
            >
              Ask <span className="hidden sm:inline">my AI</span>
            </button>
          </div>
        </nav>
      </header>
      <div className="relative min-h-0 flex-1">
        <Tldraw
          persistenceKey={PERSISTENCE_KEY}
          shapeUtils={shapeUtils}
          onMount={(editor) => {
            editorRef.current = editor;
            editor.user.updateUserPreferences({ colorScheme: "dark" });
            try {
              if (editor.getCurrentPageShapeIds().size === 0) seed(editor);
              else editor.zoomToFit();
            } catch {
              // A corrupt restore can throw here; a fresh seed is the recovery.
              try {
                seed(editor);
              } catch {
                /* the RoomBoundary / Reset button is the last resort */
              }
            }
          }}
        />
      </div>
    </div>
  );
}

export default function BlueprintRoom() {
  return (
    <RoomBoundary>
      <BlueprintRoomInner />
    </RoomBoundary>
  );
}
