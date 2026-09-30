/** WAVE 6 LANE X3 (time machine UI), swipe compare's DOM half: a draggable
 *  vertical divider over the canvas. The other half — the actual left/right
 *  imagery — is a screen-space split uniform in EarthImagery's shader (this
 *  file paints no pixels of the globe itself, just the handle and the two
 *  date chips). Mounted from TimeScrubber.tsx (this lane's own file) rather
 *  than Globe.tsx, so the compose-layout owner (U1) never needs an edit for
 *  this lane's toggle — see that file's own comment. */
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { isTypingTarget, ownsKey } from "./shortcutTarget.ts";
import { useCompare } from "../timeMachine/compareStore.ts";

const NUDGE_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"]);

function fmtDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-GB", { timeZone: "UTC", day: "2-digit", month: "short", year: "numeric" });
}

export default function CompareDivider() {
  const state = useCompare((s) => s.state);
  const setSplit = useCompare((s) => s.setSplit);
  const nudge = useCompare((s) => s.nudge);
  const close = useCompare((s) => s.close);
  const draggingRef = useRef(false);
  const seamRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // One window-level listener for both Esc-to-exit and the arrow/Home/End
  // nudges (compare.ts's own vocabulary) — a compare session has exactly one
  // focus target worth intercepting keys for, so this skips per-element
  // focus tracking rather than requiring the handle to hold DOM focus.
  useEffect(() => {
    if (!state) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target as HTMLElement | null)) return;
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      } else if (NUDGE_KEYS.has(e.key)) {
        if (e.defaultPrevented || (e.target !== seamRef.current && ownsKey(e.target as HTMLElement | null, e.key))) return;
        e.preventDefault();
        nudge(e.key, e.shiftKey);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [state, close, nudge]);

  useEffect(() => {
    if (!state) return;
    const onMove = (e: PointerEvent) => {
      if (!draggingRef.current || !rootRef.current) return;
      const rect = rootRef.current.getBoundingClientRect();
      setSplit((e.clientX - rect.left) / rect.width);
    };
    window.addEventListener("pointermove", onMove);
    return () => {
      window.removeEventListener("pointermove", onMove);
    };
  }, [state, setSplit]);

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };

  if (!state) return null;
  const pct = state.split * 100;

  // Body-level portal (same fix StreetView.tsx already uses for this exact
  // trap): this component mounts from TimeScrubber, which Globe.tsx nests
  // inside the topbar's `relative z-20` div. That div is a stacking context
  // of its own, so a `fixed` descendant's z-index is only ever compared
  // *inside* it — no z-index this root declares can outrank a sibling like
  // Inspector's z-30 card, which sits outside that context entirely.
  // Compare stays above the Time sheet and below the command palette.
  return createPortal(
    <div ref={rootRef} data-globe-compare className="pointer-events-none fixed inset-0 z-[52]">
      <div
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 truncate rounded-full glass-panel px-2 py-1 font-mono text-xs text-zinc-300"
        style={{ maxWidth: `max(0px, calc(${pct}% - 24px))` }}
      >
        {fmtDate(state.left.dateMs)}
      </div>
      <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-full glass-panel px-2 py-1 font-mono text-xs text-zinc-300">
        Today
      </div>
      <div
        ref={seamRef}
        data-globe-compare-divider
        role="slider"
        aria-label="Compare divider: drag or use arrow keys to reveal the past or today"
        aria-valuemin={2}
        aria-valuemax={98}
        aria-valuenow={Math.round(pct)}
        tabIndex={0}
        onPointerDown={(e) => {
          draggingRef.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          e.currentTarget.focus();
        }}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
        className="pointer-events-auto absolute inset-y-0 flex w-11 touch-none -translate-x-1/2 cursor-ew-resize items-center justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        style={{ left: `${pct}%` }}
      >
        <div className="h-full w-px bg-accent/70" />
        <div className="absolute flex h-8 w-8 items-center justify-center rounded-full glass-panel">
          <div className="h-3 w-px bg-accent" />
        </div>
      </div>
      <button
        type="button"
        onClick={close}
        aria-label="Exit compare"
        className="ctrl-icon pointer-events-auto absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full glass-panel text-zinc-300 hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      >
        <X size={16} />
      </button>
    </div>,
    document.body
  );
}
