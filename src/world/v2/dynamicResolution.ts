/**
 * world-v2-spec.md §8 "Dynamic resolution (T1 only)": "follows the
 * reference hysteresis: after frame 90, a 60-frame rolling average. If it
 * exceeds 23.5 ms, scale x0.92 (x0.84 if above 45 ms), floor 0.72, with an
 * 8 s cooldown. If it is under 17.6 ms, scale +0.05 with a 2.5 s cooldown.
 * This amends `deviceTier.ts` §10 ('never a runtime FPS watchdog'). It
 * changes *resolution only*, never features, so the flicker that §10 rules
 * out cannot happen."
 *
 * `DynamicResolution` is the pure state machine: every input is a frame
 * time in milliseconds, fed one at a time through `tick()`, and every
 * output is deterministic given the sequence fed so far. There is no
 * `performance.now()`/wall-clock read anywhere in this file, on purpose:
 * `dynamicResolution.test.ts` scripts a frame-time sequence and asserts the
 * exact scale it produces, which only holds still if a re-run of that same
 * sequence always ticks the cooldown down by the same amount (the frame
 * time itself), never by however long the test happened to take to run.
 *
 * ponytail: the 8 s and 2.5 s windows are ONE shared cooldown (whichever
 * direction fires resets it to ITS OWN duration and blocks both directions
 * until it drains), not two independent per-direction timers. That is the
 * standard hysteresis shape for exactly this kind of two-threshold
 * controller (it is what stops a value sitting near a threshold from
 * oscillating every frame), and the spec's own wording ("with an 8 s
 * cooldown" / "with a 2.5 s cooldown") reads as "this action, once taken,
 * doesn't repeat for this long" rather than "block only its own kind" -
 * upgrade path if a future tuning pass wants independent timers: split
 * `cooldownMs` into `downCooldownMs`/`upCooldownMs`.
 */

export const SCALE_FLOOR = 0.72;
export const SCALE_CEIL = 1;

const WINDOW_SIZE = 60;
const WARMUP_FRAMES = 90;

const DOWNSCALE_HIGH_MS = 45;
const DOWNSCALE_HIGH_FACTOR = 0.84;
const DOWNSCALE_LOW_MS = 23.5;
const DOWNSCALE_LOW_FACTOR = 0.92;
const DOWNSCALE_COOLDOWN_MS = 8_000;

const UPSCALE_THRESHOLD_MS = 17.6;
const UPSCALE_STEP = 0.05;
const UPSCALE_COOLDOWN_MS = 2_500;

export type ResolutionAction = "none" | "downscale-high" | "downscale-low" | "upscale";

export interface DynamicResolutionSnapshot {
  scale: number;
  frame: number;
  action: ResolutionAction;
  cooldownMs: number;
}

/**
 * T1's own dynamic-resolution controller. One instance per mounted
 * `<Canvas>` (a fresh one on remount, e.g. via `useMemo(() => new
 * DynamicResolution(), [])` in whichever layer drives the drawing-buffer
 * scale), fed one frame time per `useFrame` tick.
 */
export class DynamicResolution {
  private scale = SCALE_CEIL;
  private frame = 0;
  private window: number[] = [];
  private cooldownMs = 0;

  get currentScale(): number {
    return this.scale;
  }

  get frameCount(): number {
    return this.frame;
  }

  /** Feeds one frame's time in milliseconds and returns a snapshot of the
   *  state AFTER this frame — `scale` is what the next frame should render
   *  at. */
  tick(frameMs: number): DynamicResolutionSnapshot {
    this.frame += 1;
    this.window.push(frameMs);
    if (this.window.length > WINDOW_SIZE) this.window.shift();

    if (this.cooldownMs > 0) {
      this.cooldownMs = Math.max(0, this.cooldownMs - frameMs);
      return { scale: this.scale, frame: this.frame, action: "none", cooldownMs: this.cooldownMs };
    }

    if (this.frame <= WARMUP_FRAMES || this.window.length < WINDOW_SIZE) {
      return { scale: this.scale, frame: this.frame, action: "none", cooldownMs: 0 };
    }

    const avg = this.window.reduce((sum, ms) => sum + ms, 0) / this.window.length;
    let action: ResolutionAction = "none";

    // Each branch is a no-op once the scale is already pinned at the floor
    // or the ceiling (e.g. a sustained bad frame time after the floor is
    // reached). Skipping the cooldown in that case, rather than starting an
    // 8 s/2.5 s timer for a change that didn't happen, is what keeps a
    // pinned scale re-checked every frame instead of latching a stale
    // reading for a whole cooldown window.
    if (avg > DOWNSCALE_HIGH_MS) {
      const next = Math.max(SCALE_FLOOR, this.scale * DOWNSCALE_HIGH_FACTOR);
      if (next !== this.scale) {
        this.scale = next;
        this.cooldownMs = DOWNSCALE_COOLDOWN_MS;
        action = "downscale-high";
      }
    } else if (avg > DOWNSCALE_LOW_MS) {
      const next = Math.max(SCALE_FLOOR, this.scale * DOWNSCALE_LOW_FACTOR);
      if (next !== this.scale) {
        this.scale = next;
        this.cooldownMs = DOWNSCALE_COOLDOWN_MS;
        action = "downscale-low";
      }
    } else if (avg < UPSCALE_THRESHOLD_MS) {
      const next = Math.min(SCALE_CEIL, this.scale + UPSCALE_STEP);
      if (next !== this.scale) {
        this.scale = next;
        this.cooldownMs = UPSCALE_COOLDOWN_MS;
        action = "upscale";
      }
    }

    return { scale: this.scale, frame: this.frame, action, cooldownMs: this.cooldownMs };
  }

  /** Test-only / hot-reload-only reset back to frame 0 at full scale. */
  reset(): void {
    this.scale = SCALE_CEIL;
    this.frame = 0;
    this.window = [];
    this.cooldownMs = 0;
  }
}
