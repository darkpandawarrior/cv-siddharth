import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Link } from "@tanstack/react-router";
import { Eraser, LayoutGrid, Orbit as OrbitIcon, Play, Volume2, VolumeX, Hand, Sunrise } from "lucide-react";
import { usePresence } from "@playhtml/react";
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
  touchThrottleFromDrag,
} from "./input.ts";
import { isMuted, toggleMuted } from "./audio.ts";
import { resetProgress } from "./progressReset.ts";
import type { Room } from "../rooms.tsx";
import type { SkyState } from "../lib/sky.ts";
import { useNow, useWeather } from "../lib/useSky.ts";
import { useLiveSignal } from "../lib/useLiveSignal.ts";
import type { GithubActivity } from "../../api/_lib/github-activity-handler.ts";
import type { Ops } from "../../api/_lib/ops-handler.ts";
import { useTouched } from "../lib/sessionRipple.ts";
import { GHOST_CHANNEL, type GhostPresence } from "./Ghosts.tsx";
import { buildRealityRows, recentPushes, type LedgerRow } from "./realityRows.ts";
import { rainMode } from "./Rain.tsx";
import { deviceTier } from "./deviceTier.ts";
import { prefersReducedMotion } from "./reducedMotion.ts";
import type { LampPrompt } from "./Lamps.tsx";
import { worldPalette } from "./palette.ts";

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

// One-thumb auto-throttle: the corner-collision fix (see Thumbstick's own
// doc comment) is that a phone has one thumb, and it steers. Committing
// throttle to a constant means that thumb never has to hold a vertical
// position at all — drag left/right to steer and the cart just goes; drag
// down is the one throttle gesture auto can't substitute for, so it still
// commands a proportional brake/reverse.
//
// ponytail: no live in-HUD toggle between auto and the old proportional-Y
// stick — this constant IS the fallback switch. Flip it to `false` if
// auto-throttle proves worse than the manual stick once actually driven on
// a phone; every other line below is written to make that a one-line
// revert, not a rewrite.
const TOUCH_AUTO_THROTTLE = true;
const AUTO_THROTTLE_FORWARD = 0.72; // a cruise, not a floor — boost still has headroom above it

/**
 * The one touch control — steer on X, auto-throttle by default.
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
 * one control, and one control has to carry both axes — but "both axes" turned
 * out to mean steer-plus-brake, not steer-plus-throttle: a combined X/Y stick
 * still asks the thumb to hold a vertical position just to keep moving, which
 * is exactly the one-handed unpredictability the original horizontal-only
 * design was trying to avoid. `TOUCH_AUTO_THROTTLE` above is that fix: drag
 * left/right to steer and the cart cruises forward on its own; drag down
 * still brakes and reverses, proportionally, because that's a deliberate
 * "slow down" the auto throttle should never override.
 *
 * Routed through `setTouchSteer`/`setTouchThrottle` rather than writing
 * `input.steer`/`input.throttle` directly (Finding 12): input.ts composes
 * this with whatever the keyboard is holding instead of one source
 * clobbering the other, which matters on any hybrid device — a touchscreen
 * laptop, say — where both can be live at once.
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
    setTouchThrottle(touchThrottleFromDrag(dy, STICK_RADIUS, TOUCH_AUTO_THROTTLE, AUTO_THROTTLE_FORWARD));
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
      aria-label={
        TOUCH_AUTO_THROTTLE
          ? "Steer: drag left or right. Throttle is automatic; drag down to brake or reverse"
          : "Steer and throttle: drag left or right to steer, up to drive, down to reverse"
      }
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

/** `HH:MM` in IST from minutes-since-midnight — the scrubber's own unit
 *  (a `<input type="range">` reports a plain number, and 00:00-23:59 IST
 *  is what reality-spec §4.3 asks for, not a UTC offset a reader would
 *  have to do math on). */
function hhmm(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** `previewAt` (a real Date, IST-anchored to "today") <-> the scrubber's
 *  own minutes-since-midnight-IST unit. IST is a fixed UTC+05:30 offset
 *  with no DST, so the conversion is one add, never a timezone library. */
const IST_OFFSET_MIN = 5.5 * 60;
function previewAtToMinutes(d: Date): number {
  const utcMinutes = d.getUTCHours() * 60 + d.getUTCMinutes();
  return (utcMinutes + IST_OFFSET_MIN) % 1440;
}
function minutesToPreviewAt(minutes: number, base: Date): Date {
  const dayStart = Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate());
  return new Date(dayStart + (minutes - IST_OFFSET_MIN) * 60_000);
}

/**
 * THE REALITY LEDGER (reality-spec §4.3, master-plan.md#M17/#P1-05) — every
 * live input the world reads, in one place, toggled by the `R` key or the
 * "Reality" button. Data gathering lives here rather than in World.tsx:
 * every value below is read off the SAME shared buses (`useLiveSignal`,
 * `useWeather`, `usePresence`, `useTouched`) every other live surface on
 * the site already reads, so this panel costs no second fetch and no
 * second clock — `sky` is the one exception, handed down as a prop, since
 * World.tsx is already the single caller of `useSky()` (skyBinding.ts's own
 * doc comment explains why).
 */
