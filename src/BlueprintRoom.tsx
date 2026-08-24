import { Component, Suspense, lazy, useCallback, useState, type ReactNode } from "react";
import { LauncherButton } from "./Launcher.tsx";
import { ArrowLeft, Compass, Orbit, Pencil, Play, RotateCcw, Terminal, ZoomIn, ZoomOut } from "lucide-react";
import { openChat } from "./FloatingChat.tsx";
import { TOUR } from "./blueprintData.ts";
import { hasTldrawLicense, hasWebGL } from "./blueprintShared.tsx";
import { clearBlueprintPersistence } from "./blueprintPersistence.ts";
import { useSectionNav } from "./lib/navigation.ts";
import { PlayRoom, PresenceBadge } from "./play/PlayRoom.tsx";
import { usePulse } from "./play/pulse.ts";

/** Class components (RoomBoundary below) can't call hooks directly — this
 *  wraps the router-aware "back to portfolio" control so both the error
 *  fallback and the normal header can use it. */
function BackToPortfolio({ className, children }: { className: string; children: ReactNode }) {
  const { goToSection } = useSectionNav();
  return (
    <button type="button" onClick={() => goToSection("top")} className={className}>
      {children}
    </button>
  );
}

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
        <BackToPortfolio className="text-sm text-muted transition hover:text-accent">
          ← Back to the portfolio
        </BackToPortfolio>
      </div>
    );
  }
}

type Mode = "fly" | "ascii" | "sketch";

/* One entry per header toggle button, driving both the pill UI and the view
 * switch below — adding a mode (as ASCII did) means one array entry, not a
 * hand-copied button plus a new branch in the render switch.
 *
 * `available` is checked at render, not at module load: each mode depends on
 * something the visitor's browser or this deployment may not have (WebGL for
 * the three.js views, a tldraw licence for the whiteboard). A mode that can't
 * survive here is offered disabled with the reason, rather than handed over
 * and left to die a few seconds later. */
const MODES: {
  id: Mode;
  label: string;
  icon: typeof Orbit;
  available: () => boolean;
  unavailable: string;
  tagline: string;
  hint: string;
}[] = [
  {
    id: "fly",
    label: "Fly",
    icon: Orbit,
    available: hasWebGL,
    unavailable: "Needs WebGL — try Sketch mode",
    tagline: "a live 3D fly-through — drag to orbit, WASD to move",
    hint: "Fly through the room in 3D",
  },
  {
    id: "ascii",
    label: "ASCII",
    icon: Terminal,
    available: hasWebGL,
    unavailable: "Needs WebGL — try Sketch mode",
    tagline: "a real-time ASCII render — drag to orbit, WASD to move",
    hint: "The same room, rendered as glyphs",
  },
  {
    id: "sketch",
    label: "Sketch",
    icon: Pencil,
    available: hasTldrawLicense,
    unavailable: "The whiteboard needs a valid tldraw licence for this domain — try Fly or ASCII",
    tagline: "an infinite sketch canvas",
    hint: "Draw, drag and leave notes on a 2D whiteboard",
  },
];

const loadingFallback = <div className="flex h-full items-center justify-center font-mono text-sm text-muted">loading…</div>;

