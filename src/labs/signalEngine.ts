import {
  ROUTE_LENGTH_M,
  distXY,
  pointAtDistance,
  toXY,
  zoneAtFraction,
  type XY,
  type ZoneId,
} from "./signalRoute.ts";

/**
 * The Signal Lab engine — the location pipeline from Dice.tech, rebuilt as
 * Doori's, as a pure function of a seed. No DOM, no time, no randomness
 * that isn't seeded, so every number it produces is reproducible and can be
 * asserted in a test (see signalEngine.test.ts). The UI only draws what this
 * returns.
 *
 * The claim being demonstrated is a DISTANCE claim: field trip distances were
 * "off by large margins". So distance is what gets measured — by summing
 * haversine over whatever positions a stage actually accepted. There is no
 * fidelity constant anywhere in this file; if a stage helps, it helps because
 * the summed geometry moved, and if it hurts, the number says so.
 *
 * Two errors pull in OPPOSITE directions, which is the whole story:
 *   - noise INFLATES distance (every jitter adds length to the polyline), and
 *   - dropouts DEFLATE it (a chord across a tunnel is shorter than the road).
 * A pipeline that only suppresses noise overshoots into under-counting. That
 * is why the stages below both filter and bridge.
 */

/* ── Simulation ──────────────────────────────────────────────────────────── */

/** Mulberry32 — deterministic, so the lab tells the same story every visit. */
export function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Sample {
  /** seconds since start */
  t: number;
  /** where the vehicle really is */
  truth: XY;
  /** what the receiver reported, or null when it produced no fix at all */
  fix: XY | null;
  /** the receiver's own claimed horizontal accuracy, metres */
  accuracy: number;
  /** true when this fix is multipath, not gaussian scatter (for drawing) */
  spike: boolean;
  /** gyroscope turn rate, rad/s — a real sensor reading, available even with
   *  no satellites at all. Carries white noise plus a slowly walking bias,
   *  which is what makes inertial-only navigation degrade over time. */
  gyroRateRadS: number;
  zone: ZoneId;
}

export type Tier = "flagship" | "budget";

/** Fix cadence per tier. Budget-tier chipsets and OEM battery policy throttle
 *  updates — sparser samples cut corners off curves, which UNDER-counts. */
export const CADENCE_S: Record<Tier, number> = { flagship: 1, budget: 3 };

export interface SimOptions {
  seed?: number;
  tier?: Tier;
  /** how far along the loop to drive, metres. Defaults to one full lap. */
  distanceM?: number;
}

/** Drive the route once and record what the receiver would have reported. */
export function simulate({ seed = 20260726, tier = "flagship", distanceM = ROUTE_LENGTH_M }: SimOptions = {}): Sample[] {
  const rand = rng(seed);
  // Box-Muller, so sigmaM really is one standard deviation.
  const gauss = () => {
    const u = Math.max(1e-9, rand());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
  };

  const dt = CADENCE_S[tier];
  const out: Sample[] = [];
  let travelled = 0;
  let t = 0;
  let gyroBias = 0; // rad/s, random-walks — this is why IMU-only drifts
  let prevHeading: number | null = null;

  while (travelled <= distanceM) {
    const zone = zoneAtFraction(travelled / ROUTE_LENGTH_M);
    const truth = toXY(pointAtDistance(travelled));

    // True heading from the road geometry, differenced into a turn rate, then
    // corrupted the way a MEMS gyro corrupts it.
    const ahead = toXY(pointAtDistance(travelled + Math.max(1, zone.speedMps * dt)));
    const heading = Math.atan2(ahead.y - truth.y, ahead.x - truth.x);
    let turnRate = 0;
    if (prevHeading !== null) {
      let d = heading - prevHeading;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      turnRate = d / dt;
    }
    prevHeading = heading;
    gyroBias += (rand() - 0.5) * 0.0008;
    gyroBias = Math.max(-0.01, Math.min(0.01, gyroBias));
    const gyroRateRadS = turnRate + gyroBias + (rand() - 0.5) * 0.01;

    let fix: XY | null = null;
    let spike = false;
    let accuracy = zone.accuracyM;

    if (rand() >= zone.dropoutChance) {
      if (rand() < zone.spikeChance) {
        spike = true;
        const ang = rand() * Math.PI * 2;
        const throwM = 30 + rand() * 60; // multipath reflection, 30–90 m
        fix = { x: truth.x + Math.cos(ang) * throwM, y: truth.y + Math.sin(ang) * throwM };
        // A multipath fix often still reports a healthy accuracy — this is
        // precisely why gating on the reported number alone is not enough.
        accuracy = zone.accuracyM * (0.8 + rand() * 0.6);
      } else {
        fix = { x: truth.x + gauss() * zone.sigmaM, y: truth.y + gauss() * zone.sigmaM };
        accuracy = zone.accuracyM * (0.7 + rand() * 0.8);
      }
    }

    out.push({ t, truth, fix, accuracy, spike, gyroRateRadS, zone: zone.id });
    travelled += zone.speedMps * dt;
    t += dt;
  }
  return out;
}