function RealityLedger({
  open,
  sky,
  previewAt,
  onPreviewChange,
}: {
  open: boolean;
  sky: SkyState | null;
  previewAt: Date | null;
  onPreviewChange: (d: Date | null) => void;
}) {
  const { air, river } = useWeather();
  const { data: activity } = useLiveSignal<GithubActivity>("/api/github-activity");
  const { data: ops } = useLiveSignal<Ops>("/api/ops");
  const { presences } = usePresence<GhostPresence>(GHOST_CHANNEL);
  const touched = useTouched();
  // useSky.ts's own `useNow()` rather than a direct `Date.now()` read here
  // (a call to an impure function during render is a react-hooks/purity
  // error) — see Lamps.tsx's identical fix.
  const now = useNow();

  const lampPushes = useMemo(() => (now ? recentPushes(activity?.items ?? [], now.getTime()) : []), [activity, now]);
  const visitorCount = useMemo(
    () => Array.from(presences.values()).filter((p) => !p.isMe).length,
    [presences],
  );

  const rows: LedgerRow[] = useMemo(
    () =>
      buildRealityRows({
        sky,
        air,
        river,
        lampPushes,
        visitorCount,
        ops: ops ?? null,
        touched,
      }),
    [sky, air, river, lampPushes, visitorCount, ops, touched],
  );

  if (!open) return null;

  const previewMinutes = previewAt ? previewAtToMinutes(previewAt) : null;

  return (
    <div
      role="dialog"
      aria-label="Reality ledger"
      className="pointer-events-auto flex w-full max-w-md flex-col gap-2 rounded-2xl border border-line bg-card/95 p-4 backdrop-blur"
    >
      <div
        className="flex items-center justify-between text-text"
        style={previewAt ? { color: "var(--state-degraded)" } : undefined}
      >
        <span className="flex items-center gap-1.5 font-display text-sm font-bold">
          <Sunrise size={14} /> Reality
        </span>
        {previewAt && (
          <span className="font-mono text-xs uppercase tracking-widest">PREVIEW {hhmm(previewMinutes!)} IST, not live</span>
        )}
      </div>

      <ul className="flex flex-col gap-1 font-mono text-xs text-text">
        {rows.map((row) => (
          // A per-key attribute (reality-spec §4.3: "each row has a
          // data-reality-* attribute"), not a shared `data-reality="key"` —
          // the acceptance line reads `[data-reality-you]`, a real attribute
          // name, not an attribute VALUE to filter on.
          <li key={row.key} data-reality-row {...{ [`data-reality-${row.key}`]: "" }}>
            {row.text}
          </li>
        ))}
      </ul>

      <div className="flex items-center gap-2 pt-1">
        <input
          type="range"
          min={0}
          max={1439}
          value={previewMinutes ?? previewAtToMinutes(new Date())}
          aria-label="Preview a time of day (IST)"
          onChange={(e) => onPreviewChange(minutesToPreviewAt(Number(e.target.value), sky?.now ?? new Date()))}
          className="flex-1"
        />
        {previewAt && (
          <button
            type="button"
            onClick={() => onPreviewChange(null)}
            className="rounded-full border border-line bg-card/80 px-2.5 py-1 text-xs text-zinc-400 hover:border-accent hover:text-accent"
          >
            Back to now
          </button>
        )}
      </div>

      <p className="pt-1 text-xs text-muted">Nothing fetched here is hidden when it fails. It is marked.</p>
    </div>
  );
}

