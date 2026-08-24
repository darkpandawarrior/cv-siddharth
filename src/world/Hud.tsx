import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Eraser, LayoutGrid, Play, Volume2, VolumeX, Hand } from "lucide-react";
import {
  Gauges,
  Minimap,
  Onboarding,
  StuckNotice,
  Toasts,
  Waypoint,
  type Toast,
  type WaypointTarget,
} from "./Nav.tsx";
import {
  isAutoDriving,
  isCaptured,
  recapture,
  setAutoDriving,
  setTouchSteer,
  setTouchThrottle,
  subscribeAuto,
  subscribeCaptured,
  toggleAutoDriving,
} from "./input.ts";
import { isMuted, toggleMuted } from "./audio.ts";
import { resetProgress } from "./progressReset.ts";
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



const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// Half-width/height of a stick's travel, in px. Shared by both controls so
// they read as one family and so the drag math is identical for each.
const STICK_RADIUS = 34;

/**
 * The one touch control — steer on X, throttle on Y.
 *
 * It used to be horizontal-only, with the vertical offset tracked for the
 * knob's look and deliberately not wired to anything: "giving it a second
 * silent axis nobody asked for is exactly the kind of feature creep that
 * makes a touch control unpredictable to use one-handed." That was the right
 * call while a separate Pedal owned throttle. It stopped being right when the
 * two were measured on a phone.
 *
 * At 390px the stick and the pedal were 168px of controls flush against the
 * right edge (x=222 to 390), in the same column as the gauge panel, with the
 * chat launcher — fixed bottom-6 right-6, 56px — sitting on top of both. Three
 * layers competing for one corner. Rearranging them is a smaller change and a
 * worse one: the real fix is that a phone has one thumb, so the world needs
 * one control, and one control has to carry both axes.
 *
 * So: drag left/right to steer, up to drive, down to brake and reverse. The
 * pedal is gone and this moved to the bottom LEFT, where nothing else lives.
 *
 * Up is forward, which means throttle is the NEGATION of screen Y.
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
    // Screen Y grows downward; the driver expects up to mean forward.
    setTouchThrottle(clamp(-dy / STICK_RADIUS, -1, 1));
  };

  const release = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (activePointer.current !== e.pointerId) return;
    activePointer.current = null;
    setKnob({ x: 0, y: 0 });
    setTouchSteer(0);
    setTouchThrottle(0);
  };

  return (
    <div
      ref={baseRef}
      role="slider"
      // aria-valuenow reports STEER, the primary axis, because a slider has
      // one value and inventing a second role here would trade a real axe
      // pass for a worse one. Throttle is the same gesture's vertical
      // component; the accessible path to this world is the keyboard (see
      // input.ts) and the List view, both of which are always present.
      aria-label="Steer and throttle: drag left or right to steer, up to drive, down to reverse"
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

/**
 * Wipes everything the world remembers and reloads into a fresh one.
 *
 * Two-step on purpose: this throws away collected artifacts and unlocked
 * milestones, and a single mis-click next to "List view" destroying an hour of
 * exploring would be its own bug. The second press is the confirmation.
 */
function ResetButton() {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    // Disarms itself, so an accidental first press does not sit there waiting
    // to become a destructive second press five minutes later.
    const t = window.setTimeout(() => setArmed(false), 4000);
    return () => window.clearTimeout(t);
  }, [armed]);
  return (
    <button
      type="button"
      onClick={() => {
        if (!armed) {
          setArmed(true);
          return;
        }
        resetProgress();
        window.location.reload();
      }}
      className={`pointer-events-auto flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm backdrop-blur transition ${
        armed
          ? "border-[var(--color-warn)] bg-card text-[var(--color-warn)]"
          : "border-line bg-card/80 text-zinc-400 hover:border-accent hover:text-accent"
      }`}
    >
      <Eraser size={14} />
      {armed ? "Erase everything?" : <span className="sr-only">Reset world progress</span>}
    </button>
  );
}

