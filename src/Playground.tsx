import { Component, Suspense, lazy, useCallback, useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Activity, LayoutGrid, Gamepad2 } from "lucide-react";
import { openChat } from "./FloatingChat.tsx";
import { useSectionNav } from "./lib/navigation.ts";
import { hasWebGL } from "./blueprintShared.tsx";
import { RoomGrid } from "./RoomGrid.tsx";
import { ROOMS } from "./rooms.tsx";
import { countWord } from "./data/labs.ts";
import { PlayRoom, PresenceBadge } from "./play/PlayRoom.tsx";
import { VisitorPlaque } from "./play/Visitors.tsx";
import { GuestWall, GUEST_WALL_ENABLED } from "./play/GuestWall.tsx";
import { Sandbox } from "./play/Sandbox.tsx";

/**
 * The Playground — one full-screen hub for every interactive world on the site.
 * These used to be scattered down the scroll and behind hotkeys; gathering them
 * behind one door makes the point explicit: this portfolio is a running program,
 * and each room is a small proof of the engineering the CV describes.
 *
 * Since the playground-world work, this hub has two bodies sharing one header:
 * a drivable 3D world (src/world/, lazy — nothing else on the site imports it)
 * and RoomGrid, the original card grid. The grid is never a lesser fallback —
 * it's the always-reachable list view: a locked-down laptop or someone who'd
 * rather just click gets it as the visible page (wantsWorld false, byte-for-
 * byte the same UI that shipped before the world existed); a screen-reader
 * user with a capable browser gets it too, rendered right alongside the
 * (aria-hidden) world, sr-only until @media print or an AT makes it visible.
 *
 * Each room is its own route, rendered one at a time so only one canvas / WebGL
 * context is ever live. This hub keeps its OWN header rather than RoomFrame's —
 * RoomFrame's first control links back here, which from here is a link to
 * itself. (This comment used to claim it shared RoomFrame's chrome. It never
 * did, and that drift is why the palette was missing from this page.)
 */

// Lazy so nothing outside /playground pays for three.js/Rapier — see
// src/world/World.tsx for what actually lives in this chunk.
const World = lazy(() => import("./world/World.tsx"));

/** If the world throws — a lost WebGL context, a driver quirk the raycast
 *  vehicle controller trips on — land on the same grid a visitor without
 *  WebGL already gets, rather than a dead screen. It does that by telling
 *  PlaygroundInner (via onError) rather than rendering a fallback in place:
 *  rendering RoomGrid here used to leave it trapped inside
 *  main.playground-world, which is still sitting under the page root's
 *  h-screen overflow-hidden (wantsWorld doesn't know the world died) — eight
 *  cards in a viewport-height box with the lower rows unreachable and the
 *  whole thing display:none under print. Bailing all the way out to
 *  PlaygroundInner's ordinary list branch instead gives a genuinely normal,
 *  scrollable page — the same one a no-WebGL visitor gets. */
class WorldBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    // Nothing to render once tripped — onError flips PlaygroundInner's
    // wantsWorld to false in the same tick, which unmounts this whole
    // subtree in favour of the list branch. This is never on screen for
    // more than a frame.
    return this.state.failed ? null : this.props.children;
  }
}

const worldLoadingFallback = <div className="flex h-full items-center justify-center font-mono text-sm text-muted">loading the world…</div>;

const VIEW_KEY = "playground:view";

// localStorage throws in private-mode Safari (see AnomalyRail.tsx's
// hasSweptBefore/markSwept for the same guard) — losing the remembered view
// is a minor annoyance, never worth crashing the hub over.
function loadViewPref(): "world" | "list" | null {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    return v === "world" || v === "list" ? v : null;
  } catch {
    return null;
  }
}
function saveViewPref(view: "world" | "list"): void {
  try {
    localStorage.setItem(VIEW_KEY, view);
  } catch {
    // best-effort only — worst case the choice doesn't survive a reload
  }
}

export default function Playground() {
  // Everything shared on this page — presence, the tile counts, the sandbox and
  // the wall — reads from this one room.
  return (
    <PlayRoom>
      <PlaygroundInner />
    </PlayRoom>
  );
}

