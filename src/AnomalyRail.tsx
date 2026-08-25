import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useRouterState } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { facets } from "./data/facets";
import { byChronology, dualStamp } from "./lib/facets";
import { baselineTicks, deviationsFor, hitTest } from "./lib/railGeometry";
import { useCanvasLoop } from "./labs/useCanvasLoop";
import InstrumentView from "./InstrumentView";

/**
 * The site's secondary nav: a live trace pinned to the left edge on every
 * route. The baseline (accent2, faint) is a repeating measurement scale;
 * each facet sits on it as a deviation (accent) at its chronological
 * position — see src/lib/railGeometry.ts for why that's time, not nav order.
 *
 * The canvas is pure decoration (aria-hidden) — every real interaction runs
 * through the plain <nav>/<a> underneath it, so deleting the canvas still
 * leaves a fully working, keyboard-reachable secondary nav.
 *
 * The rail also expands: dragging it rightwards, or pressing `\` from
 * anywhere, opens InstrumentView (the same facets as a full trace). Both
 * triggers funnel into the same `openInstrument`/`closeInstrument` pair so
 * there's one place that knows focus comes back to the rail on close.
 */

const TICK_SPACING = 16;
const DEVIATION_PAD = 32;
const HOVER_TOLERANCE = 8;
const SWEEP_MS = 1400;
const SWEEP_SEEN_KEY = "sidos.rail.seen";
// How far right a drag has to travel, from wherever it started on the
// 24px-wide rail, before it counts as "open the instrument view" rather
// than an incidental wobble.
const DRAG_OPEN_THRESHOLD_PX = 40;

