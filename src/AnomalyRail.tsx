import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useRouterState } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { facets } from "./data/facets";
import { byChronology, dualStamp } from "./lib/facets";
import {
  baselineTicks,
  deviationsFor,
  hitTest,
  ambientAlpha,
  hazeFromAqi,
  decayAlpha,
  rippleY,
  withRipple,
  pruneRipples,
  didChange,
  didIncrease,
  stateFlips,
  didNewPush,
  didAircraftArrive,
  RIPPLE_DECAY_MS,
  type Ripple,
} from "./lib/railGeometry";
import { useCanvasLoop } from "./labs/useCanvasLoop";
import InstrumentView from "./InstrumentView";
import { SECTION_ID_LIST, type SectionId, useSectionNav } from "./lib/navigation.ts";
import { SECTION_JUMPS } from "./CommandPalette.tsx";
// Reality ripples (live-rail-spec §3.1/§7 Lane A) — every source below is an
// EXISTING poll this app already runs elsewhere; AnomalyRail becomes one more
// subscriber on useLiveSignal's shared bus (zero new fetches when mounted
// alongside e.g. OpsBoard/CiStrip, one more at the source's own interval
// otherwise — useLiveSignal.ts's own doc comment).
import { useSignals } from "./lib/useLive.ts";
import { useWeather } from "./lib/useSky.ts";
import { useLiveSignal } from "./lib/useLiveSignal.ts";
import { usePresenceCount } from "./play/presenceBus.ts";
import type { Ops } from "../api/_lib/ops-handler.ts";
import type { GithubActivity } from "../api/_lib/github-activity-handler.ts";
import type { SpotifyNow } from "../api/_lib/spotify-handler.ts";
import type { AircraftResponse } from "../api/_lib/aircraft-handler.ts";

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
// §3.2: "Deviations pulse on a slow offset cycle so something is always
// breathing without anything strobing." One full breath every 2.6s, each
// deviation offset by 15% of the cycle per index so the rail never blinks
// in unison.
const PULSE_PERIOD_MS = 2600;
const PULSE_PHASE_STEP = 0.15;
// §3.2: "magnetic lean toward the cursor within ~80px" — a deviation within
// this radius of the pointer nudges toward it; LEAN_MAX_PX is how far.
const LEAN_RADIUS_PX = 80;
const LEAN_MAX_PX = 3;
// How far right a drag has to travel, from wherever it started on the
// 24px-wide rail, before it counts as "open the instrument view" rather
// than an incidental wobble.
const DRAG_OPEN_THRESHOLD_PX = 40;