/* ── The pipeline ────────────────────────────────────────────────────────── */

export interface PipelineConfig {
  /** drop fixes whose REPORTED accuracy is worse than the gate */
  accuracyGate: boolean;
  /** smooth the fix stream and ignore movement below the noise floor */
  jitter: boolean;
  /** reject fixes that imply impossible motion, with a divergence reset */
  spikeRejection: boolean;
  /** coast through dropouts on the last known velocity */
  imuFusion: boolean;
}

export const ALL_OFF: PipelineConfig = {
  accuracyGate: false,
  jitter: false,
  spikeRejection: false,
  imuFusion: false,
};

/** The stages, in the order they switch on. Each row of the UI ladder turns
 *  on one more flag and leaves the ones above it on. */
export const STAGES: readonly { key: keyof PipelineConfig; label: string; blurb: string }[] = [
  { key: "accuracyGate",   label: "accuracy gate",     blurb: "drop fixes the chipset itself flags as poor" },
  { key: "jitter",         label: "jitter suppression", blurb: "smooth the track, ignore sub-noise-floor movement" },
  { key: "spikeRejection", label: "spike rejection",    blurb: "reject impossible jumps, reset if it diverges" },
  { key: "imuFusion",      label: "IMU dead reckoning", blurb: "coast through tunnels on accelerometer + heading" },
];

/** Config with the first `n` stages enabled. n=0 is raw GPS. */
export function configForStages(n: number): PipelineConfig {
  const cfg = { ...ALL_OFF };
  for (let i = 0; i < n && i < STAGES.length; i++) cfg[STAGES[i].key] = true;
  return cfg;
}

export interface PathPoint {
  p: XY;
  /** index of the sample that produced it, so playback can slice the path */
  i: number;
  zone: ZoneId;
  /** true when this point came from inertial coasting, not a satellite fix */
  bridged: boolean;
}

export interface PipelineResult {
  /** positions the pipeline actually accepted, in order — the drawn path */
  path: PathPoint[];
  /** metres accumulated per zone, so the UI can show WHERE the error lives */
  perZoneM: Record<ZoneId, number>;
  /** summed haversine over `path`, metres. THE number. */
  distanceM: number;
  /** how many fixes were discarded */
  rejected: number;
  /** how many dropout samples were bridged by dead reckoning */
  bridged: number;
  /** RMS position error against ground truth, metres */
  rmseM: number;
  /** worst single-sample position error, metres — a mean hides a divergence */
  maxDriftM: number;
  /** how many times the filter admitted it had diverged and re-anchored */
  resets: number;
}

/** Fixes worse than this are discarded outright. */
export const ACCURACY_GATE_M = 20;
/** Movement below this between accepted points is noise, not travel. Scaled
 *  by the receiver's claimed accuracy and clamped, so a confident open-road
 *  fix is held to a tight bar and a 28 m parking-structure fix is not. */
export function deadbandFor(accuracyM: number): number {
  return Math.min(24, Math.max(4, 0.8 * accuracyM));
}

const MAX_CONSECUTIVE_REJECTS = 4; // after this the filter stops trusting itself
/** Process-uncertainty scale, metres — how far the filter will believe its
 *  own model over an incoming fix. */
const PROCESS_SIGMA_M = 7;