// localStorage throws in private-mode Safari — the sweep hint is a nicety,
// never worth crashing the rail over.
function hasSweptBefore(): boolean {
  try {
    return localStorage.getItem(SWEEP_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}
function markSwept(): void {
  try {
    localStorage.setItem(SWEEP_SEEN_KEY, "1");
  } catch {
    // best-effort only — worst case the hint replays next visit
  }
}

const orderedFacets = byChronology(facets);

export default function AnomalyRail() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  // Read every animation frame by draw(), written by pointer/focus handlers.
  // A ref, not state — the rail already redraws every frame, so this doesn't
  // need to trigger a React render on top of that.
  const hoveredRef = useRef<string | null>(null);
  const [instrumentOpen, setInstrumentOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setHeight(entry.contentRect.height));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // A route change while the overlay is open (the terminal's ` hotkey,
  // browser back/forward, a link inside the overlay itself) has to close it
  // — InstrumentView's `inert` effect snapshots document.body.children once,
  // on open, and the router swaps the routed page's DOM node out from under
  // that snapshot on navigation, leaving the new page's node never inerted
  // and the dialog open over a fully reachable background. Closing here runs
  // the exact same cleanup as a normal close (closeInstrument, below), so
  // nothing is left half-inerted.
  //
  // Adjusted during render against the pathname we last rendered at, rather
  // than in an effect: this is React's documented way to reset state when
  // something changes, and it is the only one that never shows the overlay
  // over a page it has stopped inerting. The effect version needed a second
  // render pass to close, so for one commit the dialog was painted over the
  // freshly mounted route. React re-runs this component immediately with the
  // new state and throws the first pass away, so nothing downstream — the
  // overlay included — ever sees the stale `true`.
  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setInstrumentOpen(false);
  }

  // `\` opens the instrument view from anywhere on the site — same pattern
  // as the terminal's backtick hotkey in __root.tsx: ignore modified presses
  // (so e.g. ⌥\ still reaches the OS) and typing contexts (the terminal and
  // the chat box both live on this site; stealing their keystroke is a bug).
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "\\" || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      e.preventDefault();
      setInstrumentOpen(true);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Focus returns to the rail itself (not "whatever was focused before" —
  // that could be nothing, if the drag opened it) on close. tabIndex={-1}
  // on the container makes it a valid programmatic focus target without
  // adding a stop to the normal Tab order. useCallback keeps this one
  // identity across re-renders (e.g. the ResizeObserver-driven height
  // updates below) — InstrumentView's Escape/Tab-trap effect is keyed on
  // this prop, and a fresh identity every render would tear down and re-add
  // its document keydown listener for no reason.
  const closeInstrument = useCallback(() => {
    setInstrumentOpen(false);
    const rail = containerRef.current;
    if (!rail) return;
    // InstrumentView un-inerts every body-level sibling (this rail
    // included) in its own close effect, but that effect only runs once
    // React flushes the `open` state update scheduled above — after this
    // function has already returned. Clear it here too so the focus() call
    // below doesn't silently no-op: an inert element can't take focus.
    rail.inert = false;
    rail.focus();
  }, []);

  // Drag-to-open: the rail is only 24px wide, so a rightward drag leaves its
  // bounds almost immediately — window-level listeners (rather than
  // relying on the rail to keep receiving pointermove) are what let the
  // gesture keep tracking once the pointer's past the rail's own edge.
  const onRailPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    // The rail sits in the same leftmost 24px, same rightward direction, as
    // iOS Safari's and Android Chrome's edge-swipe-to-go-back gesture.
    // Never arm drag-to-open for touch — `\` and tapping a rail link still
    // work there, so touch users only lose the drag affordance, not the
    // feature. Per-event pointerType (not a static `(pointer: fine)` media
    // query) so a hybrid device's mouse/pen input is unaffected.
    if (e.pointerType === "touch") return;
    const pointerId = e.pointerId;
    const startX = e.clientX;
    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      if (ev.clientX - startX > DRAG_OPEN_THRESHOLD_PX) {
        cleanup();
        setInstrumentOpen(true);
      }
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", cleanup);
      window.removeEventListener("pointercancel", cleanup);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", cleanup);
    window.addEventListener("pointercancel", cleanup);
  };

  const deviations = deviationsFor(facets, height, DEVIATION_PAD);
  const yById = new Map(deviations.map((d) => [d.id, d.y]));

  const canvasRef = useCanvasLoop((_canvas, ctx, getSize) => {
    // useCanvasLoop already fast-forwards+freezes this step/draw pair under
    // prefers-reduced-motion — that's the ambient loop covered. The sweep is
    // a separate one-shot hint layered on the same loop, so it needs its own
    // explicit gate: skipped outright when reduced motion is on, rather than
    // relying on the fast-forward to land it mid-animation.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let sweepT = reduced || hasSweptBefore() ? 1 : 0;
    if (sweepT === 0) markSwept();

    const step = (dtMs: number) => {
      if (sweepT < 1) sweepT = Math.min(1, sweepT + dtMs / SWEEP_MS);
    };

    // Ticks and deviations are pure geometry — they only change when the
    // rail resizes, not every frame. Recomputing (and re-sorting, in
    // deviationsFor) on every one of a continuous rAF loop's ~60 frames/sec
    // was pure waste and, worse, real main-thread contention: this loop
    // never stops (that's useCanvasLoop's design), so it was competing with
    // everything else on the page — including a large native "smooth"
    // scrollIntoView — for the whole time the rail is mounted, i.e. always.
    // Cache both, keyed on the last height we drew at — and read the CAL-1
    // tokens (a getComputedStyle call) at that same cadence instead of every
    // frame: this site has no runtime theme toggle, so nothing but a resize
    // can invalidate them.
    let cachedH = -1;
    let cachedTicks: number[] = [];
    let cachedDeviations = deviationsFor(facets, 0, DEVIATION_PAD);
    let accent = "";
    let accent2 = "";

    // What the last frame actually painted. Once the one-shot sweep hint
    // finishes and the pointer stops moving, every subsequent frame is
    // byte-identical to the one before it — measured: two snapshots 1.5s
    // apart hash identical — yet useCanvasLoop's rAF loop never stops.
    // Skipping the clear+restroke when nothing changed fixes that without
    // touching the loop itself. Not applied under reduced motion: that path
    // draws at most a couple of times total (once on mount, once per
    // resize), so there's no perpetual loop to save here, and skipping would
    // risk racing the resize-triggered redraw that keeps the frozen frame
    // from going blank (see useCanvasLoop.ts).
    let lastHovered: string | null = null;
    let lastSweepDone = false;

    const draw = () => {
      const { width, height: h } = getSize();
      if (h <= 0) {
        ctx.clearRect(0, 0, width, h);
        return;
      }

      const resized = h !== cachedH;
      if (resized) {
        cachedH = h;
        cachedTicks = baselineTicks(h, TICK_SPACING);
        cachedDeviations = deviationsFor(facets, h, DEVIATION_PAD);
        // Read tokens at runtime (not hardcoded hex) so a palette change
        // propagates. document.documentElement, not any scoped override —
        // this rail sits outside <main>, so it always reflects the root theme.
        const tokens = getComputedStyle(document.documentElement);
        accent = tokens.getPropertyValue("--color-accent").trim();
        accent2 = tokens.getPropertyValue("--color-accent2").trim();
      }

      const hovered = hoveredRef.current;
      const sweepDone = sweepT >= 1;
      if (!reduced && !resized && sweepDone && lastSweepDone && hovered === lastHovered) return;
      lastHovered = hovered;
      lastSweepDone = sweepDone;

      const cx = width / 2;
      ctx.clearRect(0, 0, width, h);

      // Baseline: a faint repeating tick scale — the thing deviations are
      // measured against. One path for every tick (not one stroke() call
      // per tick) — same pixels, a fraction of the draw calls.
      ctx.strokeStyle = accent2;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.3;
      ctx.beginPath();
      for (const y of cachedTicks) {
        ctx.moveTo(cx - 4, y + 0.5);
        ctx.lineTo(cx + 4, y + 0.5);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;

      // One-time sweep hint: a soft band travels the baseline once, first visit only.
      if (sweepT < 1) {
        const sweepY = sweepT * h;
        const band = ctx.createLinearGradient(0, sweepY - 36, 0, sweepY + 36);
        band.addColorStop(0, "transparent");
        band.addColorStop(0.5, accent2);
        band.addColorStop(1, "transparent");
        ctx.globalAlpha = 0.45;
        ctx.fillStyle = band;
        ctx.fillRect(0, sweepY - 36, width, 72);
        ctx.globalAlpha = 1;
      }

      // Deviations: the measured signal, one per facet, laid out by chronology.
      for (const d of cachedDeviations) {
        const isHovered = d.id === hovered;
        ctx.beginPath();
        ctx.arc(cx, d.y, isHovered ? 4.5 : 3, 0, Math.PI * 2);
        ctx.fillStyle = accent;
        if (isHovered) {
          ctx.shadowColor = accent;
          ctx.shadowBlur = 10;
        }
        ctx.fill();
        ctx.shadowBlur = 0;

        if (isHovered) {
          const facet = facets.find((f) => f.id === d.id);
          if (facet) {
            ctx.font = '11px "JetBrains Mono", ui-monospace, monospace';
            ctx.fillStyle = accent;
            ctx.textBaseline = "middle";
            ctx.fillText(facet.label, cx + 12, d.y);
          }
        }
      }
    };

    return { step, draw };
  });

  const updateHover = (e: ReactPointerEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    hoveredRef.current = hitTest(deviations, e.clientY - rect.top, HOVER_TOLERANCE);
  };

  return (
    <>
      <div
        ref={containerRef}
        className="anomaly-rail"
        tabIndex={-1}
        onPointerDown={onRailPointerDown}
        onPointerMove={updateHover}
        onPointerLeave={() => {
          hoveredRef.current = null;
        }}
      >
        <nav aria-label="Timeline" className="anomaly-rail-nav">
          {orderedFacets.map((facet) => (
            <Link
              key={facet.id}
              to={facet.to}
              hash={facet.hash}
              className="anomaly-rail-link"
              style={{ top: `${yById.get(facet.id) ?? 0}px` }}
              aria-label={`${facet.label} — ${dualStamp(facet)}`}
              onFocus={() => {
                hoveredRef.current = facet.id;
              }}
              onBlur={() => {
                hoveredRef.current = null;
              }}
            />
          ))}
        </nav>
        <canvas ref={canvasRef} aria-hidden="true" className="anomaly-rail-canvas" />
      </div>
      <InstrumentView open={instrumentOpen} onClose={closeInstrument} />
    </>
  );
}
