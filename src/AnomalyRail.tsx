import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { facets } from "./data/facets";
import { byChronology, dualStamp } from "./lib/facets";
import { baselineTicks, deviationsFor, hitTest } from "./lib/railGeometry";
import { useCanvasLoop } from "./labs/useCanvasLoop";

/**
 * The site's secondary nav: a live trace pinned to the left edge on every
 * route. The baseline (accent2, faint) is a repeating measurement scale;
 * each facet sits on it as a deviation (accent) at its chronological
 * position — see src/lib/railGeometry.ts for why that's time, not nav order.
 *
 * The canvas is pure decoration (aria-hidden) — every real interaction runs
 * through the plain <nav>/<a> underneath it, so deleting the canvas still
 * leaves a fully working, keyboard-reachable secondary nav.
 */

const TICK_SPACING = 16;
const DEVIATION_PAD = 32;
const HOVER_TOLERANCE = 8;
const SWEEP_MS = 1400;
const SWEEP_SEEN_KEY = "sidos.rail.seen";

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

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setHeight(entry.contentRect.height));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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

    const draw = () => {
      const { width, height: h } = getSize();
      ctx.clearRect(0, 0, width, h);
      if (h <= 0) return;

      // Read tokens at runtime (not hardcoded hex) so a palette change
      // propagates. document.documentElement, not any scoped override —
      // this rail sits outside <main>, so it always reflects the root theme.
      const tokens = getComputedStyle(document.documentElement);
      const accent = tokens.getPropertyValue("--color-accent").trim();
      const accent2 = tokens.getPropertyValue("--color-accent2").trim();
      const cx = width / 2;

      // Baseline: a faint repeating tick scale — the thing deviations are measured against.
      ctx.strokeStyle = accent2;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.3;
      for (const y of baselineTicks(h, TICK_SPACING)) {
        ctx.beginPath();
        ctx.moveTo(cx - 4, y + 0.5);
        ctx.lineTo(cx + 4, y + 0.5);
        ctx.stroke();
      }
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
      const hovered = hoveredRef.current;
      for (const d of deviationsFor(facets, h, DEVIATION_PAD)) {
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
    <div
      ref={containerRef}
      className="anomaly-rail"
      onPointerMove={updateHover}
      onPointerLeave={() => {
        hoveredRef.current = null;
      }}
    >
      <nav aria-label="Timeline" className="anomaly-rail-nav">
        {orderedFacets.map((facet) => (
          <a
            key={facet.id}
            href={facet.href}
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
  );
}