/**
 * Adaptive filter gain — the one idea that makes this a tracker rather than a
 * fixed low-pass. A Kalman gain is P/(P+R): the worse the measurement, the
 * less of it you take. Feeding the receiver's OWN claimed accuracy in as R
 * means the filter tightens automatically in an urban canyon and loosens on
 * open road, with no zone-specific tuning anywhere in the pipeline.
 *
 * Beta follows the critically-damped alpha-beta relation b = a²/(2-a), so the
 * velocity track cannot ring when the position track is aggressive.
 */
export function gainsFor(accuracyM: number): { alpha: number; beta: number } {
  const alpha = Math.min(0.7, Math.max(0.08, PROCESS_SIGMA_M / (PROCESS_SIGMA_M + accuracyM)));
  return { alpha, beta: (alpha * alpha) / (2 - alpha) };
}
const MAX_SPEED_MPS = 40;          // ~145 km/h: above this a fix is not motion
const SPEED_FLOOR_MPS = 5;         // keeps a cold tracker from gating itself out
const GATE_SIGMAS = 3;             // reject beyond 3σ of combined uncertainty
const STATIONARY_MPS = 1.5;        // below this the vehicle is treated as parked
const MAX_BRIDGE_S = 120;          // how long inertial coasting stays credible
// Mild: an accelerometer reading ~0 means the vehicle is HOLDING speed, so a
// steep bleed-off would systematically under-count the tunnel. This models
// growing uncertainty, not braking.
const BRIDGE_DECAY = 0.999;
/** How much of the measured innovation to believe as measurement noise. */
const INNOVATION_R_SCALE = 0.8;
/** Ceiling on the adaptive R, metres. */
const MAX_EFFECTIVE_R = 22;

/**
 * Run the fix stream through the pipeline.
 *
 * The filter is a constant-velocity alpha–beta tracker. Two details matter and
 * both were wrong in the first version of this lab:
 *
 *  1. Velocity comes from the tracker's own beta term, driven by innovation
 *     over elapsed time — not from dividing a smoothing correction by dt,
 *     which produces a velocity made mostly of noise.
 *  2. The innovation gate has a DIVERGENCE RESET. Gating without one is a
 *     trap: once the estimate drifts, every genuine fix looks like a spike,
 *     so it is rejected, so the estimate coasts further, forever. The old lab
 *     locked into 100% rejection within two laps and never recovered.
 */
