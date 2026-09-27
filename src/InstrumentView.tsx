import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { facets } from "./data/facets";
import { byChronology, dualStamp, isRecovered } from "./lib/facets";
import { wrapFocusTarget } from "./lib/focusTrap";
import { RIPPLE_DECAY_MS, type Ripple } from "./lib/railGeometry";

/**
 * The rail's expansion: a full-bleed overlay listing every facet as a
 * chronological trace, opened by dragging the rail rightwards or pressing
 * `\`. It never unmounts the route behind it — this is a layer on top, not a
 * replacement — and it does not explain itself: labels name destinations,
 * nothing more.
 *
 * Focus handling is the point of this component. The dialog itself owns the
 * focus trap because the trigger is ambiguous (drag or global hotkey —
 * there's no single "open" button whose focus a browser default would trap
 * for us). The `role="dialog"` element is only ever rendered while `open`
 * — a closed dialog that merely looks hidden (`display:none`/`inert`) still
 * carries the `dialog` role in the accessibility tree, which assistive tech
 * can encounter and announce even though nothing is open. This component
 * function itself (and its hooks) stays mounted for the rail's whole
 * lifetime regardless — only the JSX it returns is conditional — so the
 * routed page behind it is never touched by any of this.
 */

const orderedFacets = byChronology(facets);

const FOCUSABLE_SELECTOR = "a[href], button:not([disabled])";

interface InstrumentViewProps {
  open: boolean;
  onClose: () => void;
  /** The rail's own currently-live ripples (live-rail-spec §3.3/§5) — passed
   *  as a prop rather than lifted into a shared store, since InstrumentView
   *  is already a direct child of AnomalyRail. Real DOM, screen-reader
   *  visible: the same information a sighted visitor gets from hovering a
   *  ripple on the (aria-hidden) canvas, so it isn't sighted-only. Usually
   *  empty — that's the honest state; the rail stays quiet until something
   *  real just happened. */
  recentSignals?: Ripple[];
}

export default function InstrumentView({ open, onClose, recentSignals = [] }: InstrumentViewProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // "Right now" (§3.3) needs to know which of `recentSignals` haven't
  // decayed YET — a real clock, but read only from inside this effect/
  // interval, never during render itself: calling Date.now() at render time
  // is an impure render under the React Compiler (react-hooks/purity), so
  // `now` is state, ticked while the dialog is actually open (and only then —
  // no interval runs for a closed, off-screen dialog).
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!open) {
      setNow(null);
      return;
    }
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [open]);
  const recent = now === null ? [] : recentSignals.filter((r) => now - r.bornAtMs < RIPPLE_DECAY_MS);
  // §3.3: the entrance (@starting-style, on .instrument-view below) had no
  // matching exit — `if (!open) return null` unmounted this instantly. Stay
  // mounted for one more --dur-base beat after `open` goes false (painting
  // `sheet-out`), then actually unmount. Every onClose call site (the close
  // button, Escape, AnomalyRail's own close/route-change paths) is unchanged
  // — they still just flip `open` to false; only what happens *inside* this
  // component between that and the actual unmount is new.
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  const wasOpenRef = useRef(open);
  useEffect(() => {
    if (open) {
      wasOpenRef.current = true;
      setMounted(true);
      setClosing(false);
      return;
    }
    if (!wasOpenRef.current) return;
    wasOpenRef.current = false;
    setClosing(true);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = window.setTimeout(() => setMounted(false), reduced ? 0 : 300);
    return () => window.clearTimeout(t);
  }, [open]);

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
  // not just the tab order, and the cleanup — which React runs on close
  // *and* on unmount — is what guarantees nothing is left permanently inert;
  // a leaked inert would make the whole page unusable.
  //
  // Walks from the dialog UP to (not including) <body>, collecting every
  // sibling at every level, rather than assuming this dialog is itself a
  // direct child of <body>. __root.tsx once put the rail (and this overlay
  // inside it) directly under <body>, but AnomalyRail now sits inside a
  // `<Hydrate>` boundary, which renders its own wrapping marker `<div>` —
  // one more level between <body> and this dialog. Sweeping only
  // `document.body.children` would then mark THAT wrapper inert too, and
  // `inert` is inherited: an inert ancestor makes this whole dialog (and the
  // "first focusable" `.focus()` above) silently inert right along with it.
  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const toInert: HTMLElement[] = [];
    let node: Element = dialog;
    while (node.parentElement && node.parentElement !== document.body) {
      const parent = node.parentElement;
      for (const sibling of Array.from(parent.children)) {
        if (sibling !== node && sibling instanceof HTMLElement) toInert.push(sibling);
      }
      node = parent;
    }
    for (const sibling of Array.from(document.body.children)) {
      if (sibling !== node && sibling instanceof HTMLElement) toInert.push(sibling);
    }
    for (const el of toInert) el.inert = true;
    return () => {
      for (const el of toInert) el.inert = false;
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
        // `inert` on every sibling removes them from the a11y tree and the
        // tab order, but a `window`-level keydown listener still fires —
        // Flipbook, CommandPalette and every other Escape handler on the
        // site listen there. Without this, one Escape closed this overlay
        // AND whatever else was listening underneath it.
        e.stopPropagation();
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

  // Not rendered at all once the exit beat above has run — see the doc
  // comment above. Every effect above the exit timer is still gated on
  // `open` (not `mounted`), so they fire/tear down exactly when they always
  // did; only the JSX stays a beat longer.
  if (!mounted) return null;

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Timeline"
      className={`instrument-view${closing ? " sheet-out" : ""}`}
    >
      <button type="button" onClick={onClose} aria-label="Close" className="ctrl instrument-view-close">
        Esc
      </button>
      <section aria-label="Right now">
        <h2 className="instrument-view-now-heading">Right now</h2>
        {recent.length === 0 ? (
          <p className="instrument-view-now-empty">Nothing just happened — the rail's quiet right now.</p>
        ) : (
          <ul className="instrument-view-now-list">
            {recent.map((r) => (
              <li key={r.id}>{r.label}</li>
            ))}
          </ul>
        )}
      </section>
      <ol className="instrument-view-list">
        {orderedFacets.map((facet) => (
          <li key={facet.id}>
            <Link to={facet.to} hash={facet.hash} onClick={onClose} className="ctrl instrument-view-link">
              <span className="instrument-view-label">{facet.label}</span>
              <span className="instrument-view-stamp">
                {isRecovered(facet, 2) ? dualStamp(facet) : facet.authored}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
