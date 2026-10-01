import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { GlobalEclipse } from "../layers/eclipse.ts";
import { Eclipse, Pause, Play, X } from "lucide-react";
import { useReducedMotion } from "../../../SceneActivity.tsx";
import { simTime, useGlobe } from "../globeStore.ts";
import { MAX_OFFSET_MIN, MIN_OFFSET_MIN, labelOffset, offsetToSlider, sliderToOffset, snapOffset, snapStepMinutes } from "../timeMachine/rangeModel.ts";
import { useCompare } from "../timeMachine/compareStore.ts";
import { VIIRS_TRUE_COLOR } from "../layers/gibs.ts";
import { ownsKey } from "./shortcutTarget.ts";
import CompareDivider from "./CompareDivider.tsx";

/** LANE L5 (navigation and UI) built the original single floating card;
 *  LANE U1 (composition) split it into the two forms below - a compact
 *  single-row pill for the shared top bar (sm+) and a bottom sheet for
 *  phones, gated on `store.sheet` like every other phone sheet, since the
 *  centred floating card used to sit directly on top of the globe and the
 *  reach columns at every measured breakpoint.
 *
 *  WAVE 6 LANE X3 (time machine UI) swapped the linear +-24h slider for
 *  rangeModel's non-linear +-30d/+2d range (fine control near now, coarse
 *  day-scale steps far from it), added the day-per-second speed and the
 *  Compare toggle, and kept every L5/U1 shape (compact pill, phone sheet,
 *  not-live badge) unchanged. */

const EventStrip = lazy(() => import("../timeMachine/eventStrip.tsx"));

const rangeEnd = (value: number) => Math.max(MIN_OFFSET_MIN, Math.min(MAX_OFFSET_MIN, value));
const MIN_OFFSET = MIN_OFFSET_MIN;
const MAX_OFFSET = MAX_OFFSET_MIN;
// `mul` is simulated SECONDS per wall second (usgsHistory.pulseState's own
// units) — not a relabelling, the existing `speed * dtSec / 60` minutes-per-
// tick formula below already equals `mul` seconds of sim time per real
// second, so HistoryLayer's independently measured playback speed lands on
// the same number without this file exporting anything.
const SPEEDS = [
  { mul: 60, label: "x60" },
  { mul: 600, label: "x600" },
  { mul: 3600, label: "x3600" },
  { mul: 86400, label: "1d/s" },
] as const;
// Day-boundary marks under the slider track (rangeModel spec item: "day
// ticks") — UTC midnights across the whole +-30d/+2d horizon, positioned by
// the same non-linear map the thumb uses, so they visibly bunch up exactly
// where the range itself gets coarse (far from now) rather than claiming a
// precision the slider doesn't have there.
const DAY_TICKS = Array.from({ length: MAX_OFFSET_MIN / 1440 - MIN_OFFSET_MIN / 1440 + 1 }, (_, i) => {
  const minutes = MIN_OFFSET_MIN + i * 1440;
  return { minutes, pct: (offsetToSlider(minutes) + 1) * 50 };
});

function DayTicks() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2">
      {DAY_TICKS.map((t) => (
        <span key={t.minutes} className="absolute top-0 h-1 w-px bg-zinc-500/50" style={{ left: `${t.pct}%` }} />
      ))}
    </div>
  );
}

/** Compact form for the top-row pill: hour:minute only, no room for a date
 *  there (the sheet's `fmtFull` below keeps the day/month). */
function fmtCompact(d: Date, timeZone: string): string {
  return d.toLocaleString("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hour12: false });
}
function fmtFull(d: Date, timeZone: string): string {
  return d.toLocaleString("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short", hour12: false });
}

const SpaceWeather = lazy(() => import("./SpaceWeather.tsx"));