export function runPipeline(samples: Sample[], cfg: PipelineConfig, tier: Tier = "flagship"): PipelineResult {
  const dt = CADENCE_S[tier];
  const path: PathPoint[] = [];
  const perZoneM: Record<ZoneId, number> = { open: 0, canyon: 0, tunnel: 0, ramp: 0, parking: 0 };
  let est: XY | null = null;
  let vel: XY = { x: 0, y: 0 };
  // A separately smoothed velocity, used ONLY for coasting. The instantaneous
  // tracker velocity is fine on average but noisy sample to sample, and dead
  // reckoning inherits whatever value happens to be current at the moment the
  // sky disappears — enter a tunnel on an unlucky sample and you coast 1.4 km
  // at the wrong speed. Real systems coast on a smoothed speed for exactly
  // this reason.
  let velSmooth: XY = { x: 0, y: 0 };
  // Innovation magnitude, smoothed. A receiver in an urban canyon reports a
  // confident accuracy and is wrong anyway, so trusting the reported number
  // alone under-filters precisely where filtering matters most. Measuring how
  // far fixes actually land from the prediction gives an honest R.
  let innovationEma = 0;
  let consecutiveRejects = 0;
  let rejected = 0;
  let bridged = 0;
  let resets = 0;
  let sqErr = 0;
  let scored = 0;

  // Smoothing IS the jitter suppressor, so the tracker switches on with that
  // stage — not with spike rejection. On a moving vehicle a deadband alone
  // barely helps: the inflation is noise added PERPENDICULAR to real travel,
  // and only a filter removes that. The deadband earns its keep where the
  // vehicle is crawling, which is the parking structure.
  // Below this, "the estimate" IS the reported fix — the honest meaning of raw
  // GPS, and why stage 0 must not be quietly smoothed.
  const tracking = cfg.jitter || cfg.spikeRejection || cfg.imuFusion;
  let bridgedRun = 0;

  let maxDriftM = 0;
  const score = (p: XY | null, truth: XY) => {
    if (!p) return;
    const d = distXY(p, truth);
    if (d > maxDriftM) maxDriftM = d;
    sqErr += d ** 2;
    scored++;
  };

  let index = 0;
  const accept = (p: XY, accuracy: number, zone: ZoneId, viaImu = false) => {
    const last = path[path.length - 1];
    if (!last) return void path.push({ p, i: index, zone, bridged: viaImu });
    // Deadband: scatter while stopped or crawling is the single largest source
    // of phantom distance. Scaled by what the receiver claims, because the
    // noise floor is not a constant — and measured against the last ACCEPTED
    // point, so slow real movement still accumulates until it clears the bar
    // rather than being discarded.
    const step = distXY(p, last.p);
    // A deadband is a STATIONARY detector, not a general filter. Suppressing
    // movement the vehicle genuinely made is how you turn a 1 km crawl through
    // a car park into zero — so it only engages when the tracker also believes
    // the vehicle is stopped. Knowing you are moving while GNSS scatters is
    // precisely what the inertial half of the fusion buys.
    const stationary = Math.hypot(velSmooth.x, velSmooth.y) < STATIONARY_MPS;
    if (cfg.jitter && stationary && step < deadbandFor(accuracy)) return;
    perZoneM[zone] += step;
    path.push({ p, i: index, zone, bridged: viaImu });
  };

  for (let si = 0; si < samples.length; si++) {
    const s = samples[si];
    index = si;
    if (!s.fix) {
      // Dropout. Without fusion the path simply jumps the gap on the next fix
      // — a chord, always shorter than the road it replaced.
      // Inertial dead reckoning is only trusted for a bounded stretch. Real
      // IMU drift is quadratic in time, so a tunnel is survivable and an
      // underground car park is not — past the budget the engine stops
      // claiming distance rather than inventing it.
      if (cfg.imuFusion && est && bridgedRun * dt < MAX_BRIDGE_S) {
        // Rotate the velocity by the measured turn rate before integrating it:
        // this is the whole point of fusing the gyro. Coasting in a straight
        // line through a curving tunnel is not dead reckoning, it is just
        // being wrong in a straight line.
        const dTheta = s.gyroRateRadS * dt;
        const cos = Math.cos(dTheta);
        const sin = Math.sin(dTheta);
        velSmooth = { x: velSmooth.x * cos - velSmooth.y * sin, y: velSmooth.x * sin + velSmooth.y * cos };
        est = { x: est.x + velSmooth.x * dt, y: est.y + velSmooth.y * dt };
        velSmooth = { x: velSmooth.x * BRIDGE_DECAY, y: velSmooth.y * BRIDGE_DECAY };
        vel = { ...velSmooth };
        bridged++;
        bridgedRun++;
        accept(est, s.accuracy, s.zone, true);
      }
      score(est, s.truth);
      continue;
    }

    bridgedRun = 0;
    // Bound once: narrowing on a mutable property does not survive the calls
    // below, and this reads better than re-asserting it four times.
    const fix: XY = s.fix;

    if (cfg.accuracyGate && s.accuracy > ACCURACY_GATE_M) {
      rejected++;
      score(est, s.truth);
      continue;
    }

    if (!tracking) {
      // Raw (optionally accuracy-gated, optionally deadbanded) fixes, as
      // reported. No prediction, no smoothing, no velocity.
      est = fix;
      accept(est, s.accuracy, s.zone);
      score(est, s.truth);
      continue;
    }

    if (!est) {
      est = { ...fix };
      vel = { x: 0, y: 0 };
      accept(est, s.accuracy, s.zone);
      score(est, s.truth);
      continue;
    }

    // Annotated because `est = predicted` below makes the inference circular.
    const predicted: XY = { x: est.x + vel.x * dt, y: est.y + vel.y * dt };
    const dx = fix.x - predicted.x;
    const dy = fix.y - predicted.y;
    const innovation = Math.hypot(dx, dy);
    innovationEma = innovationEma === 0 ? innovation : innovationEma * 0.9 + innovation * 0.1;
    // A fix is impossible if reaching it would need superhighway speed, with
    // the receiver's own claimed accuracy as slack.
    // The gate is a statistical one, not a hand-picked distance: how far could
    // this fix legitimately land from the prediction, given how uncertain the
    // model is and how noisy the measurement is? Adding the two in quadrature
    // and taking GATE_SIGMAS of the result adapts to speed AND to accuracy,
    // where a single constant serves neither. Floored so a cold-started
    // tracker (velSmooth still zero) cannot gate itself into lockout.
    const speedNow = Math.min(MAX_SPEED_MPS, Math.max(SPEED_FLOOR_MPS, Math.hypot(velSmooth.x, velSmooth.y)));
    const modelSigma = PROCESS_SIGMA_M + speedNow * dt * 0.5;
    const gateM = GATE_SIGMAS * Math.hypot(modelSigma, s.accuracy);

    if (cfg.spikeRejection && innovation > gateM && consecutiveRejects < MAX_CONSECUTIVE_REJECTS) {
      consecutiveRejects++;
      rejected++;
      est = predicted; // coast on the model
      accept(est, s.accuracy, s.zone);
    } else if (consecutiveRejects >= MAX_CONSECUTIVE_REJECTS) {
      // Divergence reset — the gate has been refusing everything, so the
      // estimate, not the receiver, is what is wrong. Re-anchor on the fix.
      est = { ...fix };
      vel = { x: 0, y: 0 };
      velSmooth = { x: 0, y: 0 };
      innovationEma = 0;
      resets++;
      consecutiveRejects = 0;
      accept(est, s.accuracy, s.zone);
    } else {
      // Trust the WORSE of what the receiver claims and what it demonstrates.
      // Capped: inflating R without limit is how a filter talks itself into
      // standing still. Past MAX_EFFECTIVE_R the velocity estimate collapses,
      // the vehicle reads as parked, and a genuine crawl accumulates nothing.
      const effectiveR = Math.min(MAX_EFFECTIVE_R, Math.max(s.accuracy, innovationEma * INNOVATION_R_SCALE));
      const { alpha, beta } = gainsFor(effectiveR);
      est = { x: predicted.x + alpha * dx, y: predicted.y + alpha * dy };
      vel = { x: vel.x + (beta * dx) / dt, y: vel.y + (beta * dy) / dt };
      velSmooth = { x: velSmooth.x * 0.7 + vel.x * 0.3, y: velSmooth.y * 0.7 + vel.y * 0.3 };
      // A vehicle cannot exceed MAX_SPEED_MPS, so neither may the model.
      // Without this an unrejected spike injects a velocity the tracker then
      // coasts on through the next tunnel.
      const speed = Math.hypot(vel.x, vel.y);
      if (speed > MAX_SPEED_MPS) {
        const k = MAX_SPEED_MPS / speed;
        vel = { x: vel.x * k, y: vel.y * k };
      }
      consecutiveRejects = 0;
      accept(est, s.accuracy, s.zone);
    }

    score(est, s.truth);
  }

  let distanceM = 0;
  for (let i = 1; i < path.length; i++) distanceM += distXY(path[i - 1].p, path[i].p);

  return {
    path,
    perZoneM,
    distanceM,
    rejected,
    bridged,
    resets,
    rmseM: scored ? Math.sqrt(sqErr / scored) : 0,
    maxDriftM,
  };
}

/** Ground-truth distance actually driven by a sample run. */
export function truthDistance(samples: Sample[]): number {
  let d = 0;
  for (let i = 1; i < samples.length; i++) d += distXY(samples[i - 1].truth, samples[i].truth);
  return d;
}

export interface LadderRow {
  stages: number;
  label: string;
  distanceM: number;
  errorPct: number;
  rmseM: number;
}

/** The headline table: raw GPS, then one stage at a time, against truth. */
export function ladder(samples: Sample[], tier: Tier = "flagship"): { truthM: number; rows: LadderRow[] } {
  const truthM = truthDistance(samples);
  const rows: LadderRow[] = [];
  for (let n = 0; n <= STAGES.length; n++) {
    const r = runPipeline(samples, configForStages(n), tier);
    rows.push({
      stages: n,
      label: n === 0 ? "raw GPS" : `+ ${STAGES[n - 1].label}`,
      distanceM: r.distanceM,
      errorPct: truthM > 0 ? ((r.distanceM - truthM) / truthM) * 100 : 0,
      rmseM: r.rmseM,
    });
  }
  return { truthM, rows };
}
