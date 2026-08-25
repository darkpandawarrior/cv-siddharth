import { useEffect, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, X } from "lucide-react";
import { wrapFocusTarget } from "../lib/focusTrap.ts";
import type { Destination } from "./destinations.ts";

/**
 * THE IN-WORLD PANEL — substrate design doc §5 / PART 1's whole point.
 *
 * Approach + dwell (or Enter) opens this DOM overlay over the still-running
 * scene: the car has already parked (Monuments.tsx's tower/obelisk is a
 * solid obstacle — drive.ts's own kinematic model stops the car at it), the
 * route does not change, and the Canvas underneath never tears down. Only
 * the JSX below is conditional on `destination`; the component itself stays
 * mounted for the world's whole lifetime (same discipline as
 * InstrumentView.tsx, this codebase's other hand-built accessible dialog —
 * a `role="dialog"` element that merely *looks* hidden still carries that
 * role in the accessibility tree even while nothing is open).
 *
 * Focus handling follows InstrumentView.tsx's proven pattern exactly: move
 * focus in on open, trap Tab inside via the shared `wrapFocusTarget`
 * (focusTrap.ts), Escape closes and restores focus to whatever had it
 * before. input.ts's own keydown handler already ignores every driving key
 * whose `e.target` is a real interactive element (`isInteractiveTarget`),
 * so once focus is inside this panel — on the close button or a link — the
 * car simply stops responding to WASD/arrows without this file having to
 * know anything about input.ts at all.
 *
 * ponytail: unlike InstrumentView.tsx, the World/Hud siblings behind this
 * panel are not marked `inert`. A screen reader's browse-mode cursor could
 * still reach the HUD's own buttons while this is open. The Canvas itself
 * is already `aria-hidden` (World.tsx), and a full-viewport backdrop blocks
 * every pointer event from reaching anything behind it, so the practical
 * gap is narrow — inert the Hud/WorldLabels siblings (World.tsx owns both)
 * if axe or real AT testing ever flags it.
 */

const FOCUSABLE_SELECTOR = "a[href], button:not([disabled])";

export function LandmarkPanel({ destination, onClose }: { destination: Destination | null; onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<Element | null>(null);
  const headingId = "landmark-panel-heading";

  useEffect(() => {
    if (!destination) return;
    returnFocusRef.current = document.activeElement;
    const first = dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    first?.focus();
    return () => {
      const el = returnFocusRef.current;
      if (el instanceof HTMLElement && document.contains(el)) el.focus();
    };
  }, [destination]);

  useEffect(() => {
    if (!destination) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      const active = document.activeElement as HTMLElement | null;
      const target = wrapFocusTarget(focusable, active, e.shiftKey);
      if (target) {
        e.preventDefault();
        target.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [destination, onClose]);

  if (!destination) return null;

  const d = destination;
  const tint = d.kind === "project" ? "var(--color-signal, #3ddc84)" : "var(--color-accent, #f2a13d)";

  return (
    // pointer-events-auto absorbs every click over the full viewport — the
    // scene keeps rendering behind it (see the doc comment above), it just
    // stops being clickable while this is open.
    <div className="pointer-events-auto fixed inset-0 z-20 flex items-end justify-center bg-void/80 p-3 backdrop-blur-sm sm:items-center sm:p-6">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className="panel flex max-h-[82vh] w-full max-w-md flex-col overflow-hidden border bg-card/95"
        style={{ borderColor: `${tint}55` }}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line p-5">
          <div className="min-w-0">
            <p className="kicker">{d.kind === "project" ? "// project" : "// case study"}</p>
            <h2 id={headingId} className="font-display mt-1 text-lg font-bold" style={{ color: tint }}>
              {d.label}
            </h2>
            {d.tagline && <p className="mt-1 text-sm text-zinc-400">{d.tagline}</p>}
            {d.metric && <p className="mt-1 font-mono text-xs" style={{ color: tint }}>{d.metric}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-full border border-line p-1.5 text-zinc-400 transition hover:border-accent hover:text-accent"
          >
            <X size={16} />
          </button>
        </div>

        <div className="min-h-0 overflow-y-auto p-5">
          <p className="text-sm leading-relaxed text-zinc-300">{d.summary}</p>

          {d.bullets.length > 0 && (
            <ul className="mt-4 space-y-2 text-sm leading-relaxed text-zinc-400">
              {d.bullets.map((b, i) => (
                <li key={i} className="flex gap-2">
                  <span aria-hidden="true" className="mt-1 shrink-0" style={{ color: tint }}>
                    ›
                  </span>
                  <span className="min-w-0 break-words">{b}</span>
                </li>
              ))}
            </ul>
          )}

          {d.tags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {d.tags.map((t) => (
                <span key={t} className="rounded-full border border-line px-2.5 py-1 text-xs text-zinc-400">
                  {t}
                </span>
              ))}
            </div>
          )}

          {d.externalLinks.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-3">
              {d.externalLinks.map((l) => (
                <a
                  key={l.url}
                  href={l.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 break-all text-sm font-semibold text-accent underline decoration-accent/40 underline-offset-2 transition hover:decoration-accent"
                >
                  {l.label} <ArrowUpRight size={13} className="shrink-0" />
                </a>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-line p-5">
          <DetailAction destination={d} onClose={onClose} />
        </div>
      </div>
    </div>
  );
}

/** The link to "the full case study" — /hire's own project-vs-anchor
 *  fallback (destinations.ts's `caseStudyDetailLink`), rendered here rather
 *  than re-derived. A room destination never reaches this panel
 *  (Landmarks.tsx only approaches projects/case studies), so `route` is
 *  unreachable in practice — kept for destinations.ts's own completeness,
 *  not dead code this file invented. */
function DetailAction({ destination, onClose }: { destination: Destination; onClose: () => void }) {
  const linkClass =
    "inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-ink transition hover:bg-accent-dim";
  const link = destination.detailLink;
  if (link.kind === "project") {
    return (
      <Link to="/project/$slug" params={{ slug: link.slug }} onClick={onClose} className={linkClass}>
        Full case study <ArrowUpRight size={15} />
      </Link>
    );
  }
  if (link.kind === "home-anchor") {
    return (
      <Link to="/" hash={link.hash} onClick={onClose} className={linkClass}>
        Full case study <ArrowUpRight size={15} />
      </Link>
    );
  }
  return (
    <Link to={link.to} onClick={onClose} className={linkClass}>
      Open <ArrowUpRight size={15} />
    </Link>
  );
}
