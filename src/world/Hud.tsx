import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { LayoutGrid, RotateCcw } from "lucide-react";
import { Compass, Gauges, Onboarding, Toasts, type Toast } from "./Nav.tsx";
import { isCaptured, recapture, setTouchSteer, setTouchThrottle, subscribeCaptured } from "./input.ts";
import type { CraftMode } from "./craftPhysics.ts";
import type { Room } from "../rooms.tsx";

/**
 * The world's DOM overlay — everything a visitor reads or taps that isn't
 * geometry. Rendered as a sibling of `<Canvas>` (World.tsx owns that split),
 * never inside it: R3F's reconciler only understands three.js objects, and
 * putting real DOM here would either not render or fight the Canvas's own
 * pointer handling.
 *
 * This is also the accessibility story for the whole world. The design doc
 * is explicit: a screen reader gets the grid, not a described car — so the
 * canvas is marked aria-hidden by World.tsx, and this HUD is the entire
 * accessible surface of the route while the world is showing. Every control
 * here is a real, labelled, keyboard-reachable element for that reason; there
 * is no "hover to reveal" affordance anywhere in this file.
 */

const MODE_LABEL: Record<CraftMode, string> = {
  wheels: "Wheels",
  hull: "Hull",
  wings: "Wings",
  orbit: "Orbit",
};