export function Hud(props: {
  promptRoom: Room | null;
  /** The project/case-study equivalent of `promptRoom` — Landmarks.tsx's
   *  own approach prompt, carrying only what the card needs to render. */
  promptLandmark: { label: string; tint: string } | null;
  /** Lamps.tsx's own approach prompt (§4.2) — reuses this same `PromptCard`
   *  family, verb "view", `onConfirm` opening the commit's GitHub link. */
  promptLamp: LampPrompt | null;
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
  /** R4 — the one shared sky every page reads (P1/P2), handed down rather
   *  than read here a second time; see skyBinding.ts's own doc comment. */
  sky: SkyState | null;
  /** The day scrubber's own state — `null` is "now," the default. */
  previewAt: Date | null;
  onPreviewChange: (d: Date | null) => void;
}) {
  const {
    promptRoom,
    promptLandmark,
    promptLamp,
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
    sky,
    previewAt,
    onPreviewChange,
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

  // The Reality ledger's own open/closed state (§4.3: the `R` key or the
  // "Reality" button) — local, not a subscription: nothing outside this
  // component ever needs to know it's open.
  const [ledgerOpen, setLedgerOpen] = useState(false);
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "r") return;
      const target = e.target as HTMLElement | null;
      if (target && /^(input|textarea|select)$/i.test(target.tagName)) return;
      setLedgerOpen((v) => !v);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // The rain layer's own render state (Rain.tsx's identical `rainMode`),
  // restated here as a DOM marker: Rain.tsx draws inside the Canvas
  // (`aria-hidden`, no DOM per-instance), so this is the one place a test
  // (or an assistive script) can read "is it actually raining right now"
  // without inspecting the WebGL scene graph.
  const dataRealityRain = rainMode(sky?.weather?.precipMmH ?? 0, prefersReducedMotion(), deviceTier());

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

      {/* Not visible — the one place Rain.tsx's own render state (no DOM of
          its own, inside the Canvas) reaches the DOM at all: a Playwright
          probe, or an assistive script, reads this instead of the WebGL
          scene graph. */}
      <span className="sr-only" data-reality-rain={dataRealityRain} />

      <Onboarding onTour={() => setAutoDriving(true)} />

      <Waypoint target={waypoint} auto={auto} />

      <div className="pointer-events-auto flex w-full justify-center">
        <RealityLedger open={ledgerOpen} sky={sky} previewAt={previewAt} onPreviewChange={onPreviewChange} />
      </div>

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

        {promptLamp && (
          // Lamps.tsx's own approach card (reality-spec §4.2: "fires the
          // existing Landmarks onPrompt HUD card") — reusing this same
          // `PromptCard` component is that reuse: Landmarks.tsx's own
          // sensor is untouched (out of this lane's ownership), so a lamp's
          // proximity is edge-detected independently (Lamps.tsx) and
          // rendered through the identical card language. "View" opens the
          // commit on GitHub in a new tab rather than navigating this page
          // away from a running drive.
          <PromptCard
            label={`${promptLamp.repo} · ${promptLamp.message} · ${promptLamp.ageLabel}`}
            tint={worldPalette().accent}
            verb="view"
            onConfirm={() => window.open(promptLamp.url, "_blank", "noopener,noreferrer")}
          />
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
            aria-pressed={ledgerOpen}
            onClick={() => setLedgerOpen((v) => !v)}
            className={`pointer-events-auto flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm backdrop-blur transition ${
              ledgerOpen
                ? "border-accent bg-accent/15 text-accent"
                : "border-line bg-card/80 text-zinc-400 hover:border-accent hover:text-accent"
            }`}
          >
            <Sunrise size={14} /> <span className="hidden sm:inline">Reality</span>
            <span className="sr-only sm:hidden">Toggle the Reality ledger</span>
          </button>

          <button
            type="button"
            onClick={onShowList}
            className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-line bg-card/80 px-3 py-1.5 text-sm text-zinc-400 backdrop-blur transition hover:border-accent hover:text-accent"
          >
            <LayoutGrid size={14} /> List view
          </button>
          {/* STREET's own exit to ORBIT — the atlas's other altitude, the same
              registry and includeBuild edges seen from space rather than
              driven. /map's own "Walk the streets" link is this button's
              mirror image. */}
          <Link
            to="/map"
            className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-line bg-card/80 px-3 py-1.5 text-sm text-zinc-400 backdrop-blur transition hover:border-accent hover:text-accent"
          >
            <OrbitIcon size={14} /> Orbit
          </Link>
          </div>
        </div>

        {/* pb-16 on a phone lifts the gauges clear of the chat launcher, which
            is fixed at bottom-6 right-6 and was overlapping this panel. */}
        <div className="flex flex-col items-end gap-3 pb-16 pr-0 sm:pb-0 sm:pr-16">
          {/* Hidden on the narrowest screens, where the touch sticks and the
              gauge panel already own this column — the waypoint above carries
              the navigation on a phone. */}
          <div className="hidden sm:flex sm:flex-col sm:items-end sm:gap-1.5">
            <Minimap visited={visited} targetTo={waypointTo} />
            {/* The atlas legend, same markup as /map's own (StoryMap.tsx) so
                "solid = measured, dashed = declared" reads as one convention
                across all three altitudes rather than three different keys. */}
            <div className="flex items-center gap-3 rounded-full border border-line bg-card/80 px-3 py-1 text-[10px] text-muted backdrop-blur">
              <span className="flex items-center gap-1">
                <svg width="12" height="2" aria-hidden><line x1="0" y1="1" x2="12" y2="1" stroke="currentColor" strokeWidth="1.5" /></svg>
                measured
              </span>
              <span className="flex items-center gap-1">
                <svg width="12" height="2" aria-hidden><line x1="0" y1="1" x2="12" y2="1" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3,2.5" /></svg>
                declared
              </span>
            </div>
          </div>
          <Gauges collected={collectedCount} artifactTotal={artifactTotal} rooms={exploredCount} totalRooms={totalRooms} />
        </div>
      </div>
    </div>
  );
}
