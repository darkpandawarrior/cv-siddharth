import { useEffect, useRef } from "react";
import { facets } from "./data/facets";
import { byChronology, dualStamp, isRecovered } from "./lib/facets";
import { wrapFocusTarget } from "./lib/focusTrap";

/**
 * The rail's expansion: a full-bleed overlay listing every facet as a
 * chronological trace, opened by dragging the rail rightwards or pressing
 * `\`. It never unmounts the route behind it — this is a layer on top, not a
 * replacement — and it does not explain itself: labels name destinations,
 * nothing more.
 *
 * Focus handling is the point of this component. It is always mounted
 * (marked `inert` while closed) so opening/closing never remounts anything
 * and can carry a CSS transition; the dialog itself owns the focus trap
 * because the trigger is ambiguous (drag or global hotkey — there's no
 * single "open" button whose focus a browser default would trap for us).
 */

const orderedFacets = byChronology(facets);

const FOCUSABLE_SELECTOR = "a[href], button:not([disabled])";

interface InstrumentViewProps {
  open: boolean;
  onClose: () => void;
}

export default function InstrumentView({ open, onClose }: InstrumentViewProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Move focus in the moment the overlay opens. Closing's focus return is
  // the caller's job (AnomalyRail owns "the rail element" this returns to).
  useEffect(() => {
    if (!open) return;
    const first = dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    first?.focus();
  }, [open]);

  // Inert everything else at the document.body level while open. Trapping
  // Tab (below) only stops keyboard focus from leaving the dialog — a screen
  // reader's browse-mode virtual cursor ignores Tab order entirely and would
  // still walk the routed content, the rail, the skip link etc. behind the
  // overlay. `inert` removes that whole subtree from the accessibility tree,
  // not just the tab order. Every body-level sibling gets it (this dialog
  // and __root.tsx's structure put the rail, the routed page, and this
  // overlay all as direct children of <body>), and the cleanup — which React
  // runs on close *and* on unmount — is what guarantees nothing is left
  // permanently inert; a leaked inert would make the whole page unusable.
  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const siblings = Array.from(document.body.children).filter(
      (el): el is HTMLElement => el instanceof HTMLElement && el !== dialog,
    );
    for (const el of siblings) el.inert = true;
    return () => {
      for (const el of siblings) el.inert = false;
    };
  }, [open]);

  // Background scroll lock. Plain `overflow: hidden` rather than the classic
  // `position: fixed` body trick — that trick has to record scrollY and
  // reapply it as a negative `top` on open, then re-scroll on close, or the
  // page silently jumps to 0. Overflow alone freezes scrolling in place
  // without ever touching scrollY, so there's nothing to restore.
  useEffect(() => {
    if (!open) return;
    const { style } = document.body;
    const prevOverflow = style.overflow;
    style.overflow = "hidden";
    return () => {
      style.overflow = prevOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
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
  }, [open, onClose]);

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Timeline"
      // Kept mounted at all times so the route underneath never unmounts;
      // `inert` (not `display: none`) is what actually removes it from the
      // a11y tree and the tab order while closed, so it costs axe nothing.
      inert={!open}
      className={`instrument-view${open ? " instrument-view-open" : ""}`}
    >
      <button type="button" onClick={onClose} aria-label="Close" className="instrument-view-close">
        Esc
      </button>
      <ol className="instrument-view-list">
        {orderedFacets.map((facet) => (
          <li key={facet.id}>
            <a href={facet.href} onClick={onClose} className="instrument-view-link">
              <span className="instrument-view-label">{facet.label}</span>
              <span className="instrument-view-stamp">
                {isRecovered(facet, 2) ? dualStamp(facet) : facet.authored}
              </span>
            </a>
          </li>
        ))}
      </ol>
    </div>
  );
}