/**
 * The auto-drive toggle.
 *
 * A real, labelled, always-visible button rather than a keybinding alone: the
 * whole point of auto-drive is to serve the visitor who has not read anything,
 * and "press T" is a thing you only know if you read the card they skipped.
 * Wide and worded in the on state ("Auto-driving · tap to take over") because
 * that is the state where a visitor most needs to know that they CAN take over
 * — a car steering itself with no visible explanation reads as broken input.
 */
function AutoToggle({ on }: { on: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => toggleAutoDriving()}
      className={`pointer-events-auto flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm backdrop-blur transition ${
        on
          ? "border-accent bg-accent/15 text-accent"
          : "border-line bg-card/80 text-zinc-400 hover:border-accent hover:text-accent"
      }`}
    >
      {on ? <Hand size={14} /> : <Play size={14} />}
      <span className="hidden sm:inline">{on ? "Auto-driving · take over" : "Drive me there"}</span>
      <span className="sr-only sm:hidden">{on ? "Stop auto-driving" : "Auto-drive to the next room"}</span>
    </button>
  );
}

function SoundToggle() {
  const [muted, setMuted] = useState(() => isMuted());
  return (
    <button
      type="button"
      aria-pressed={muted}
      onClick={() => setMuted(toggleMuted())}
      className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-line bg-card/80 px-3 py-1.5 text-sm text-zinc-400 backdrop-blur transition hover:border-accent hover:text-accent"
    >
      {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
      <span className="sr-only">{muted ? "Unmute world sound" : "Mute world sound"}</span>
    </button>
  );
}

/** A room's prompt and a landmark's prompt are the same card wearing two
 *  verbs — extracted so the world's ONE dwell-then-confirm affordance has
 *  one piece of markup, not two copies that could drift apart in styling.
 *  The dwell ring itself is real: DWELL_MS in World.tsx (via dwell.ts) is
 *  what it drains over, for whichever mechanism is currently prompting. */
function PromptCard({
  label,
  tint,
  verb,
  onConfirm,
}: {
  label: string;
  tint: string;
  verb: "enter" | "view";
  onConfirm: () => void;
}) {
  return (
    <div
      className="pointer-events-auto flex w-full max-w-sm flex-col items-center gap-2 rounded-2xl border bg-card/90 px-5 py-4 text-center backdrop-blur"
      style={{ borderColor: `${tint}55` }}
    >
      <span className="font-display text-base font-bold" style={{ color: tint }}>
        {label}
      </span>
      {/* The dwell is a real ~one-second timer (dwell.ts), and until now it
          was invisible: the prompt said "hold to enter" and then the page
          changed, with nothing in between to say it was working or how long
          was left. The ring drains over exactly the dwell duration, so
          driving away mid-dwell reads as a cancel rather than a mystery. */}
      <span className="relative flex h-8 w-8 items-center justify-center">
        <svg viewBox="0 0 36 36" className="absolute h-8 w-8 -rotate-90">
          <circle cx="18" cy="18" r="16" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-line" />
          <circle
            cx="18"
            cy="18"
            r="16"
            fill="none"
            stroke={tint}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray="100.5"
            className="hud-dwell-ring"
          />
        </svg>
      </span>
      <span className="font-mono text-[11px] uppercase tracking-widest text-muted">
        hold to {verb} · press Enter
      </span>
      <button
        type="button"
        onClick={onConfirm}
        className="mt-1 rounded-full px-4 py-1.5 text-sm font-semibold text-ink transition"
        style={{ background: tint }}
      >
        {verb === "enter" ? "Enter" : "View"}
      </button>
    </div>
  );
}

export function Hud(props: {
  promptRoom: Room | null;
  /** The project/case-study equivalent of `promptRoom` — Landmarks.tsx's
   *  own approach prompt, carrying only what the card needs to render. */
  promptLandmark: { label: string; tint: string } | null;
  onConfirm: () => void;
  onShowList: () => void;
  /** Where the world is currently pointing the driver. */
  waypoint: WaypointTarget | null;
  /** That waypoint's route, so the minimap can halo the same dot. */
  waypointTo: string | null;
  /** Rooms already entered, for the minimap's filled dots. */
  visited: ReadonlySet<string>;
  /** How many of the eight rooms have been entered from the world. */
  exploredCount?: number;
  totalRooms?: number;
  /** Artifacts held, and how many exist. */
  collectedCount?: number;
  artifactTotal?: number;
  toasts?: Toast[];
}) {
  const {
    promptRoom,
    promptLandmark,
    onConfirm,
    onShowList,
    waypoint,
    waypointTo,
    visited,
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
  // Same pattern for auto-drive, and it has to be a subscription rather than
  // local state: auto is turned OFF from three places this component can't see
  // — the T key, Escape, and a hand on the wheel (input.ts hands the axes back
  // the moment a driving control moves). A button holding its own `on` flag
  // would go stale the first time any of those fired.
  const [auto, setAuto] = useState(isAutoDriving());
  useEffect(() => subscribeAuto(setAuto), []);

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

      <Onboarding onTour={() => setAutoDriving(true)} />

      <Waypoint target={waypoint} auto={auto} />

      {/* One wrapper for both the release banner and the room prompt, so the
          outer flex-col's `justify-between` still sees exactly 3 rows
          (top / middle / bottom) whichever of these two is showing — they
          stack rather than fighting over the middle slot. */}
      <div className="flex flex-col items-center gap-2">

        <StuckNotice />

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
          <PromptCard label={promptRoom.label} tint={promptRoom.tint} verb="enter" onConfirm={onConfirm} />
        )}

        {promptLandmark && (
          // The project/case-study equivalent — same dwell ring, same
          // family, different verb: entering a landmark opens an in-world
          // panel over the running scene rather than navigating anywhere.
          <PromptCard label={promptLandmark.label} tint={promptLandmark.tint} verb="view" onConfirm={onConfirm} />
        )}
      </div>

      {/* Side by side, this row does not fit a phone. Measured at 390px: the
          button row plus the stick is about 250px, which squeezed the gauge
          panel — a fixed w-44, so it cannot shrink — to x=245 and a right edge
          of 421. Thirty-one pixels off the screen, and silently, because
          html{overflow-x:hidden} clips rather than scrolls.
          So it stacks below sm: gauges on top, controls underneath, each
          column keeping its own alignment. col-reverse rather than reordering
          the JSX, so the DOM order still reads controls-then-readout for a
          screen reader and the tab order is unchanged. */}
      <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col items-start gap-3">
          {/* The one touch control, bottom LEFT. It used to share the
              bottom-right column with the gauges and the chat launcher, which
              is where all three collided on a phone. Nothing else lives on
              this side. */}
          <div className="hud-touch pointer-events-auto items-end">
            <Thumbstick />
          </div>
          <div className="flex items-center gap-2">
          {/* The accessibility escape hatch the design doc calls for: always
              present, never hidden behind hover or a gesture, reachable by Tab
              even while the canvas has "captured" keyboard input (Escape
              releases that capture — see input.ts). */}
          {/* Sound is on by default but always one click from off, and the
              choice persists. A portfolio that cannot be silenced is one people
              close the tab on. */}
          <AutoToggle on={auto} />
          <SoundToggle />
          <ResetButton />

          <button
            type="button"
            onClick={onShowList}
            className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-line bg-card/80 px-3 py-1.5 text-sm text-zinc-400 backdrop-blur transition hover:border-accent hover:text-accent"
          >
            <LayoutGrid size={14} /> List view
          </button>
          </div>
        </div>

        {/* pb-16 on a phone lifts the gauges clear of the chat launcher, which
            is fixed at bottom-6 right-6 and was overlapping this panel. */}
        <div className="flex flex-col items-end gap-3 pb-16 pr-0 sm:pb-0 sm:pr-16">
          {/* Hidden on the narrowest screens, where the touch sticks and the
              gauge panel already own this column — the waypoint above carries
              the navigation on a phone. */}
          <div className="hidden sm:block">
            <Minimap visited={visited} targetTo={waypointTo} />
          </div>
          <Gauges collected={collectedCount} artifactTotal={artifactTotal} rooms={exploredCount} totalRooms={totalRooms} />
        </div>
      </div>
    </div>
  );
}
