import { gibsGetMapUrl, isoDateUTC, VIIRS_TRUE_COLOR } from "../layers/gibs.ts";

const DAY_MS = 86_400_000;

/** Metadata travels with each URL so a fallback can never be labelled live. */
export interface DailyFrame {
  readonly date: string;
  readonly timeMs: number;
  readonly url: string;
}

/** Indices address the newest-first frame list. Blend is the newer frame's
 *  weight; equal indices pin to an endpoint without a second texture sample. */
export interface FrameBlend {
  older: number;
  newer: number;
  blend: number;
}

/** Pure preload plan, not a fetch: T1 seven textures, T2 three, T3 none, each
 *  1024x512. Like dayImageryAttempts, yesterday is the newest intended mosaic
 *  because today's VIIRS swaths are incomplete. Dates are intentions, not a
 *  claim that NASA has published them (especially for future simulation).
 *  Rebuild on a day/tier change, not per frame. */
export function createGibsTimeline(simDate: Date, tier: 1 | 2 | 3) {
  const count = tier === 1 ? 7 : tier === 2 ? 3 : 0;
  const frames: readonly DailyFrame[] = Array.from({ length: count }, (_, i) => {
    const date = isoDateUTC(simDate, i + 1);
    return { date, timeMs: Date.parse(date), url: gibsGetMapUrl(VIIRS_TRUE_COLOR, { width: 1024, height: 512 }, date) };
  });
  // A timeline owns one scratch result: frameForTime allocates nothing.
  // Consume immediately or copy if retaining it across ticks.
  const result: FrameBlend = { older: 0, newer: 0, blend: 0 };
  return {
    frames,
    /** One-day-lagged UTC crossfade, clamped to the preload window. Returns
     *  null for T3 or an invalid clock; no unrequested texture is invented. */
    frameForTime(simNow: number): FrameBlend | null {
      if (frames.length === 0 || !Number.isFinite(simNow)) return null;
      const position = Math.max(0, Math.min(frames.length - 1, (frames[0].timeMs - (simNow - DAY_MS)) / DAY_MS));
      result.older = Math.ceil(position);
      result.newer = Math.floor(position);
      result.blend = result.older === result.newer ? 0 : result.older - position;
      return result;
    },
  };
}
