import { Component, Suspense, lazy, useState, type ReactNode } from "react";
import { ArrowLeft, Compass, Orbit, Pencil, Play, RotateCcw, Terminal, ZoomIn, ZoomOut } from "lucide-react";
import { openChat } from "./FloatingChat.tsx";
import { TOUR } from "./blueprintData.ts";
import { hasWebGL } from "./blueprintShared.tsx";
import { clearBlueprintPersistence } from "./blueprintPersistence.ts";

/**
 * The Blueprint Room — the portfolio as an infinite canvas, in three coupled
 * views over the same data (see blueprintData.ts). "Fly" and "ASCII" are a
 * three.js scene (Blueprint3D.tsx) you can orbit; "Sketch" is the original
 * tldraw whiteboard (SketchBoard.tsx) — draw, drag shapes, leave a note, and
 * it all persists locally. Both are lazy-loaded per mode: picking Fly never
 * downloads tldraw, picking Sketch never downloads three.js/postprocessing.
 */
const Blueprint3D = lazy(() => import("./Blueprint3D.tsx"));
const SketchBoard = lazy(() => import("./SketchBoard.tsx"));

/** Top-level recovery: if anything in the room throws, offer a way out
 *  instead of a dead blank screen. */
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

type Mode = "fly" | "ascii" | "sketch";

/* One entry per header toggle button, driving both the pill UI and the view
 * switch below — adding a mode (as ASCII did) means one array entry, not a
 * hand-copied button plus a new branch in the render switch. */
const MODES: { id: Mode; label: string; icon: typeof Orbit; needsWebGL: boolean; tagline: string; hint: string }[] = [
  { id: "fly", label: "Fly", icon: Orbit, needsWebGL: true, tagline: "a live 3D fly-through — drag to orbit, WASD to move", hint: "Fly through the room in 3D" },
  {
    id: "ascii",
    label: "ASCII",
    icon: Terminal,
    needsWebGL: true,
    tagline: "a real-time ASCII render — drag to orbit, WASD to move",
    hint: "The same room, rendered as glyphs",
  },
  { id: "sketch", label: "Sketch", icon: Pencil, needsWebGL: false, tagline: "an infinite sketch canvas", hint: "Draw, drag and leave notes on a 2D whiteboard" },
];

const loadingFallback = <div className="flex h-full items-center justify-center font-mono text-sm text-zinc-500">loading…</div>;

function BlueprintRoomInner() {
  const [mode, setMode] = useState<Mode>(() => (hasWebGL() ? "fly" : "sketch"));
  const [stop, setStop] = useState(-1);
  const [resetTick, setResetTick] = useState(0);
  const [zoomInTick, setZoomInTick] = useState(0);
  const [zoomOutTick, setZoomOutTick] = useState(0);
  const [zoomPercent, setZoomPercent] = useState(50);
  const activeMode = MODES.find((m) => m.id === mode) ?? MODES[0];

  // Each mode keeps its own camera; hopping modes shouldn't carry a stale tour stop.
  const setModeFresh = (m: Mode) => {
    setMode(m);
    setStop(-1);
  };

  const tourNext = () => setStop((s) => (s + 1) % TOUR.length);
  const resetView = () => {
    setStop(-1);
    setResetTick((t) => t + 1);
  };

  return (
    <div className="flex h-screen flex-col">
      <header className="z-10 border-b border-line bg-ink/90 backdrop-blur">
        <nav className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <a href="#top" className="flex items-center gap-2 text-sm text-zinc-400 transition hover:text-accent">
            <ArrowLeft size={16} /> <span className="hidden sm:inline">Back to portfolio</span>
          </a>
          <span className="hidden items-center gap-2 font-mono text-xs uppercase tracking-widest text-zinc-500 lg:flex">
            <Compass size={13} className="text-accent" /> The Blueprint Room — {activeMode.tagline}
          </span>
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex items-center rounded-full border border-line p-0.5 text-sm font-semibold">
              {MODES.map(({ id, label, icon: Icon, needsWebGL, hint }) => {
                const disabled = needsWebGL && !hasWebGL();
                return (
                  <button
                    key={id}
                    onClick={() => setModeFresh(id)}
                    disabled={disabled}
                    title={disabled ? "Needs WebGL — try Sketch mode" : hint}
                    className={`flex items-center gap-1.5 rounded-full px-3 py-1 transition disabled:cursor-not-allowed disabled:opacity-40 ${
                      mode === id ? "bg-accent text-ink" : "text-zinc-400 hover:text-accent"
                    }`}
                  >
                    <Icon size={13} /> <span className="hidden sm:inline">{label}</span>
                  </button>
                );
              })}
            </div>
            <button
              onClick={tourNext}
              className="flex items-center gap-1.5 rounded-full border border-accent2/40 px-3 py-1.5 text-sm font-semibold text-accent2 transition hover:border-accent2 hover:bg-accent2/10 sm:px-4"
            >
              <Play size={13} /> <span className="hidden sm:inline">{stop === -1 ? "guided tour" : `next: ${TOUR[(stop + 1) % TOUR.length].title}`}</span>
            </button>
            {mode !== "sketch" && (
              <div className="flex items-center rounded-full border border-line">
                <button
                  onClick={() => setZoomOutTick((t) => t + 1)}
                  title="Zoom out"
                  className="rounded-full p-2 text-zinc-400 transition hover:text-accent"
                >
                  <ZoomOut size={14} />
                </button>
                <button
                  onClick={() => setZoomInTick((t) => t + 1)}
                  title="Zoom in"
                  className="rounded-full p-2 text-zinc-400 transition hover:text-accent"
                >
                  <ZoomIn size={14} />
                </button>
              </div>
            )}
            <button
              onClick={resetView}
              title="Reset the camera and layout"
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
        <Suspense fallback={loadingFallback}>
          {mode === "sketch" ? (
            <SketchBoard tourStop={stop} resetTick={resetTick} />
          ) : (
            <>
              <Blueprint3D
                tourStop={stop}
                resetTick={resetTick}
                zoomInTick={zoomInTick}
                zoomOutTick={zoomOutTick}
                onZoomChange={setZoomPercent}
                ascii={mode === "ascii"}
              />
              {/* Mirrors tldraw's own bottom-left zoom badge (visible in Sketch
               * mode) so the two views feel like one control system, not two. */}
              <div className="pointer-events-none absolute bottom-4 left-4 rounded border border-line bg-ink/80 px-2 py-1 font-mono text-xs text-zinc-400 backdrop-blur">
                {zoomPercent}%
              </div>
            </>
          )}
        </Suspense>
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
