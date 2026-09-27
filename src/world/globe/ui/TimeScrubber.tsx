import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { useReducedMotion } from "../../../SceneActivity.tsx";
import { simTime, useGlobe } from "../globeStore.ts";

/** LANE L5 (navigation and UI) owns this file. */

const MIN_OFFSET = -24 * 60;
const MAX_OFFSET = 24 * 60;
const SPEEDS = [60, 600, 3600] as const;

function isTypingTarget(el: EventTarget | null): boolean {
  return el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
}

function fmt(d: Date, timeZone: string): string {
  return d.toLocaleString("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short", hour12: false });
}

export default function TimeScrubber(_props: { tier: 1 | 2 | 3 }) {
  const offset = useGlobe((s) => s.timeOffsetMin);
  const setTimeOffset = useGlobe((s) => s.setTimeOffset);
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

  return (
    <div
      data-globe-time-scrubber
      className="pointer-events-auto absolute inset-x-2 top-16 z-20 mx-auto w-[min(94vw,440px)] rounded-2xl border border-line bg-ink/70 px-3 py-2 font-mono text-xs text-zinc-300 backdrop-blur sm:top-4 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2"
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="truncate">
          {fmt(now, "Asia/Kolkata")} IST · {fmt(now, "UTC")} UTC
        </span>
        {notLive && (
          <span
            data-globe-not-live
            className="shrink-0 rounded-full px-1.5 py-0.5 text-xs font-semibold"
            style={{ color: "var(--color-warn)", border: "1px solid var(--color-warn)" }}
            title="Live feeds pause while you scrub"
          >
            not live
          </span>
        )}
      </div>

      <input
        type="range"
        min={MIN_OFFSET}
        max={MAX_OFFSET}
        step={15}
        value={offset}
        onChange={(e) => setTimeOffset(Number(e.target.value))}
        onKeyDown={onSliderKeyDown}
        aria-label="Simulated time offset, minutes from now"
        className="w-full accent-accent"
      />

      <div className="mt-1.5 flex items-center justify-between gap-2">
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

        <div className="flex items-center gap-1">
          {!reducedMotion && (
            <button
              type="button"
              onClick={() => setPlaying((p) => !p)}
              aria-pressed={playing}
              aria-label={playing ? "Pause simulated time" : "Play simulated time"}
              className="ctrl-icon flex h-6 w-6 items-center justify-center rounded-full border border-line hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              {playing ? <Pause size={11} /> : <Play size={11} />}
            </button>
          )}
          {SPEEDS.map((s, i) => (
            <button
              key={s}
              type="button"
              onClick={() => setSpeedIdx(i)}
              aria-pressed={speedIdx === i}
              className={`rounded-full border border-line px-1.5 py-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
                speedIdx === i ? "bg-accent/20 text-accent" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              x{s}
            </button>
          ))}
        </div>
      </div>
      {notLive && <p className="mt-1 text-zinc-500">Live feeds pause while you scrub.</p>}
    </div>
  );
}
