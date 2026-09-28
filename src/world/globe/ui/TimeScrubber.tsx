import { useEffect, useRef, useState } from "react";
import { Pause, Play, X } from "lucide-react";
import { useReducedMotion } from "../../../SceneActivity.tsx";
import { simTime, useGlobe } from "../globeStore.ts";

/** LANE L5 (navigation and UI) built the original single floating card;
 *  LANE U1 (composition) split it into the two forms below - a compact
 *  single-row pill for the shared top bar (sm+) and a bottom sheet for
 *  phones, gated on `store.sheet` like every other phone sheet, since the
 *  centred floating card used to sit directly on top of the globe and the
 *  reach columns at every measured breakpoint. */

const MIN_OFFSET = -24 * 60;
const MAX_OFFSET = 24 * 60;
const SPEEDS = [60, 600, 3600] as const;

function isTypingTarget(el: EventTarget | null): boolean {
  return el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
}

/** Compact form for the top-row pill: hour:minute only, no room for a date
 *  there (the sheet's `fmtFull` below keeps the day/month). */
function fmtCompact(d: Date, timeZone: string): string {
  return d.toLocaleString("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hour12: false });
}
function fmtFull(d: Date, timeZone: string): string {
  return d.toLocaleString("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short", hour12: false });
}

export default function TimeScrubber(_props: { tier: 1 | 2 | 3 }) {
  const offset = useGlobe((s) => s.timeOffsetMin);
  const setTimeOffset = useGlobe((s) => s.setTimeOffset);
  const sheet = useGlobe((s) => s.sheet);
  const setSheet = useGlobe((s) => s.setSheet);
  const reducedMotion = useReducedMotion();
  const [playing, setPlaying] = useState(false);
  const [speedIdx, setSpeedIdx] = useState(0);
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<number | null>(null);

  // Reduced motion disables auto-play outright: derived, not synced via an
  // effect, so a mid-session OS toggle takes effect on the very next render
  // with no extra state or cascading setState.
  const effectivePlaying = playing && !reducedMotion;

  useEffect(() => {
    if (!effectivePlaying) return;
    lastRef.current = null;
    const tick = (t: number) => {
      const last = lastRef.current;
      lastRef.current = t;
      if (last !== null) {
        const dtSec = (t - last) / 1000;
        const speed = SPEEDS[speedIdx];
        const deltaMin = (speed * dtSec) / 60;
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
      if (isTypingTarget(e.target)) return;
      if (e.key === "[") setTimeOffset(Math.max(MIN_OFFSET, useGlobe.getState().timeOffsetMin - 60));
      else if (e.key === "]") setTimeOffset(Math.min(MAX_OFFSET, useGlobe.getState().timeOffsetMin + 60));
      else if (e.key === " " || e.code === "Space") {
        if (!reducedMotion) {
          e.preventDefault();
          setPlaying((p) => !p);
        }
      } else return;
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setTimeOffset, reducedMotion]);

  const onSliderKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const step = e.shiftKey ? 60 : 15;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      setTimeOffset(Math.max(MIN_OFFSET, offset - step));
    } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      setTimeOffset(Math.min(MAX_OFFSET, offset + step));
    }
  };

  const now = simTime(offset);
  const notLive = offset !== 0;

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
      onClick={() => setPlaying((p) => !p)}
      aria-pressed={playing}
      aria-label={playing ? "Pause simulated time" : "Play simulated time"}
      className="ctrl-icon flex h-6 w-6 items-center justify-center rounded-full border border-line hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
    >
      {playing ? <Pause size={11} /> : <Play size={11} />}
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

  return (
    <>
      {/* Desktop/tablet (sm+): one compact row in the shared top bar, the
          same ~30px pill height as the HUD. A single speed button cycling
          x60/x600/x3600 (rather than three) is what makes "slider ~144px,
          Now, play, speed, not-live" actually fit in one row at 1024px. */}
      <div
        data-globe-time-scrubber
        className="pointer-events-auto hidden items-center gap-2 rounded-full border border-line bg-ink/70 px-3 py-1.5 font-mono text-xs text-zinc-300 backdrop-blur sm:flex"
      >
        <span className="whitespace-nowrap">
          {fmtCompact(now, "Asia/Kolkata")} IST · {fmtCompact(now, "UTC")} UTC
        </span>
        <input
          type="range"
          min={MIN_OFFSET}
          max={MAX_OFFSET}
          step={15}
          value={offset}
          onChange={(e) => setTimeOffset(Number(e.target.value))}
          onKeyDown={onSliderKeyDown}
          aria-label="Simulated time offset, minutes from now"
          className="h-1 w-36 accent-accent"
        />
        {nowButton}
        {playButton}
        <button
          type="button"
          onClick={() => setSpeedIdx((i) => (i + 1) % SPEEDS.length)}
          title="Cycle playback speed"
          className="rounded-full border border-line px-1.5 py-0.5 text-zinc-400 hover:text-zinc-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          x{SPEEDS[speedIdx]}
        </button>
        {notLiveBadge}
      </div>

      {/* Phone (< 640): a bottom sheet, one of store.sheet's four, opened by
          the top row's clock icon button (Globe.tsx). Fuller layout (real
          date, three explicit speed buttons, 44px touch targets) since a
          sheet has the full sheet width instead of a top-row slice. */}
      {sheet === "time" && (
        <div
          data-globe-time-sheet
          role="dialog"
          aria-label="Simulated time"
          className="pointer-events-auto fixed inset-x-0 bottom-0 z-40 max-h-[70vh] overflow-y-auto rounded-t-2xl border-t border-line bg-ink/90 p-4 font-mono text-xs text-zinc-300 backdrop-blur sm:hidden"
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

          <input
            type="range"
            min={MIN_OFFSET}
            max={MAX_OFFSET}
            step={15}
            value={offset}
            onChange={(e) => setTimeOffset(Number(e.target.value))}
            onKeyDown={onSliderKeyDown}
            aria-label="Simulated time offset, minutes from now (sheet)"
            className="h-2 w-full accent-accent"
          />

          <div className="mt-3 flex items-center justify-between gap-2">
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
            <div className="flex items-center gap-2">
              {!reducedMotion && (
                <button
                  type="button"
                  onClick={() => setPlaying((p) => !p)}
                  aria-pressed={playing}
                  aria-label={playing ? "Pause simulated time" : "Play simulated time"}
                  className="ctrl-icon flex h-11 w-11 items-center justify-center rounded-full border border-line hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                >
                  {playing ? <Pause size={14} /> : <Play size={14} />}
                </button>
              )}
              {SPEEDS.map((s, i) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSpeedIdx(i)}
                  aria-pressed={speedIdx === i}
                  className={`flex h-11 items-center rounded-full border border-line px-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
                    speedIdx === i ? "bg-accent/20 text-accent" : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  x{s}
                </button>
              ))}
            </div>
          </div>
          {notLive && <p className="mt-2 text-zinc-500">Live feeds pause while you scrub.</p>}
        </div>
      )}
    </>
  );
}
