/**
 * The location lens: a live, drivable demo of the thing he actually shipped.
 *
 * Doori is the hero project and the headline number on the site is GPS
 * accuracy going from 50% to 95% via staged dead reckoning — Kalman smoothing,
 * jitter suppression and spike rejection over a raw fix that wanders. That is
 * an abstract claim on a CV and a boring chart in a lab. Here it is the ground
 * under the car: drive, and you leave two trails. The scattered one is what the
 * receiver reported. The clean one is what the fusion made of it. The gap
 * between them IS the work.
 *
 * Pure, deterministic given its inputs, and free of three.js — the noise model
 * and the filter are the interesting part, so they are unit-testable rather
 * than buried in a render loop.
 */

import type { TallStructure } from "./city.ts";

export type Fix = { x: number; z: number };

/** Metres of horizontal error a consumer GPS fix carries in the open. */
const BASE_NOISE_M = 1.6;

/**
 * Urban-canyon multiplier. Real degradation is not uniform: accuracy collapses
 * beside tall structures because the sky view is blocked and signals arrive by
 * reflection. `structures` used to be a fixed set of monuments; it is now
 * whatever the west and east districts hand back from `westStructures()` /
 * `eastStructures()` (city.ts's `TallStructure[]`, built from the west
 * flank's employer blocks and towers plus the east flank's chess ridge and
 * corpus pillars) — so error now rises near the actual skyline the visitor is
 * driving through, on both flanks, rather than a fixed set this module used
 * to own an opinion about. This function stays generic on purpose: it only
 * ever reads `.x`/`.z`, so it doesn't care which district a structure came
 * from or how tall it is.
 */
const CANYON_RADIUS_M = 9;
const CANYON_MULTIPLIER = 5.5;

/** How far a spike jumps when one lands, and how often. */
const SPIKE_M = 14;
const SPIKE_CHANCE = 0.04;

/**
 * Deterministic value noise. Math.random would make the raw trail different on
 * every frame for a stationary craft, which reads as static rather than as
 * position error, and would make this module untestable.
 */
function hashNoise(seed: number): number {
  const s = Math.sin(seed * 12.9898) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
}

/** Error multiplier at a point, given the tall structures near it. */
export function canyonFactor(x: number, z: number, structures: TallStructure[]): number {
  let worst = 1;
  for (const s of structures) {
    const d = Math.hypot(x - s.x, z - s.z);
    if (d < CANYON_RADIUS_M) {
      // Linear falloff — closer to the wall, worse the fix.
      worst = Math.max(worst, 1 + (CANYON_MULTIPLIER - 1) * (1 - d / CANYON_RADIUS_M));
    }
  }
  return worst;
}

/** What the receiver claims, given where the craft actually is. */
export function rawFix(
  truth: Fix,
  seed: number,
  structures: TallStructure[],
): Fix {
  const factor = canyonFactor(truth.x, truth.z, structures);
  const spike = hashNoise(seed * 7.7) > 1 - SPIKE_CHANCE * 2 ? SPIKE_M : 0;
  return {
    x: truth.x + hashNoise(seed) * BASE_NOISE_M * factor + hashNoise(seed * 3.1) * spike,
    z: truth.z + hashNoise(seed * 1.7) * BASE_NOISE_M * factor + hashNoise(seed * 5.3) * spike,
  };
}

/**
 * The staged filter, in the order the CV describes it.
 *
 * 1. SPIKE REJECTION — a fix that jumps further than physics allows in the time
 *    elapsed is discarded outright, not smoothed. Feeding a 14m teleport into a
 *    smoother just spreads the error over the next second.
 * 2. DEAD RECKONING — when a fix is rejected (or absent) the track continues on
 *    the craft's own heading and speed. This is the part that carries you
 *    through the canyon, and it is why the clean trail stays a line where the
 *    raw one scatters.
 * 3. SMOOTHING — a scalar Kalman-style blend, weighted by how much the current
 *    fix is trusted.
 */
/**
 * How many fixes in a row may be rejected before the filter re-anchors.
 *
 * Without this the gate can lock itself out permanently, and it did: the very
 * first fix landed on a spike, the estimate anchored 5.7m off, and from then on
 * every GOOD fix looked like an outlier against that bad estimate and was
 * rejected. 96% rejection, a track that never recovered, and 1% accuracy on a
 * HUD claiming to demonstrate the opposite. A receiver that disagrees with its
 * own model for this long is wrong about the model, not the world.
 */
const MAX_CONSECUTIVE_REJECTS = 6;

export class TrackFilter {
  private estimate: Fix | null = null;
  private rejected = 0;
  private accepted = 0;
  private consecutiveRejects = 0;

