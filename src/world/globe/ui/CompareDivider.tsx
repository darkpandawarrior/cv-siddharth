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
import { useCompare } from "../timeMachine/compareStore.ts";

function isTypingTarget(el: EventTarget | null): boolean {
  return el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
}

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
  const rootRef = useRef<HTMLDivElement>(null);

  // One window-level listener for both Esc-to-exit and the arrow/Home/End
  // nudges (compare.ts's own vocabulary) — a compare session has exactly one
  // focus target worth intercepting keys for, so this skips per-element
  // focus tracking rather than requiring the handle to hold DOM focus.
  useEffect(() => {
    if (!state) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      } else if (NUDGE_KEYS.has(e.key)) {
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
    const onUp = () => {
      draggingRef.current = false;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [state, setSplit]);

  if (!state) return null;
  const pct = state.split * 100;

  // Body-level portal (same fix StreetView.tsx already uses for this exact
  // trap): this component mounts from TimeScrubber, which Globe.tsx nests
  // inside the topbar's `relative z-20` div. That div is a stacking context
  // of its own, so a `fixed` descendant's z-index is only ever compared
  // *inside* it — no z-index this root declares can outrank a sibling like
  // Inspector's z-30 card, which sits outside that context entirely.
  // Portalling to document.body escapes it, so z-50 here actually wins.
  return createPortal(
    <div ref={rootRef} data-globe-compare className="pointer-events-none fixed inset-0 z-50">
      <div
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 truncate rounded-full border border-line bg-ink/70 px-2 py-1 font-mono text-xs text-zinc-300 backdrop-blur"
        style={{ maxWidth: `max(0px, calc(${pct}% - 24px))` }}
      >
        {fmtDate(state.left.dateMs)}
      </div>
      <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-full border border-line bg-ink/70 px-2 py-1 font-mono text-xs text-zinc-300 backdrop-blur">
        Today
      </div>
      <div
        data-globe-compare-divider
        role="slider"
        aria-label="Compare divider: drag or use arrow keys to reveal the past or today"
        aria-valuemin={2}
        aria-valuemax={98}
        aria-valuenow={Math.round(pct)}
        tabIndex={0}
        onPointerDown={(e) => {
          draggingRef.current = true;
          (e.target as HTMLElement).focus();
        }}
        className="pointer-events-auto absolute inset-y-0 flex w-8 -translate-x-1/2 cursor-ew-resize items-center justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        style={{ left: `${pct}%` }}
      >
        <div className="h-full w-px bg-accent/70" />
        <div className="absolute flex h-8 w-8 items-center justify-center rounded-full border border-line bg-ink/80 backdrop-blur">
          <div className="h-3 w-px bg-accent" />
        </div>
      </div>
      <button
        type="button"
        onClick={close}
        aria-label="Exit compare"
        className="ctrl-icon pointer-events-auto absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full border border-line bg-ink/70 text-zinc-300 backdrop-blur hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      >
        <X size={14} />
      </button>
    </div>,
    document.body
  );
}