// mm:ss.cc — centiseconds are plenty of precision for a course measured in
// single-digit minutes, and reading two digits is easier at a glance than
// three during a run that's still moving.
function formatTime(ms: number): string {
  const totalCentis = Math.floor(ms / 10);
  const centis = totalCentis % 100;
  const totalSeconds = Math.floor(totalCentis / 100);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(centis).padStart(2, "0")}`;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// Half-width/height of a stick's travel, in px. Shared by both controls so
// they read as one family and so the drag math is identical for each.
const STICK_RADIUS = 34;

/**
 * Left thumbstick — horizontal drag only, drives the steer axis via
 * `setTouchSteer`. Vertical offset is tracked purely for the knob's visual
 * position; the contract only asks this stick to drive steer, and giving it
 * a second silent axis nobody asked for is exactly the kind of feature creep
 * that makes a touch control unpredictable to use one-handed.
 *
 * Routed through `setTouchSteer` rather than writing `input.steer` directly
 * (Finding 12): input.ts composes this with whatever the keyboard is holding
 * instead of one source clobbering the other, which matters on any hybrid
 * device — a touchscreen laptop, say — where both can be live at once.
 */
function Thumbstick() {
  const baseRef = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const activePointer = useRef<number | null>(null);

  const updateFromPointer = (e: ReactPointerEvent<HTMLDivElement>) => {
    const base = baseRef.current;
    if (!base) return;
    const rect = base.getBoundingClientRect();
    let dx = e.clientX - (rect.left + rect.width / 2);
    let dy = e.clientY - (rect.top + rect.height / 2);
    const dist = Math.hypot(dx, dy);
    if (dist > STICK_RADIUS) {
      dx = (dx / dist) * STICK_RADIUS;
      dy = (dy / dist) * STICK_RADIUS;
    }
    setKnob({ x: dx, y: dy });
    setTouchSteer(clamp(dx / STICK_RADIUS, -1, 1));
  };

  const release = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (activePointer.current !== e.pointerId) return;
    activePointer.current = null;
    setKnob({ x: 0, y: 0 });
    setTouchSteer(0);
  };

  return (
    <div
      ref={baseRef}
      role="slider"
      aria-label="Steer"
      aria-valuemin={-1}
      aria-valuemax={1}
      aria-valuenow={Math.round((knob.x / STICK_RADIUS) * 100) / 100}
      className="relative h-[76px] w-[76px] touch-none rounded-full border border-line bg-card/80 backdrop-blur"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        activePointer.current = e.pointerId;
        updateFromPointer(e);
      }}
      onPointerMove={(e) => {
        if (activePointer.current === e.pointerId) updateFromPointer(e);
      }}
      onPointerUp={release}
      onPointerCancel={release}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute h-8 w-8 rounded-full bg-accent"
        style={{ left: `calc(50% + ${knob.x}px - 1rem)`, top: `calc(50% + ${knob.y}px - 1rem)` }}
      />
    </div>
  );
}

/** Right pedal — vertical drag only, drives the throttle axis via
 *  `setTouchThrottle`. Push up for forward, down for reverse/brake-adjacent,
 *  same STICK_RADIUS travel as the thumbstick so the two feel like one
 *  control scheme rather than two.
 *
 *  Routed through `setTouchThrottle` rather than writing `input.throttle`
 *  directly (Finding 12): that's also what makes wings mode's pitch axis
 *  work from touch at all — the throttle→pitch mirror lives in input.ts's
 *  shared recompute path, which raw writes to `input.throttle` bypassed
 *  entirely. */
function Pedal() {
  const baseRef = useRef<HTMLDivElement>(null);
  const [knobY, setKnobY] = useState(0);
  const activePointer = useRef<number | null>(null);

  const updateFromPointer = (e: ReactPointerEvent<HTMLDivElement>) => {
    const base = baseRef.current;
    if (!base) return;
    const rect = base.getBoundingClientRect();
    const dy = clamp(e.clientY - (rect.top + rect.height / 2), -STICK_RADIUS, STICK_RADIUS);
    setKnobY(dy);
    setTouchThrottle(clamp(-dy / STICK_RADIUS, -1, 1));
  };

  const release = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (activePointer.current !== e.pointerId) return;
    activePointer.current = null;
    setKnobY(0);
    setTouchThrottle(0);
  };

  return (
    <div
      ref={baseRef}
      role="slider"
      aria-label="Throttle"
      aria-valuemin={-1}
      aria-valuemax={1}
      aria-valuenow={Math.round((-knobY / STICK_RADIUS) * 100) / 100}
      className="relative h-[76px] w-[76px] touch-none rounded-full border border-line bg-card/80 backdrop-blur"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        activePointer.current = e.pointerId;
        updateFromPointer(e);
      }}
      onPointerMove={(e) => {
        if (activePointer.current === e.pointerId) updateFromPointer(e);
      }}
      onPointerUp={release}
      onPointerCancel={release}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 h-8 w-8 -translate-x-1/2 rounded-full bg-accent"
        style={{ top: `calc(50% + ${knobY}px - 1rem)` }}
      />
    </div>
  );
}

export function Hud(props: {
  mode: CraftMode;
  promptRoom: Room | null;
  onConfirm: () => void;
  onShowList: () => void;
  elapsedMs: number | null;
  bestMs: number | null;
  // Optional: the triathlon has no other way to restart once it's running,
  // so World.tsx wires this in wherever it owns that reset logic. Rendered
  // only when supplied — a Hud used somewhere without a restartable run just
  // omits it rather than this file needing to know when that's the case.
  onResetRun?: () => void;
  /** Craft is parked on the triathlon's start line with no run under way. */
  atStartLine?: boolean;
  /** How many of the eight rooms have been entered from the world. */
  exploredCount?: number;
  totalRooms?: number;
  /** Artifacts held, and how many exist. */
  collectedCount?: number;
  artifactTotal?: number;
  toasts?: Toast[];
}) {
  const {
    mode,
    promptRoom,
    onConfirm,
    onShowList,
    elapsedMs,
    bestMs,
    onResetRun,
    atStartLine,
    exploredCount,
    totalRooms,
    collectedCount,
    artifactTotal,
    toasts,
  } = props;

  // Mirrors input.ts's module-level capture flag into React state so this
  // component re-renders on Escape/recapture. A ref-and-poll approach would
  // work too, but capture changes are rare user actions (not a per-frame
  // value like the craft's transform), so a subscription is the cheaper and
  // more direct fit — see input.ts's subscribeCaptured doc.
  const [captured, setCapturedState] = useState(isCaptured());
  useEffect(() => subscribeCaptured(setCapturedState), []);

  return (
    // pointer-events-none on the wrapper: most of this overlay is readout,
    // not control, and it sits directly over the Canvas the craft is driven
    // in — only the pieces that are actually interactive (below) opt back in
    // with pointer-events-auto, so a click anywhere else still reaches R3F.
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between p-3 sm:p-4">
      {/* Touch-only controls get their gate from CSS, not a matchMedia()
          state hook: display:none on a coarse-pointer-only element also
          means it never mounts pointer listeners on a mouse/trackpad visit,
          and it can't desync from a resize the way a one-shot JS check
          could (e.g. a tablet rotated after mount). */}
      <style>{`
        .hud-touch { display: none; }
        @media (pointer: coarse) {
          .hud-touch { display: flex; }
        }
      `}</style>

      <Onboarding />

      <Compass />

      <div className="flex items-start justify-between gap-3">
        {/* Mode indicator. aria-live: mode changes are rare (a handful of
            times per run) and meaningful — worth announcing — unlike the
            timer below, which ticks every frame and would spam a screen
            reader if it were live too. */}
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-auto rounded-full border border-line bg-card/80 px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest text-muted backdrop-blur"
        >
          mode: <span className="text-accent">{MODE_LABEL[mode]}</span>
        </div>

        {elapsedMs === null && atStartLine && (
          <div
            role="status"
            aria-live="polite"
            className="pointer-events-auto rounded-xl border border-accent/40 bg-card/85 px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest text-muted backdrop-blur"
          >
            <span className="text-accent">enter</span> to start the triathlon
            {bestMs !== null && <span className="ml-2">best {formatTime(bestMs)}</span>}
          </div>
        )}

        {elapsedMs !== null && (
          <div className="pointer-events-auto flex flex-col items-end gap-0.5 rounded-xl border border-line bg-card/80 px-3 py-1.5 font-mono text-[11px] text-muted backdrop-blur">
            <span>
              time <span className="text-accent">{formatTime(elapsedMs)}</span>
            </span>
            {bestMs !== null && <span>best {formatTime(bestMs)}</span>}
          </div>
        )}
      </div>

      {/* One wrapper for both the release banner and the room prompt, so the
          outer flex-col's `justify-between` still sees exactly 3 rows
          (top / middle / bottom) whichever of these two is showing — they
          stack rather than fighting over the middle slot. */}
      <div className="flex flex-col items-center gap-2">
        {toasts && toasts.length > 0 && <Toasts items={toasts} />}

        {!captured && (
          // Finding 6's other half: Escape genuinely releases (input.ts), but
          // a visitor who's never told that needs a way to notice AND a way
          // back in that doesn't require already knowing the keyboard shortcut
          // that got them here. role="status"/aria-live: this is exactly as
          // rare and meaningful an event as the mode indicator above, so it
          // gets the same treatment.
          <div
            role="status"
            aria-live="polite"
            className="pointer-events-auto flex w-full max-w-sm flex-col items-center gap-2 rounded-2xl border border-line bg-card/90 px-5 py-4 text-center backdrop-blur"
          >
            <span className="font-display text-base font-bold text-accent">Controls released</span>
            <span className="font-mono text-[11px] uppercase tracking-widest text-muted">
              press a driving key or tap the world to resume
            </span>
            <button
              type="button"
              onClick={recapture}
              className="mt-1 rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-ink transition"
            >
              Resume driving
            </button>
          </div>
        )}

        {promptRoom && (
          // Same family as RoomCard (Playground.tsx): rounded-2xl, border-line,
          // bg-card, the room's tint on the icon well. Reading as the same
          // component language matters here more than most places in the
          // world — this card is the one moment the 3D world and the card grid
          // are describing literally the same action (enter this room).
          <div
            className="pointer-events-auto flex w-full max-w-sm flex-col items-center gap-2 rounded-2xl border bg-card/90 px-5 py-4 text-center backdrop-blur"
            style={{ borderColor: `${promptRoom.tint}55` }}
          >
            <span className="font-display text-base font-bold" style={{ color: promptRoom.tint }}>
              {promptRoom.label}
            </span>
            {/* The dwell is a real one-second timer in World.tsx, and until now
                it was invisible: the prompt said "hold to enter" and then the
                page changed, with nothing in between to say it was working or
                how long was left. The ring drains over exactly DWELL_MS, so
                driving away mid-dwell reads as a cancel rather than a mystery. */}
            <span className="relative flex h-8 w-8 items-center justify-center">
              <svg viewBox="0 0 36 36" className="absolute h-8 w-8 -rotate-90">
                <circle cx="18" cy="18" r="16" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-line" />
                <circle
                  cx="18"
                  cy="18"
                  r="16"
                  fill="none"
                  stroke={promptRoom.tint}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeDasharray="100.5"
                  className="hud-dwell-ring"
                />
              </svg>
            </span>
            <span className="font-mono text-[11px] uppercase tracking-widest text-muted">hold to enter · press Enter</span>
            <button
              type="button"
              onClick={onConfirm}
              className="mt-1 rounded-full px-4 py-1.5 text-sm font-semibold text-ink transition"
              style={{ background: promptRoom.tint }}
            >
              Enter
            </button>
          </div>
        )}
      </div>

      <div className="flex items-end justify-between gap-3">
        <div className="flex items-center gap-2">
          {/* The accessibility escape hatch the design doc calls for: always
              present, never hidden behind hover or a gesture, reachable by Tab
              even while the canvas has "captured" keyboard input (Escape
              releases that capture — see input.ts). */}
          <button
            type="button"
            onClick={onShowList}
            className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-line bg-card/80 px-3 py-1.5 text-sm text-zinc-400 backdrop-blur transition hover:border-accent hover:text-accent"
          >
            <LayoutGrid size={14} /> List view
          </button>

          {/* Only offered once there is a run to reset — it used to render
              unconditionally, so the first thing the HUD told you about the
              triathlon was how to cancel one you had never started. */}
          {onResetRun && elapsedMs !== null && (
            <button
              type="button"
              onClick={onResetRun}
              className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-line bg-card/80 px-3 py-1.5 text-sm text-zinc-400 backdrop-blur transition hover:border-accent hover:text-accent"
            >
              <RotateCcw size={14} /> Reset run
            </button>
          )}
        </div>

        <div className="flex flex-col items-end gap-3 pr-0 sm:pr-16">
          {exploredCount !== undefined && totalRooms !== undefined && (
            <div className="pointer-events-none rounded-full border border-line bg-card/80 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-muted backdrop-blur">
              <span className="text-accent">{exploredCount}</span> / {totalRooms} rooms found
            </div>
          )}
          {collectedCount !== undefined && artifactTotal !== undefined && (
            <div className="pointer-events-none rounded-full border border-line bg-card/80 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-muted backdrop-blur">
              <span style={{ color: "#f0883e" }}>{collectedCount}</span> / {artifactTotal} artifacts
            </div>
          )}
          <Gauges />
          <div className="hud-touch pointer-events-auto items-end gap-4">
            <Thumbstick />
            <Pedal />
          </div>
        </div>
      </div>
    </div>
  );
}