export default function TimeScrubber(_props: { tier: 1 | 2 | 3 }) {
  const offset = useGlobe((s) => s.timeOffsetMin);
  const setTimeOffset = useGlobe((s) => s.setTimeOffset);
  const sheet = useGlobe((s) => s.sheet);
  const setSheet = useGlobe((s) => s.setSheet);
  const reducedMotion = useReducedMotion();
  const [playing, setPlaying] = useState(false);
  const [speedIdx, setSpeedIdx] = useState(0);
  const [eclipseLoading, setEclipseLoading] = useState(false);
  const [nextEclipse, setNextEclipse] = useState<GlobalEclipse | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<number | null>(null);
  const compareState = useCompare((s) => s.state);
  const openCompare = useCompare((s) => s.open);
  const closeCompare = useCompare((s) => s.close);

  // Reduced motion disables auto-play outright: derived, not synced via an
  // effect, so a mid-session OS toggle takes effect on the very next render
  // with no extra state or cascading setState.
  const effectivePlaying = playing && !reducedMotion;
  const beyondRange = offset < MIN_OFFSET || offset > MAX_OFFSET;
  const togglePlayback = () => {
    if (beyondRange) setTimeOffset(rangeEnd(offset));
    setPlaying((p) => !p);
  };

  useEffect(() => {
    if (!effectivePlaying) return;
    lastRef.current = null;
    const tick = (t: number) => {
      const last = lastRef.current;
      lastRef.current = t;
      if (last !== null) {
        const dtSec = (t - last) / 1000;
        const deltaMin = (SPEEDS[speedIdx].mul * dtSec) / 60;
        const next = useGlobe.getState().timeOffsetMin + deltaMin;
        if (next >= MAX_OFFSET || next <= MIN_OFFSET) {
          setTimeOffset(Math.max(MIN_OFFSET, Math.min(MAX_OFFSET, next)));
          setPlaying(false);
          return;
        }
        setTimeOffset(next);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [effectivePlaying, speedIdx, setTimeOffset]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || ownsKey(e.target as HTMLElement | null, e.key)) return;
      // Step size follows rangeModel's own coarseness (15/60/1440 min), not
      // a fixed 60 min, now that the range spans 30 real days: a fixed step
      // would take 720 presses to cross the far end.
      const current = useGlobe.getState().timeOffsetMin;
      const outside = current < MIN_OFFSET || current > MAX_OFFSET;
      if (e.key === "[") setTimeOffset(rangeEnd(outside ? current : current - snapStepMinutes(current)));
      else if (e.key === "]") setTimeOffset(rangeEnd(outside ? current : current + snapStepMinutes(current)));
      else if (e.key === " " || e.code === "Space") {
        if (!reducedMotion) {
          e.preventDefault();
          if (outside) setTimeOffset(rangeEnd(current));
          setPlaying((p) => !p);
        }
      } else return;
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setTimeOffset, reducedMotion]);

  const onSliderKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const step = snapStepMinutes(offset) * (e.shiftKey ? 4 : 1);
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      setTimeOffset(rangeEnd(beyondRange ? offset : offset - step));
    } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      setTimeOffset(rangeEnd(beyondRange ? offset : offset + step));
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      setTimeOffset(e.key === "Home" ? MIN_OFFSET : MAX_OFFSET);
    }
  };

  // The <input type="range"> now moves in rangeModel's SLIDER position
  // space (-1..1), not raw minutes: an equal drag distance always covers an
  // equal on-screen distance, which is what makes the fine-near/coarse-far
  // non-linearity actually usable with a mouse. `snapOffset` on commit keeps
  // the stored value on the same 15/60/1440-min grid the keyboard path uses.
  const onSliderChange = (value: number) => setTimeOffset(snapOffset(sliderToOffset(value)));

  const now = simTime(offset);
  const notLive = offset !== 0;
  // Derived from `now` rather than a second `Date.now()` read: same real
  // instant `now` was built from (algebraically `now - offset`), and render
  // must stay pure — no direct clock read here (react-hooks/purity).
  const label = useMemo(() => labelOffset(offset, now.getTime() - offset * 60_000), [offset, now]);

  const compareButton = (
    <button
      type="button"
      onClick={() => {
        if (compareState) {
          closeCompare();
        } else {
          // Left is wherever the visitor already scrubbed to (or a week
          // back from a live view, so Compare always has two genuinely
          // different dates to show); right is literal today regardless of
          // the current scrub — compare.ts's own CompareView shape.
          openCompare(notLive ? now.getTime() : Date.now() - 7 * 86_400_000, Date.now(), VIIRS_TRUE_COLOR);
          setPlaying(false);
        }
      }}
      aria-pressed={compareState !== null}
      title="Swipe-compare a past date against today"
      className={`rounded-full border border-line px-2 py-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
        compareState ? "bg-accent/20 text-accent" : "hover:text-accent"
      }`}
    >
      Compare
    </button>
  );

  // WAVE 7 LANE 8 (eclipse paths): astronomy-engine loads only when this is
  // clicked (its own lazy chunk, shared with EclipseLayer.tsx if that layer
  // is on) -- never a static import here, or its ~47 KB gzip would land in
  // the eager Globe chunk. The jump sets a real offset past the normal +-30
  // day/2 day range. The visible date and beyond-range warning explain
  // the pinned thumb; moving or playing returns to the nearest range end.
  const jumpToNextEclipse = async () => {
    setEclipseLoading(true);
    try {
      const { nextGlobalEclipses } = await import("../layers/eclipse.ts");
      const [eclipse] = nextGlobalEclipses(new Date(), 1);
      if (!eclipse) return;
      setNextEclipse(eclipse);
      setTimeOffset((eclipse.peak.getTime() - Date.now()) / 60_000);
      setPlaying(false);
    } finally {
      setEclipseLoading(false);
    }
  };
  const eclipseButtonLabel = eclipseLoading ? "Finding eclipse..." : "Next eclipse";
  const eclipseButtonTitle = nextEclipse
    ? `Jump to the greatest point of the next ${nextEclipse.kind} solar eclipse, ${nextEclipse.peak.toLocaleDateString("en-GB", { timeZone: "UTC", day: "2-digit", month: "short", year: "numeric" })}`
    : "Jump to the next global solar eclipse's greatest point (computed with astronomy-engine)";
  // Icon-only in the compact desktop pill: Globe.tsx reserves a centre band
  // for ExploreBar (~377px, sm+) and caps this row's own container at
  // max-w-[38%] to stay clear of it -- a full "Next eclipse" text label was
  // wide enough to push the row past that cap and under ExploreBar's box
  // (measured: the row ran to x=650 against ExploreBar's own x=531.5 start,
  // a real overlap, not a visual near-miss). The phone sheet has no such
  // reserved band (ExploreBar moves to its own line there), so it keeps the
  // full label.
  const eclipseButtonCompact = (
    <button
      type="button"
      onClick={jumpToNextEclipse}
      disabled={eclipseLoading}
      aria-label={eclipseButtonLabel}
      title={eclipseButtonTitle}
      className="ctrl-icon flex h-6 w-6 items-center justify-center rounded-full border border-line hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50"
    >
      <Eclipse size={16} />
    </button>
  );
  const eclipseButtonFull = (
    <button
      type="button"
      onClick={jumpToNextEclipse}
      disabled={eclipseLoading}
      title={eclipseButtonTitle}
      className="flex h-11 items-center gap-1.5 rounded-full border border-line px-3 hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50"
    >
      <Eclipse size={16} />
      {eclipseButtonLabel}
    </button>
  );

  const nowButton = (
    <button
      type="button"
      onClick={() => {
        setTimeOffset(0);
        setPlaying(false);
      }}
      className="rounded-full border border-line px-2 py-1 hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
    >
      Now
    </button>
  );
  const playButton = !reducedMotion && (
    <button
      type="button"
      onClick={togglePlayback}
      aria-pressed={playing}
      aria-label={playing ? "Pause simulated time" : "Play simulated time"}
      className="ctrl-icon flex h-6 w-6 items-center justify-center rounded-full border border-line hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
    >
      {playing ? <Pause size={16} /> : <Play size={16} />}
    </button>
  );
  const notLiveBadge = notLive && (
    <span
      data-globe-not-live
      className="shrink-0 rounded-full px-1.5 py-0.5 text-xs font-semibold"
      style={{ color: "var(--color-warn)", border: "1px solid var(--color-warn)" }}
      title="Live feeds pause while you scrub"
    >
      not live
    </span>
  );

  const eventStrip = <Suspense fallback={null}><EventStrip onSelect={() => setPlaying(false)} /></Suspense>;

  return (
    <>
      {/* Wrap inside the topbar cap when coarse targets or a full date
          need more room; the slider shrinks without entering the centre band. */}
      <div
        data-globe-time-scrubber
        className="pointer-events-auto hidden min-w-0 max-w-full max-h-[var(--globe-time-max-h)] overflow-y-auto sm:max-w-[calc(50vw-13.25rem)] flex-wrap items-center gap-2 rounded-2xl glass-panel px-3 py-1.5 font-mono text-xs text-zinc-300 sm:flex"
      >
        {eventStrip}
        <span className="min-w-0">
          {fmtCompact(now, "Asia/Kolkata")} IST · {fmtCompact(now, "UTC")} UTC
        </span>
        <span data-time-beyond-range={beyondRange || undefined} className="text-zinc-400">
          {beyondRange ? `${now.toISOString().slice(0, 16).replace("T", " ")} UTC · beyond the slider range` : label}
        </span>
        <div className="relative flex min-w-11 flex-1 basis-36 items-center">
          <DayTicks />
          <input
            type="range"
            min={-1}
            max={1}
            step={0.0005}
            value={offsetToSlider(offset)}
            onChange={(e) => onSliderChange(Number(e.target.value))}
            onKeyDown={onSliderKeyDown}
            aria-valuetext={beyondRange ? "Beyond the slider range; move to return to the range" : label}
            aria-label="Simulated time offset, non-linear, 30 days back to 2 days ahead"
            className="relative h-11 min-w-11 w-full accent-accent"
          />
        </div>
        {nowButton}
        {playButton}
        <button
          type="button"
          onClick={() => setSpeedIdx((i) => (i + 1) % SPEEDS.length)}
          title="Cycle playback speed"
          className="rounded-full border border-line px-1.5 py-0.5 text-zinc-400 hover:text-zinc-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          {SPEEDS[speedIdx].label}
        </button>
        {compareButton}
        {eclipseButtonCompact}
        {notLiveBadge}
      </div>

      {/* Phone (< 640): a bottom sheet, one of store.sheet's four, opened by
          the top row's clock icon button (Globe.tsx). Fuller layout (real
          date, three explicit speed buttons, 44px touch targets) since a
          sheet has the full sheet width instead of a top-row slice. */}
      {sheet === "time" && createPortal(
        <div
          data-globe-time-sheet
          role="dialog"
          aria-label="Simulated time"
          style={{ background: "var(--color-ink)" }}
          className="pointer-events-auto fixed inset-x-0 bottom-0 z-40 max-h-[70vh] overflow-y-auto rounded-t-2xl glass-panel p-4 font-mono text-xs text-zinc-300 sm:hidden"
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Time</h2>
            <button
              type="button"
              onClick={() => setSheet(null)}
              aria-label="Close the time sheet"
              className="ctrl-icon flex h-11 w-11 items-center justify-center rounded-full border border-line text-zinc-300 hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              <X size={16} />
            </button>
          </div>

          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="truncate text-sm">
              {fmtFull(now, "Asia/Kolkata")} IST · {fmtFull(now, "UTC")} UTC
            </span>
            {notLiveBadge}
          </div>
          <p data-time-beyond-range={beyondRange || undefined} className="mb-2 text-zinc-400">
            {beyondRange ? `${now.toISOString().slice(0, 16).replace("T", " ")} UTC · beyond the slider range` : label}
          </p>

          <Suspense fallback={null}><SpaceWeather /></Suspense>
          {eventStrip}
          <div className="relative flex items-center">
            <DayTicks />
            <input
              type="range"
              min={-1}
              max={1}
              step={0.0005}
              value={offsetToSlider(offset)}
              onChange={(e) => onSliderChange(Number(e.target.value))}
              onKeyDown={onSliderKeyDown}
              aria-valuetext={beyondRange ? "Beyond the slider range; move to return to the range" : label}
              aria-label="Simulated time offset, non-linear, 30 days back to 2 days ahead (sheet)"
              className="relative h-11 w-full accent-accent"
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                setTimeOffset(0);
                setPlaying(false);
              }}
              className="flex h-11 items-center rounded-full border border-line px-4 hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              Now
            </button>
            <div className="flex flex-wrap items-center gap-2">
              {!reducedMotion && (
                <button
                  type="button"
                  onClick={togglePlayback}
                  aria-pressed={playing}
                  aria-label={playing ? "Pause simulated time" : "Play simulated time"}
                  className="ctrl-icon flex h-11 w-11 items-center justify-center rounded-full border border-line hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                >
                  {playing ? <Pause size={16} /> : <Play size={16} />}
                </button>
              )}
              {SPEEDS.map((s, i) => (
                <button
                  key={s.mul}
                  type="button"
                  onClick={() => setSpeedIdx(i)}
                  aria-pressed={speedIdx === i}
                  className={`flex h-11 items-center rounded-full border border-line px-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
                    speedIdx === i ? "bg-accent/20 text-accent" : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
            {compareButton}
            {eclipseButtonFull}
          </div>
          {notLive && <p className="mt-2 text-zinc-500">Live feeds pause while you scrub.</p>}
        </div>, document.querySelector("[data-globe-stage]") ?? document.body
      )}

      <CompareDivider />
    </>
  );
}