function PlaygroundInner() {
  const { goToSection } = useSectionNav();

  // Both start false and resolve after mount. hasWebGL()/matchMedia read real
  // browser capability, not something to guess at during the render that also
  // has to run before the DOM exists — deciding here rather than inline keeps
  // the first paint deterministic instead of racing a capability check.
  const [forcedList, setForcedList] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [worldCapable, setWorldCapable] = useState(false);
  // Set by WorldBoundary's onError when the world throws after mounting —
  // see WorldBoundary's own comment for why this lives up here rather than
  // being handled as a fallback render inside the boundary itself.
  const [worldFailed, setWorldFailed] = useState(false);
  useEffect(() => {
    setForcedList(loadViewPref() === "list");
    setWorldCapable(hasWebGL() && !window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  const wantsWorld = worldCapable && !forcedList && !worldFailed;
  const handleWorldError = useCallback(() => setWorldFailed(true), []);

  // The World's HUD calls this (via onShowList) to drop back to the grid;
  // the grid view's own "3D world" button below calls its counterpart to
  // go the other way. Same localStorage key either direction, so the choice
  // survives a reload.
  /**
   * Switching views is a WIPE, not a cut.
   *
   * The two views are the same eight rooms in different clothes, and swapping
   * them instantly read as a page break — the world vanished, a list appeared,
   * and nothing connected the two. A brief cover holds the screen while the
   * heavy side mounts or tears down, which also hides the one genuinely ugly
   * frame in the transition: a WebGL context being created or disposed.
   *
   * `transitioning` gates the cover; the actual switch happens at the midpoint
   * so neither view is ever seen half-built.
   */
  const runTransition = useCallback((apply: () => void) => {
    // Reduced motion gets the instant swap: a cover that fades is still motion,
    // and this one exists for polish rather than for meaning.
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      apply();
      return;
    }
    setTransitioning(true);
    window.setTimeout(() => {
      apply();
      // Long enough for the incoming side to have mounted before the cover
      // lifts. Shorter and you watch the grid pop in behind a fading veil.
      window.setTimeout(() => setTransitioning(false), 260);
    }, 200);
  }, []);

  const showList = useCallback(() => {
    runTransition(() => {
      setForcedList(true);
      saveViewPref("list");
    });
  }, [runTransition]);
  const showWorld = useCallback(() => {
    runTransition(() => {
    setForcedList(false);
    // Also clears a prior crash: worldCapable stays true even after
    // WorldBoundary trips (the browser can still run WebGL — something in
    // the scene just threw), so without this the "drive the 3D world
    // instead" button below would render, but wantsWorld could never go
    // true again and the button would silently do nothing.
    setWorldFailed(false);
    saveViewPref("world");
    });
  }, [runTransition]);

  return (
    <div
      className={`flex flex-col bg-void ${
        // print:h-auto print:overflow-visible: the world view's viewport-locked
        // box exists so the WebGL canvas never scrolls under a driving craft —
        // it has no reason to exist on paper, and left in place under print it
        // would clip the room grid (see the sr-only wrapper below) to one
        // screen's worth of content instead of letting it paginate normally.
        wantsWorld ? "h-screen overflow-hidden print:h-auto print:overflow-visible" : "min-h-screen"
      }`}
    >
      <header className="sticky top-0 z-40 border-b border-line bg-ink/90 backdrop-blur">
        <nav className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={() => goToSection("top")}
            className="flex items-center gap-2 text-sm text-zinc-400 transition hover:text-accent"
          >
            <ArrowLeft size={16} /> <span className="label-wide">Back to portfolio</span>
          </button>
          <span className="kicker hidden items-center gap-2 lg:flex">
            <LayoutGrid size={13} className="text-accent" /> The Playground — every interactive room, one door
          </span>
          <div className="flex items-center gap-2 sm:gap-3">
            {/* The hub keeps its own header rather than RoomFrame's — RoomFrame
                links back to the Playground, which from the Playground is a
                link to itself. But it was also missing the palette, so the one
                page whose whole job is "every room, one door" was the one page
                you couldn't reach the other rooms from by keyboard. */}
            <PresenceBadge className="hidden sm:flex" />
            <button
              onClick={() => openChat()}
              className="rounded-full bg-accent px-3 py-1.5 text-sm font-semibold text-ink transition hover:bg-accent-dim sm:px-4"
            >
              Ask <span className="label-wide">my AI</span>
            </button>
          </div>
        </nav>
      </header>

      {/* The transition cover. Sits above both views, fades in over the
          outgoing one and out over the incoming one, so a switch reads as a
          wipe rather than as the page breaking. aria-hidden: it is pure
          decoration and a screen reader has already been told about both
          views. */}
      <div
        aria-hidden="true"
        className={`playground-wipe${transitioning ? " is-active" : ""}`}
      />

      {wantsWorld ? (
        <main id="main-content" tabIndex={-1} className="playground-world relative min-h-0 flex-1">
          {/* playground-canvas (not playground-world) is what @media print
              hides (src/index.css) — a WebGL canvas is a black rectangle on
              paper. RoomGrid below is the alternative, not a lie about a grid
              "underneath": it's rendered right here, every time the world is,
              just visually hidden. */}
          <div className="playground-canvas absolute inset-0">
            <WorldBoundary onError={handleWorldError}>
              <Suspense fallback={worldLoadingFallback}>
                <World onShowList={showList} />
              </Suspense>
            </WorldBoundary>
          </div>
          {/* sr-only in world view (Canvas above is aria-hidden, so this is
              the entire accessible room list a screen-reader user gets —
              same room links the HUD's List button switches a sighted visitor
              to) and print:not-sr-only so it's what actually prints once
              playground-canvas above is hidden. Without this, world view was
              either a blank printed page (nothing survived the print rule)
              or, for a screen-reader user, a hub with a header and a List
              button but zero room links — the ternary this replaced rendered
              RoomGrid *instead of* the world, never alongside it. */}
          <div className="sr-only print:not-sr-only">
            {/* World view had no <h1> at all — the visible one lives in the
                list-view branch below, and this is the branch that renders by
                default. The canvas above is aria-hidden, so the page announced
                itself with no heading of any level to a screen reader and
                shipped an h1-less document to crawlers. sr-only rather than
                visible: the world is full-bleed chrome with nowhere to put a
                title, which is exactly why RoomFrame does the same thing. */}
            <h1>The Playground — every interactive room, one street</h1>
            <RoomGrid />
          </div>
        </main>
      ) : (
        <main id="main-content" tabIndex={-1} className="section-y mx-auto w-full max-w-6xl flex-1 px-6">
          <p className="section-eyebrow mb-2 text-xs font-semibold uppercase tracking-widest text-accent/70">// the playground</p>
          <h1 className="font-display text-hero font-bold tracking-tight">This site is a live demo</h1>
          <p className="mt-3 max-w-2xl text-lg leading-relaxed text-zinc-400">
            Not a PDF with a pulse — a running program. {countWord(ROOMS.length)} interactive rooms, each a
            small proof of the engineering the rest of the site describes. Pick one and poke it.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <Link
              to="/pulse"
              className="inline-flex items-center gap-1.5 font-mono text-[11px] text-muted transition hover:text-accent"
            >
              <Activity size={12} /> see what everyone else has been touching →
            </Link>
            {worldCapable && (
              // The grid's half of the List/World toggle — the world's half
              // is the HUD's List button (src/world/Hud.tsx), which calls
              // showList the other way. Only offered when this browser could
              // actually run the world; otherwise there's nothing to return to.
              <button
                type="button"
                onClick={showWorld}
                className="inline-flex items-center gap-1.5 font-mono text-[11px] text-muted transition hover:text-accent"
              >
                <Gamepad2 size={12} /> drive the 3D world instead →
              </button>
            )}
          </div>

          <VisitorPlaque />

          <RoomGrid />

          <Sandbox />
          {GUEST_WALL_ENABLED && <GuestWall />}

          <p className="mt-10 font-mono text-[11px] text-muted">
            tip: press <kbd className="rounded border border-line px-1.5 py-0.5 text-zinc-400">⌘K</kbd> or{" "}
            <kbd className="rounded border border-line px-1.5 py-0.5 text-zinc-400">`</kbd> to jump anywhere.
          </p>
        </main>
      )}
    </div>
  );
}