function BlueprintRoomInner() {
  // Open on the first mode that can actually run here — Fly normally, Sketch on
  // a machine without WebGL, and nothing at all if neither is on offer.
  const [mode, setMode] = useState<Mode>(() => MODES.find((m) => m.available())?.id ?? "fly");
  const [stop, setStop] = useState(-1);
  const [resetTick, setResetTick] = useState(0);
  const [zoomInTick, setZoomInTick] = useState(0);
  const [zoomOutTick, setZoomOutTick] = useState(0);
  const [zoomPercent, setZoomPercent] = useState(50);
  // Set if tldraw shuts its own editor down at runtime (an expired key, or one
  // that isn't valid for this domain) — things the pre-flight check in MODES
  // can't see. From then on Sketch is treated exactly like a mode this browser
  // can't run, rather than left on screen as a blank rectangle.
  const [licenseGated, setLicenseGated] = useState(false);
  const isAvailable = useCallback(
    (m: (typeof MODES)[number]) => m.available() && !(m.id === "sketch" && licenseGated),
    [licenseGated],
  );
  const activeMode = MODES.find((m) => m.id === mode) ?? MODES[0];
  const bump = usePulse();

  const onLicenseGate = useCallback(() => {
    setLicenseGated(true);
    setMode((current) => (current === "sketch" ? (MODES.find((m) => m.id !== "sketch" && m.available())?.id ?? current) : current));
  }, []);

  // Each mode keeps its own camera; hopping modes shouldn't carry a stale tour stop.
  const setModeFresh = (m: Mode) => {
    setMode(m);
    setStop(-1);
    bump(`blueprint:${m}`);
  };

  const tourNext = () => {
    setStop((s) => (s + 1) % TOUR.length);
    bump("blueprint:tour");
  };
  const resetView = () => {
    setStop(-1);
    setResetTick((t) => t + 1);
    bump("blueprint:reset");
  };

  return (
    <div className="flex h-screen flex-col">
      <header className="z-10 border-b border-line bg-ink/90 backdrop-blur">
        <nav className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          {/* This room draws its own chrome instead of RoomFrame's, which is
              how it (and /compose and /terminal) missed the launcher entirely —
              three of the eight rooms offered "back to the portfolio" and no
              sideways move, while the other five had the whole wall a click
              away. */}
          <div className="flex items-center gap-2 sm:gap-3">
            <LauncherButton />
            <BackToPortfolio className="flex items-center gap-2 text-sm text-zinc-400 transition hover:text-accent">
              <ArrowLeft size={16} /> <span className="label-wide">Back to portfolio</span>
            </BackToPortfolio>
          </div>
          <span className="kicker hidden items-center gap-2 lg:flex">
            <Compass size={13} className="text-accent" /> The Blueprint Room — {activeMode.tagline}
          </span>
          {/* Wraps: the mode pills, the tour, Reset and Ask add up to ~339px,
              which does not fit a 320px window even on its own line — and
              html{overflow-x:hidden} means the surplus is silently cut off
              rather than scrollable. */}
          <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
            <div className="flex items-center rounded-full border border-line p-0.5 text-sm font-semibold">
              {MODES.map((m) => {
                const { id, label, icon: Icon, unavailable, hint } = m;
                const disabled = !isAvailable(m);
                return (
                  <button
                    key={id}
                    onClick={() => setModeFresh(id)}
                    disabled={disabled}
                    title={disabled ? unavailable : hint}
                    // Leads with `label` in BOTH branches. The enabled branch
                    // used to be the hint alone — "The same room, rendered as
                    // glyphs" for a button that visibly reads "ASCII" — so the
                    // accessible name did not contain its own visible label
                    // (WCAG 2.5.3), and someone driving by voice could not say
                    // the word they could see. The disabled branch already had
                    // it right.
                    aria-label={`${label} — ${disabled ? unavailable : hint}`}
                    aria-pressed={mode === id}
                    className={`flex items-center gap-1.5 rounded-full px-3 py-1 transition disabled:cursor-not-allowed disabled:opacity-40 ${
                      mode === id ? "bg-accent text-ink" : "text-zinc-400 hover:text-accent"
                    }`}
                  >
                    <Icon size={13} /> <span className="label-wide">{label}</span>
                  </button>
                );
              })}
            </div>
            <button
              onClick={tourNext}
              // Both branches contain the visible label verbatim. The second
              // used to read "Guided tour: next stop, X" for a button showing
              // "next: X" — a 2.5.3 mismatch that only appears after the first
              // click, which is why the scan (which never clicks) missed it.
              aria-label={stop === -1 ? "Start guided tour" : `Guided tour — next: ${TOUR[(stop + 1) % TOUR.length].title}`}
              className="flex items-center gap-1.5 rounded-full border border-accent2/40 px-3 py-1.5 text-sm font-semibold text-accent2 transition hover:border-accent2 hover:bg-accent2/10 sm:px-4"
            >
              <Play size={13} /> <span className="label-wide">{stop === -1 ? "guided tour" : `next: ${TOUR[(stop + 1) % TOUR.length].title}`}</span>
            </button>
            {mode !== "sketch" && (
              <div className="flex items-center rounded-full border border-line">
                <button
                  onClick={() => setZoomOutTick((t) => t + 1)}
                  title="Zoom out"
                  aria-label="Zoom out"
                  className="rounded-full p-2 text-zinc-400 transition hover:text-accent"
                >
                  <ZoomOut size={14} />
                </button>
                <button
                  onClick={() => setZoomInTick((t) => t + 1)}
                  title="Zoom in"
                  aria-label="Zoom in"
                  className="rounded-full p-2 text-zinc-400 transition hover:text-accent"
                >
                  <ZoomIn size={14} />
                </button>
              </div>
            )}
            <button
              onClick={resetView}
              title="Reset the camera and layout"
              aria-label="Reset the camera and layout"
              className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-sm font-semibold text-zinc-400 transition hover:border-accent hover:text-accent"
            >
              <RotateCcw size={13} /> <span className="label-wide">Reset</span>
            </button>
            <PresenceBadge className="hidden md:flex" />
            <button
              onClick={() => openChat()}
              className="rounded-full bg-accent px-3 py-1.5 text-sm font-semibold text-ink transition hover:bg-accent-dim sm:px-4"
            >
              Ask <span className="label-wide">my AI</span>
            </button>
          </div>
        </nav>
      </header>
      <main id="main-content" tabIndex={-1} className="relative min-h-0 flex-1">
        <h1 className="sr-only">The Blueprint Room — {activeMode.tagline}</h1>
        <Suspense fallback={loadingFallback}>
          {!isAvailable(activeMode) ? (
            // Only reachable when nothing can run here (no WebGL *and* no
            // tldraw licence). Say so plainly rather than mounting a view that
            // will blank out on its own.
            <div className="flex h-full items-center justify-center px-6 text-center font-mono text-sm text-muted">
              {activeMode.unavailable}.
            </div>
          ) : mode === "sketch" ? (
            <SketchBoard tourStop={stop} resetTick={resetTick} onLicenseGate={onLicenseGate} />
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
      </main>
    </div>
  );
}

export default function BlueprintRoom() {
  return (
    <RoomBoundary>
      {/* Its own room, so the presence count means "people in the Blueprint
          Room" rather than "people somewhere on the site". */}
      <PlayRoom>
        <BlueprintRoomInner />
      </PlayRoom>
    </RoomBoundary>
  );
}