  /**
   * @param fix       what the receiver reported
   * @param predicted where dead reckoning says the craft should be
   * @param maxJumpM  the furthest it could plausibly have moved since the last fix
   */
  update(fix: Fix, predicted: Fix, maxJumpM: number): Fix {
    if (!this.estimate) {
      this.estimate = { ...fix };
      this.accepted++;
      return this.estimate;
    }
    // Measured against the PREDICTION, not the previous estimate: the
    // prediction already accounts for how far the craft has moved, so this asks
    // "is this fix implausible given where we should be" rather than "has the
    // craft teleported since the last sample", which is a question that answers
    // yes for every fix as soon as the estimate is stale.
    const jump = Math.hypot(fix.x - predicted.x, fix.z - predicted.z);
    if (jump > maxJumpM && this.consecutiveRejects < MAX_CONSECUTIVE_REJECTS) {
      // Stage 1 + 2: reject and coast on the prediction.
      this.rejected++;
      this.consecutiveRejects++;
      this.estimate = { ...predicted };
      return this.estimate;
    }
    if (jump > maxJumpM) {
      // Sustained disagreement: the model has drifted, so trust the receiver
      // and re-anchor rather than defending a track that is already wrong.
      this.consecutiveRejects = 0;
      this.rejected++;
      this.estimate = { ...fix };
      return this.estimate;
    }
    this.consecutiveRejects = 0;
    this.accepted++;
    // Stage 3: correct the PREDICTION toward the fix — not the previous
    // estimate toward the fix.
    //
    // That distinction is the whole filter. Blending old estimate → fix is a
    // plain low-pass on position, and a low-pass lags whatever it follows: at
    // 2.5 m/s the lag is smaller than the noise and the filter looks great, at
    // 15 m/s the lag IS the error and the "improved" track is worse than the
    // raw one. Measured in the world at 94% raw against 92% filtered before
    // this change — the demo was disproving its own claim.
    //
    // Starting from the dead-reckoned prediction removes the lag entirely,
    // because motion is already accounted for; the gain then only has to decide
    // how much of the remaining disagreement to attribute to receiver noise.
    const disagreement = Math.hypot(fix.x - predicted.x, fix.z - predicted.z);
    // Gain floor of 0.45, not 0.1. Dead reckoning DRIFTS: the prediction is
    // built from the previous estimate plus a heading and a speed, each
    // slightly wrong, and a weak gain lets that error compound faster than the
    // fix can pull it back. Measured live at 1% accuracy with a 0.1 floor —
    // the track wandered off and the fixes were never trusted enough to
    // recover it. The floor is what bounds drift; the variable part still
    // leans on the prediction when the fix looks noisy.
    const gain = 0.45 + 0.25 / (1 + disagreement);
    this.estimate = {
      x: predicted.x + (fix.x - predicted.x) * gain,
      z: predicted.z + (fix.z - predicted.z) * gain,
    };
    return this.estimate;
  }

  /** Share of fixes the filter kept — the "we threw this much away" number. */
  acceptanceRate(): number {
    const total = this.accepted + this.rejected;
    return total === 0 ? 1 : this.accepted / total;
  }

  reset(): void {
    this.estimate = null;
    this.rejected = 0;
    this.accepted = 0;
    this.consecutiveRejects = 0;
  }
}

/**
 * Accuracy as a percentage: the share of samples landing within a usable radius
 * of the truth. Reported for both tracks so the HUD can show the pair.
 *
 * The tolerance is 2m, and the number matters. At 4m the raw fix's own noise
 * (~1.6m in the open) passes almost every sample, so both tracks score in the
 * nineties and the filter looks pointless — the metric was too loose to measure
 * what it claimed to. 2m sits inside the noise floor, which is exactly where
 * the difference between a raw fix and a fused one becomes visible. The HUD
 * states the tolerance so the number is not a mystery.
 */
export const ACCURACY_TOLERANCE_M = 2;

export function accuracyPct(errors: number[], toleranceM = ACCURACY_TOLERANCE_M): number {
  if (errors.length === 0) return 100;
  const within = errors.filter((e) => e <= toleranceM).length;
  return Math.round((within / errors.length) * 100);
}

/**
 * Mean positional error, metres — what the HUD actually reports.
 *
 * Chosen over "share of samples within Nm" after both were measured live. The
 * percentage form flatters the raw fix: its noise sits just under any tolerance
 * loose enough to be fair, so raw scored 63% against the fused track's 61%
 * while the fused track's mean error was a third lower. A metric that ranks the
 * worse track higher is not a metric, and putting it on screen next to a claim
 * about accuracy would have been quietly dishonest.
 */
export function meanError(errors: number[]): number {
  if (errors.length === 0) return 0;
  return errors.reduce((a, b) => a + b, 0) / errors.length;
}

/** Metres travelled between two points — the odometer's unit of work. */
export function stepDistance(a: Fix, b: Fix): number {
  return Math.hypot(b.x - a.x, b.z - a.z);
}
