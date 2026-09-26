/**
 * Per-object reveal fade (visual-catalogue.md C4): "per-object fade as
 * tier-B assets resolve." When a kit swaps a GrammarInstances placeholder
 * for a real GLB/texture (or a placeholder itself first appears), the
 * object ramps from invisible to visible over `REVEAL_MS` rather than
 * popping — reduced motion collapses that ramp to instant, the same
 * doctrine `reducedMotion.ts` documents for every other automatic effect
 * in this world.
 *
 * `revealOpacity` is the pure core (elapsed ms in, opacity out) — the same
 * "pure function of an explicit time, not a clock read inside the
 * function" shape this codebase already uses for `computeSkyState`/
 * `classifyWeather` (src/lib/useSky.ts), which is what keeps this
 * testable with fake timers and deterministic across runs. `useReveal` is
 * the thin, impure wrapper a component actually mounts: it starts a real
 * clock the moment `active` flips true and ticks `onFrame` via
 * requestAnimationFrame until the ramp completes, then stops — a settled
 * reveal costs nothing per frame.
 */
import { useEffect, useRef } from "react";

export const REVEAL_MS = 300;

/** 0 at `elapsedMs <= 0`, 1 at `elapsedMs >= REVEAL_MS`, linear between.
 *  `reducedMotion` short-circuits to 1 immediately regardless of elapsed —
 *  visual-catalogue.md C4's "instant under reduced motion." */
export function revealOpacity(elapsedMs: number, reducedMotion: boolean): number {
  if (reducedMotion) return 1;
  if (elapsedMs <= 0) return 0;
  if (elapsedMs >= REVEAL_MS) return 1;
  return elapsedMs / REVEAL_MS;
}

/**
 * Mounts a rAF loop from the instant `active` becomes `true`, calling
 * `onFrame(revealOpacity(elapsed, reducedMotion))` each frame until the
 * ramp reaches 1 (or once, immediately, under reduced motion). `active`
 * flipping back to `false` and then `true` again restarts the ramp — the
 * caller's own remount/key is what "the same object resolving twice"
 * would look like, so this hook does not try to detect that itself.
 *
 * A ref-held callback (not itself in the effect's dependency array) keeps
 * a fresh closure without restarting the ramp on every render — the same
 * shape `dwell.ts`'s `useDwellEnter` already uses in this codebase.
 */
export function useReveal(active: boolean, reducedMotion: boolean, onFrame: (opacity: number) => void): void {
  const onFrameRef = useRef(onFrame);
  // Synced in its own effect, never written during render — refs are for
  // effects and event handlers, not render-body assignment (react-hooks'
  // own rule, which this repo's React Compiler preset enforces).
  useEffect(() => {
    onFrameRef.current = onFrame;
  });

  useEffect(() => {
    if (!active) return;
    if (reducedMotion) {
      onFrameRef.current(1);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const tick = () => {
      const opacity = revealOpacity(performance.now() - start, false);
      onFrameRef.current(opacity);
      if (opacity < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, reducedMotion]);
}
