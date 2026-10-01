/** WAVE 6 LANE X3 (time machine UI): the two small pure helpers HistoryLayer
 *  needs that don't belong in usgsHistory.ts (owned by W13/Codex) — an
 *  instantaneous playback-speed estimate and the sliding time window that
 *  speed implies for `pulseState`'s envelope. New file, not an edit to an
 *  existing timeMachine module (globe-lanes.md's ownership rule). */

/** `pulseState`'s own doc: "Speed is simulated seconds per wall second,
 *  matching TimeScrubber." HistoryLayer has no store field or prop carrying
 *  TimeScrubber's current play speed (adding one would mean editing
 *  globeStore.ts, off limits), so it measures it directly from consecutive
 *  frames: how much simulated time moved per real millisecond. Exponential
 *  smoothing absorbs one frame's rAF jitter or a slider drag's jump in
 *  `now` so the pulse envelope doesn't flicker between frames.
 *  `wallDeltaMs <= 0` (a paused tab, a StrictMode double-invoke) means no
 *  real time passed to measure a rate from — keep the previous estimate
 *  rather than divide by zero. */
export function estimatePlaybackSpeed(prevSpeed: number, simDeltaMs: number, wallDeltaMs: number): number {
  if (!Number.isFinite(simDeltaMs) || !Number.isFinite(wallDeltaMs) || wallDeltaMs <= 0) return prevSpeed;
  const instant = simDeltaMs / wallDeltaMs;
  return prevSpeed + (instant - prevSpeed) * 0.3;
}

// ponytail: only the forward-playback branch of pulseState's envelope
// (`speed >= 0`) — TimeScrubber has no reverse-play control, so a negative
// `speed` never reaches this layer. Add the mirrored window
// (`[simNowMs, simNowMs + 2000 * scale]`) if a reverse control ever ships.
/** The window of simulated time in which `pulseState(eventTime, simNowMs,
 *  speed)` can be nonzero for forward playback (its envelope spans 2000ms
 *  of *speed-scaled* time). `speed`'s magnitude is floored at 1 so a
 *  paused scrub (speed 0) still gets the normal 1x-wide window instead of
 *  collapsing to a single instant. */
export function replayWindow(simNowMs: number, speed: number): [number, number] {
  const half = 2000 * Math.max(Math.abs(speed), 1);
  return [simNowMs - half, simNowMs];
}