// live-rail-spec §0's table — reused intervals, not new ones (matches the
// other call sites already on these URLs; useLiveSignal's bus takes the
// smallest interval any subscriber asks for, so this never slows anyone down
// and costs nothing extra when mounted alongside them).
const OPS_POLL_MS = 120_000;
const AIRCRAFT_POLL_MS = 20_000;

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
  // Canvas-local pointer position, for the magnetic lean — null when the
  // pointer isn't over the rail (mouse only; touch never sets this, same as
  // the drag-to-open gesture below).
  const pointerRef = useRef<{ x: number; y: number } | null>(null);

  // Reality ripples (live-rail-spec §3, Layer 2): a capped ring buffer, kept
  // as a plain array in a ref — like hoveredRef/pointerRef above, this
  // doesn't need to trigger a React render, the canvas loop already redraws
  // every frame. `liveRipples` mirrors every push into real state too, but
  // ONLY on push (not per-frame decay) — that's what InstrumentView's "Right
  // now" section (Lane B) reads, so a non-sighted visitor gets the same
  // information without depending on the (aria-hidden) canvas ever repainting.
  const ringRef = useRef<Ripple[]>([]);
  const [liveRipples, setLiveRipples] = useState<Ripple[]>([]);
  // Hovered ripple id, same shape as hoveredRef above but a separate ref: a
  // ripple and a facet deviation can legitimately sit at the same y (the
  // work/chess facets are exactly where two ripple rows are anchored, §3.1).
  const hoveredRippleRef = useRef<string | null>(null);
  // Set once by the canvas's own setup closure (below) so effects outside it
  // can force one extra repaint — needed only under prefers-reduced-motion,
  // where useCanvasLoop draws once at mount/resize and never again on its
  // own, so a ripple pushed mid-session would otherwise never be painted.
  const drawRef = useRef<(() => void) | null>(null);
  const reducedRef = useRef(false);
  const [instrumentOpen, setInstrumentOpen] = useState(false);

  // Pushes one ripple into the ring buffer (ref + mirrored state) and, under
  // reduced motion only, forces the one-off repaint-then-vanish described in
  // §5: draw it now, then draw once more after its dwell has elapsed so
  // pruneRipples (inside the draw loop) has something to actually remove.
  const pushRipple = useCallback((input: Omit<Ripple, "id" | "bornAtMs">) => {
    const next = withRipple(ringRef.current, {
      ...input,
      id: `${input.label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      bornAtMs: Date.now(),
    });
    ringRef.current = next;
    setLiveRipples(next);
    if (reducedRef.current) {
      drawRef.current?.();
      window.setTimeout(() => drawRef.current?.(), RIPPLE_DECAY_MS + 50);
    }
  }, []);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isHome = pathname === "/";
  const { goToSection } = useSectionNav();

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setHeight(entry.contentRect.height));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Section wayfinding, home only ("Unchanged elsewhere" — every other route
  // keeps the plain facet trace above, this is additive). HomePage isn't
  // code-split (src/routes/index.tsx imports it directly), so every section
  // id is already real DOM by the time this rail hydrates — no poll needed,
  // unlike scrollToSectionWhenReady's bounded retry for a lazy target.
  const [activeSection, setActiveSection] = useState<SectionId | null>(null);
  useEffect(() => {
    if (!isHome) {
      setActiveSection(null);
      return;
    }
    const targets = SECTION_ID_LIST.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => el !== null);
    if (targets.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        // "You are here": nearest the top among sections currently crossing
        // the reading line — the usual scrollspy convention.
        const crossing = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (crossing.length > 0) setActiveSection(crossing[0].target.id as SectionId);
      },
      { rootMargin: "-15% 0px -70% 0px", threshold: 0 },
    );
    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [isHome]);

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
    // Without this, a mouse drag from the rail also starts a native text
    // selection (or an image drag, over a captured screenshot) alongside the
    // open gesture — the same click that opens the instrument view was
    // highlighting the page behind it.
    e.preventDefault();
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
  // Section ticks: evenly spaced by index across the same padded band the
  // facet deviations use, not chronology-derived (sections have no authored
  // date to place them by) — same DEVIATION_PAD top/bottom margin so they
  // never crowd the rail's rounded ends.
  const sectionYById = new Map<SectionId, number>(
    SECTION_ID_LIST.map((id, i) => [
      id,
      DEVIATION_PAD + (i / Math.max(1, SECTION_ID_LIST.length - 1)) * Math.max(0, height - DEVIATION_PAD * 2),
    ]),
  );

  // §3.1: CI/push ripples anchor to "the work it's about", chess ripples to
  // the chess facet's own y — falling back to mid-rail only while the facet
  // trace hasn't laid out yet (height === 0, first paint).
  const workY = yById.get("work") ?? height / 2;
  const chessY = yById.get("chess") ?? height / 2;

  // --- §0/§7 Lane A: one more subscriber on each source's EXISTING poll —
  // zero new endpoints, zero new fetches when mounted alongside the other
  // consumer already on the same URL. ---
  const { data: ops } = useLiveSignal<Ops>("/api/ops", OPS_POLL_MS);
  const { data: signals } = useSignals();
  const { data: activity } = useLiveSignal<GithubActivity>("/api/github-activity");
  const { data: spotify } = useLiveSignal<SpotifyNow>("/api/spotify");
  const { data: aircraft } = useLiveSignal<AircraftResponse>("/api/aircraft", AIRCRAFT_POLL_MS);
  const { air } = useWeather();
  const presenceCount = usePresenceCount();
  // Read by the draw loop every frame (Layer 0, §3) — a ref because the
  // canvas setup closure below runs once at mount, same reason accent/accent2
  // are re-read from getComputedStyle rather than closed over as props.
  const airRef = useRef<typeof air>(null);
  useEffect(() => {
    airRef.current = air;
  }, [air]);

  const conclusionColor = (conclusion: string) => (conclusion === "success" ? "--color-signal" : "--color-danger");
  const stateColor = (state: string) => (state === "fail" ? "--color-danger" : state === "pass" ? "--color-signal" : "--color-signal-dim");

  // --- Edge detection: one effect per source, each keeping its own
  // "last seen" ref and pushing a ripple only on a real transition (§3.1's
  // "edge, not level" — a poll that repeats the same value stays silent). ---

  const prevOpsRef = useRef<Record<string, { state: string }> | null>(null);
  useEffect(() => {
    if (!ops) return;
    // ops.runs is typed as always-present (api/_lib/ops-handler.ts's own
    // EMPTY fallback sets it to []), but a disconnected/degraded response
    // still satisfies `Ops` structurally without it in practice — OpsBoard.tsx
    // already guards the same field with `ops?.runs ?? []`; this effect needs
    // the same guard, not just the `!ops` check above.
    const next = Object.fromEntries((ops.runs ?? []).map((r) => [r.workflow, { state: r.conclusion }]));
    for (const workflow of stateFlips(prevOpsRef.current, next)) {
      pushRipple({
        y: DEVIATION_PAD / 2,
        colorToken: conclusionColor(next[workflow].state),
        label: `CI: ${next[workflow].state} · ${workflow} · GitHub Actions`,
      });
    }
    prevOpsRef.current = next;
  }, [ops, pushRipple]);

  const prevFamilyCiRef = useRef<Record<string, { state: string }> | null>(null);
  useEffect(() => {
    if (!signals?.ci) return;
    const next = signals.ci as Record<string, { state: string }>;
    for (const repo of stateFlips(prevFamilyCiRef.current, next)) {
      pushRipple({
        y: DEVIATION_PAD / 2,
        colorToken: stateColor(next[repo].state),
        dimAlpha: 0.7,
        label: `CI: ${repo} ${next[repo].state} · GitHub Actions (family)`,
      });
    }
    prevFamilyCiRef.current = next;
  }, [signals, pushRipple]);

  const prevActivityRef = useRef<GithubActivity["items"] | null>(null);
  useEffect(() => {
    if (!activity?.items) return;
    if (didNewPush(prevActivityRef.current, activity.items)) {
      pushRipple({ y: workY, colorToken: "--color-signal", label: "New commit · GitHub" });
    }
    prevActivityRef.current = activity.items;
  }, [activity, workY, pushRipple]);

  const prevSpotifyRef = useRef<{ track?: string } | null>(null);
  useEffect(() => {
    if (!spotify) return;
    const prev = prevSpotifyRef.current;
    if (prev && spotify.isPlaying && spotify.track && didChange(prev.track, spotify.track)) {
      pushRipple({
        y: height * 0.85,
        colorToken: "--color-alt",
        label: `Spotify · now playing · ${spotify.track}${spotify.artist ? ` — ${spotify.artist}` : ""}`,
      });
    }
    prevSpotifyRef.current = { track: spotify.track };
  }, [spotify, height, pushRipple]);

  const prevLichessRef = useRef<{ online: boolean; playing: boolean } | null>(null);
  useEffect(() => {
    if (!signals?.lichess) return;
    const prev = prevLichessRef.current;
    const next = signals.lichess;
    if (prev && (didChange(prev.online, next.online) || didChange(prev.playing, next.playing))) {
      pushRipple({
        y: chessY,
        colorToken: next.playing ? "--color-signal" : "--color-signal-dim",
        label: next.playing ? "Lichess · game in progress" : next.online ? "Lichess · online" : "Lichess · offline",
      });
    }
    prevLichessRef.current = next;
  }, [signals, chessY, pushRipple]);

  const prevAircraftRef = useRef<AircraftResponse["aircraft"] | null>(null);
  useEffect(() => {
    if (!aircraft?.aircraft) return;
    if (didAircraftArrive(prevAircraftRef.current, aircraft.aircraft)) {
      const newest = aircraft.aircraft[aircraft.aircraft.length - 1];
      // §3.1: "x-position offset slightly by azDeg (left of centre = west of
      // Pune)" — az=90 (east) -> +lean, az=270 (west) -> -lean.
      const lean = Math.sin(((newest?.azDeg ?? 0) * Math.PI) / 180) * LEAN_MAX_PX;
      pushRipple({
        y: DEVIATION_PAD,
        yTo: Math.max(DEVIATION_PAD, height - DEVIATION_PAD),
        x: lean,
        colorToken: "--color-probe",
        label: `Aircraft · adsb.lol (ODbL)${newest ? ` · ${newest.cs}` : ""}`,
      });
    }
    prevAircraftRef.current = aircraft.aircraft;
  }, [aircraft, height, pushRipple]);

  // Lane C (§4/§7): the presence bus is a plain module-scope store, not a
  // hook into the PlayProvider tree AnomalyRail doesn't sit inside — see
  // play/presenceBus.ts. `null` (shared layer not loaded/synced yet) never
  // counts as a reading to compare against.
  const prevPresenceRef = useRef<number | null>(null);
  useEffect(() => {
    if (didIncrease(prevPresenceRef.current, presenceCount)) {
      pushRipple({ y: Math.max(DEVIATION_PAD, height - DEVIATION_PAD / 2), colorToken: "--color-signal-dim", label: "A visitor arrived" });
    }
    prevPresenceRef.current = presenceCount;
  }, [presenceCount, height, pushRipple]);

  const canvasRef = useCanvasLoop((_canvas, ctx, getSize) => {
    // useCanvasLoop already fast-forwards+freezes this step/draw pair under
    // prefers-reduced-motion — that's the ambient loop covered. The sweep is
    // a separate one-shot hint layered on the same loop, so it needs its own
    // explicit gate: skipped outright when reduced motion is on, rather than
    // relying on the fast-forward to land it mid-animation.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    reducedRef.current = reduced;
    let sweepT = reduced || hasSweptBefore() ? 1 : 0;
    if (sweepT === 0) markSwept();

    // Elapsed time drives the pulse's sine — only tracked when it's actually
    // going to be read below (reduced motion has no pulse), so a reduced-
    // motion visit doesn't accumulate a number nothing uses.
    let elapsedMs = 0;
    const step = (dtMs: number) => {
      if (sweepT < 1) sweepT = Math.min(1, sweepT + dtMs / SWEEP_MS);
      if (!reduced) elapsedMs += dtMs;
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
    // Ripple tokens (§3.2's palette discipline) — same read-once-per-resize
    // cache as accent/accent2 above, keyed by the same `resized` flag.
    const rippleTokens: Record<string, string> = {};
    const RIPPLE_TOKEN_NAMES = ["--color-signal", "--color-signal-dim", "--color-danger", "--color-alt", "--color-probe"];

    // There used to be a "skip this frame, nothing changed" early return
    // here (I3's perf fix). It no longer has a case to apply to: under
    // normal motion the deviations pulse every frame (§3.2's "always
    // breathing"), so every frame legitimately differs — the loop earns its
    // frames now instead of running forever for zero visual change. Under
    // reduced motion this ran only a handful of times total (mount, plus
    // whatever the ResizeObserver below fires), and skipping there actively
    // broke the C1 fix: the observer's callback resets canvas.width — wiping
    // the bitmap — every time it fires, including the guaranteed-async
    // initial one even when nothing actually resized, so a "same as last
    // time, skip it" check could (and did) leave that wipe unpainted.
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
        for (const name of RIPPLE_TOKEN_NAMES) rippleTokens[name] = tokens.getPropertyValue(name).trim();
      }

      const hovered = hoveredRef.current;

      const cx = width / 2;
      ctx.clearRect(0, 0, width, h);

      // Baseline: a faint repeating tick scale — the thing deviations are
      // measured against. One path for every tick (not one stroke() call
      // per tick) — same pixels, a fraction of the draw calls.
      //
      // Layer 0 (§3, live-rail-spec v2): the baseline's own alpha rides a
      // very slow, always-on sine (elapsedMs is already tracked for the
      // deviation pulse below — this is one more Math.sin() call on the same
      // clock, not a second timer) dimmed by Pune's current air quality. This
      // is the "calmer at rest, premium" fix — the baseline itself now
      // breathes almost imperceptibly instead of sitting at a flat, printed-
      // looking 0.3.
      const haze = hazeFromAqi(airRef.current?.usAqi);
      ctx.strokeStyle = accent2;
      ctx.lineWidth = 1;
      ctx.globalAlpha = ambientAlpha(elapsedMs, haze, reduced);
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

      const pointer = reduced ? null : pointerRef.current;

      // Deviations: the measured signal, one per facet, laid out by chronology.
      cachedDeviations.forEach((d, i) => {
        const isHovered = d.id === hovered;
        let radius = isHovered ? 4.5 : 3;
        let alpha = 1;
        // Pulse: each deviation breathes on its own offset so the rail never
        // blinks in unison — a phase-shifted sine over a slow, fixed period.
        if (!reduced) {
          const phase = (elapsedMs / PULSE_PERIOD_MS + i * PULSE_PHASE_STEP) % 1;
          const breath = 0.5 + 0.5 * Math.sin(phase * Math.PI * 2); // 0..1
          radius += breath * 1.2;
          alpha = 0.75 + breath * 0.25;
        }
        // Magnetic lean: within LEAN_RADIUS_PX of the pointer, nudge toward
        // it — a full pull at 0px away, none at the radius' edge.
        let dotX = cx;
        if (pointer) {
          const dist = Math.hypot(pointer.x - cx, pointer.y - d.y);
          if (dist < LEAN_RADIUS_PX) {
            const pull = (1 - dist / LEAN_RADIUS_PX) * LEAN_MAX_PX;
            dotX = cx + Math.sign(pointer.x - cx || 1) * pull;
          }
        }

        ctx.beginPath();
        ctx.arc(dotX, d.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = accent;
        ctx.globalAlpha = alpha;
        if (isHovered) {
          ctx.shadowColor = accent;
          ctx.shadowBlur = 10;
        }
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;

        if (isHovered) {
          const facet = facets.find((f) => f.id === d.id);
          if (facet) {
            ctx.font = '11px "JetBrains Mono", ui-monospace, monospace';
            ctx.fillStyle = accent;
            ctx.textBaseline = "middle";
            ctx.fillText(facet.label, dotX + 12, d.y);
          }
        }
      });

      // Layer 2 (§3, front-most): reality ripples — drawn only while
      // decaying; pruneRipples below is what keeps the rail silent at rest
      // (nothing here at all until something real happened in the last
      // RIPPLE_DECAY_MS). Reuses the exact ctx.arc + globalAlpha + shadowBlur
      // primitives the hover-glow above already uses — no new canvas API.
      const nowMs = Date.now();
      pruneRipples(ringRef.current, nowMs, RIPPLE_DECAY_MS);
      const hoveredRipple = hoveredRippleRef.current;
      for (const r of ringRef.current) {
        // §5: under reduced motion the loop above never runs again after
        // mount/resize, so there is no per-frame "age" to animate — render
        // every live ripple at one fixed mid-decay frame instead (still a
        // real, true "this happened" mark, just not tweening).
        const age = reduced ? RIPPLE_DECAY_MS / 2 : nowMs - r.bornAtMs;
        const alpha = decayAlpha(age, RIPPLE_DECAY_MS) * (r.dimAlpha ?? 1);
        if (alpha <= 0) continue;
        const ry = rippleY(r, age, RIPPLE_DECAY_MS);
        const rx = cx + (r.x ?? 0);
        const radius = 3 + (age / RIPPLE_DECAY_MS) * 8;
        const color = rippleTokens[r.colorToken] ?? accent;
        ctx.beginPath();
        ctx.arc(rx, ry, radius, 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = alpha;
        if (r.id === hoveredRipple) {
          ctx.shadowColor = color;
          ctx.shadowBlur = 8;
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;

        if (r.id === hoveredRipple) {
          ctx.font = '11px "JetBrains Mono", ui-monospace, monospace';
          ctx.fillStyle = color;
          ctx.textBaseline = "middle";
          ctx.fillText(r.label, rx + radius + 6, ry);
        }
      }
    };

    drawRef.current = draw;
    return { step, draw };
  });

  const updateHover = (e: ReactPointerEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const y = e.clientY - rect.top;
    pointerRef.current = { x: e.clientX - rect.left, y };
    hoveredRef.current = hitTest(deviations, y, HOVER_TOLERANCE);
    // §3.3: a ripple gets the same hover label a facet dot does — nearest
    // live ripple within tolerance, by its CURRENT (possibly travelling) y.
    const nowMs = Date.now();
    let best: string | null = null;
    let bestDist = HOVER_TOLERANCE;
    for (const r of ringRef.current) {
      const age = nowMs - r.bornAtMs;
      const ry = rippleY(r, age, RIPPLE_DECAY_MS);
      const dist = Math.abs(ry - y);
      if (dist <= bestDist) {
        best = r.id;
        bestDist = dist;
      }
    }
    hoveredRippleRef.current = best;
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
          pointerRef.current = null;
          hoveredRippleRef.current = null;
        }}
      >
        <nav aria-label="Timeline" className="anomaly-rail-nav" data-spine="anomaly-rail">
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
        {/* Section wayfinding — home only, additive alongside the Timeline
            nav above (which keeps every facet, on every route, unchanged).
            One real tick per SECTION_ID_LIST entry, with the
            currently-visible section (tracked by the IntersectionObserver
            above) marked aria-current so both sighted "you are here"
            styling and assistive tech agree on which one that is.
            <button>+goToSection, not <Link to="/" hash={id}> — every one of
            these targets the SAME route ("/"), and TanStack's <Link> marks
            ANY link to the current pathname "active" (its own aria-current
            + data-status, independent of hash), which stamped all thirteen
            aria-current="page" regardless of scroll position and — being
            stacked over the Timeline nav in the same 24px column — ate its
            pointer events too. The nav itself is pointer-events:none so the
            gaps between ticks fall through to the Timeline nav underneath;
            each button opts back in. */}
        {isHome && (
          <nav aria-label="Sections" className="anomaly-rail-nav" data-spine="anomaly-rail" style={{ pointerEvents: "none" }}>
            {SECTION_ID_LIST.map((id) => {
              const isActive = activeSection === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => goToSection(id)}
                  className="anomaly-rail-link anomaly-rail-section-link"
                  style={{
                    top: `${sectionYById.get(id) ?? 0}px`,
                    // .anomaly-rail-link's own width:100% is the Timeline
                    // nav's facet band, centred under the canvas's dots
                    // (cx = width/2). SECTION_ID_LIST's even index spacing
                    // and the facets' chronological placement land on the
                    // same y often enough that a full-width band here ate
                    // the facet underneath it (Playwright's "a rail link
                    // navigates to its route" caught this: the Labs facet at
                    // the same y as the Writing section tick). Right-aligned
                    // and narrow, this no longer covers a facet band's own
                    // (centred) click point even when the two y's tie.
                    left: "auto",
                    right: 0,
                    width: 10,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "flex-end",
                    paddingRight: 3,
                    pointerEvents: "auto",
                  }}
                  aria-label={SECTION_JUMPS[id].label}
                  aria-current={isActive ? "true" : undefined}
                  data-active={isActive ? "true" : undefined}
                >
                  {/* Inline styling only, not a new index.css rule (owned by
                      the design-system lane) — the visible "you are here"
                      dot the canvas draws for facet deviations, mirrored here
                      as a real DOM mark so it survives without a second
                      canvas draw pass keyed to this nav's own state. */}
                  <span
                    aria-hidden
                    style={{
                      width: isActive ? 6 : 3,
                      height: isActive ? 6 : 3,
                      borderRadius: "50%",
                      background: isActive ? "var(--color-accent)" : "var(--color-accent2)",
                      opacity: isActive ? 1 : 0.45,
                      boxShadow: isActive ? "0 0 6px var(--color-accent)" : "none",
                      transition: "width 0.2s, height 0.2s, opacity 0.2s",
                    }}
                  />
                </button>
              );
            })}
          </nav>
        )}
      </div>
      {/* Age-filtering (which of these is still "live") happens inside
          InstrumentView itself, on a state clock ticked from an effect —
          calling Date.now() here, during render, would be an impure render
          (react-hooks/purity) now that this app runs the React Compiler. */}
      <InstrumentView open={instrumentOpen} onClose={closeInstrument} recentSignals={liveRipples} />
    </>
  );
}
