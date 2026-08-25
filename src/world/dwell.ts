import { useCallback, useEffect, useRef, useState } from "react";
import { isAutoDriving } from "./input.ts";

/**
 * THE DWELL/PROMPT MECHANISM.
 *
 * Extracted from World.tsx's original room-entry logic (approach -> prompt
 * -> hold ~1s or press Enter -> fire) so Landmarks.tsx's project/case-study
 * approach can reuse the exact same contract rather than growing a second
 * one — the substrate design doc's own instruction ("reuse the dwell/prompt
 * mechanism Pavilions.tsx already has"). World.tsx wires this hook twice:
 * once for rooms (`onEnter` navigates), once for landmarks (`onEnter` opens
 * the in-world panel). The mechanism — arm on approach, disarm on exit,
 * fire once on dwell or confirm — is identical either way; only what firing
 * DOES belongs to the caller.
 *
 * Dwell never arms while the autopilot tour is driving (`isAutoDriving()`):
 * the tour has its own deliberate hold (World.tsx's TOUR_HOLD_MS), and
 * arming this one too would have the tour act on the first thing it
 * reaches instead of showing it off and moving on. The prompt card itself
 * still appears either way — only the auto-fire is gated.
 */
export function useDwellEnter<T>(ms: number, onEnter: (id: T) => void) {
  const [current, setCurrentState] = useState<T | null>(null);
  const currentRef = useRef<T | null>(null);
  const timerRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  /** Hides the prompt without firing — a target driven away from before its
   *  dwell (or before Enter) never enters/opens anything. */
  const cancel = useCallback(() => {
    currentRef.current = null;
    setCurrentState(null);
    clearTimer();
  }, [clearTimer]);

  /** Clears the prompt THEN acts — matching the original enterRoom's own
   *  ordering, so a fire from either the dwell timer or a manual confirm
   *  never leaves a stale prompt showing behind whatever `onEnter` does. */
  const fire = useCallback(
    (id: T) => {
      cancel();
      onEnter(id);
    },
    [cancel, onEnter],
  );

  const setPrompt = useCallback(
    (next: T | null) => {
      currentRef.current = next;
      setCurrentState(next);
      clearTimer();
      if (next !== null && !isAutoDriving()) {
        timerRef.current = window.setTimeout(() => {
          timerRef.current = null;
          // Re-check rather than trust the closed-over `next`: the target
          // may have changed (or gone) in the second between arming and
          // firing.
          if (currentRef.current === next) fire(next);
        }, ms);
      }
    },
    [clearTimer, fire, ms],
  );

  /** The HUD's Enter button / the Enter key — a no-op when nothing is
   *  currently prompted, so World.tsx can call every dwell's `confirm()`
   *  unconditionally on a keypress rather than first working out which one
   *  (if any) is active. */
  const confirm = useCallback(() => {
    if (currentRef.current !== null) fire(currentRef.current);
  }, [fire]);

  // A target driven away from before its dwell fires must not leave a
  // stray setTimeout that fires `onEnter` after the caller has unmounted.
  useEffect(() => clearTimer, [clearTimer]);

  return { current, currentRef, setPrompt, confirm, cancel };
}
