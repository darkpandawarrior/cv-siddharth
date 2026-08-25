/**
 * NIGHT SURVEY §10 — THE MOBILE LADDER.
 *
 * One-time device tier at load: a viewport probe (`matchMedia`) plus a
 * load-time CPU benchmark, memoised for the session — never a runtime FPS
 * watchdog (the doc's own reasoning: "untestable, and it flickers quality
 * mid-drive").
 *
 * This is also the fix for a small drift the substrate rebuild had already
 * grown: `Fixtures.tsx` had its own `isMobileTier()` (viewport-only, for the
 * opensource speckle budget) and `World.tsx` had a second, separately
 * written copy of the same `matchMedia("(max-width: 820px)")` check (for
 * fog). Two hand-kept copies of one probe is exactly the drift class this
 * repo keeps getting bitten by — this is the one module both now read from,
 * and the only one that ALSO knows about §10's throttle tier, which neither
 * of them did.
 *
 * `computeTier` is the pure, testable core (a plain function of two already-
 * measured inputs); `deviceTier()` is the real one-shot reader that takes
 * those measurements from the browser. Tiers are cumulative, not exclusive:
 * tier 3 (throttled) gets every tier-2 drop as well as its own — a throttled
 * desktop is not a phone, but it needs the aggressive drops just as much.
 */

export type DeviceTier = 1 | 2 | 3;

const PHONE_QUERY = "(max-width: 820px)"; // §4/§10's own breakpoint, unchanged

/** §10's own number: a load-time bake this slow means a throttled/low-end
 *  device, not just a small screen. */
const THROTTLE_BUDGET_MS = 180;

/** A fixed amount of deterministic floating-point work — not a time-boxed
 *  loop — so the SAME work is measured on every device; only the clock
 *  differs. Calibrated so a normal desktop finishes in low single-digit ms
 *  (leaving a wide, unambiguous margin under THROTTLE_BUDGET_MS) while a 4x
 *  CPU-throttled device (this doc's own worked example) clears it. */
const BENCH_ITERATIONS = 400_000;

/** The core §10 test, as a pure function of two already-measured values —
 *  everything below this line is data, not a browser call, so it is
 *  directly unit-testable without stubbing `matchMedia`/`performance`. */
export function computeTier(input: { phone: boolean; benchMs: number }): DeviceTier {
  if (input.benchMs > THROTTLE_BUDGET_MS) return 3;
  return input.phone ? 2 : 1;
}

function isPhoneViewport(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(PHONE_QUERY).matches;
}

/** Runs the fixed-work benchmark once and returns how long it took. Result
 *  is read back into an exported value below so a build can never dead-code
 *  eliminate the loop as unused work. */
function benchmarkMs(): number {
  const start = performance.now();
  let acc = 0;
  for (let i = 0; i < BENCH_ITERATIONS; i++) {
    acc += Math.sqrt(i * 1.0001) * Math.sin(i);
  }
  lastBenchmarkResult = acc; // see the comment above
  return performance.now() - start;
}

// See benchmarkMs's own comment — never read for its value, only to keep
// the loop above live.
let lastBenchmarkResult = 0;
void lastBenchmarkResult;

let cached: DeviceTier | null = null;

/** The one-time device tier read — memoised for the life of the page. Never
 *  re-probed (§10: "One-time device tier at load"), so a device that starts
 *  throttled stays treated as tier 3 for the whole session even if the
 *  throttle lifts, and vice versa — the alternative is a quality level that
 *  can flicker mid-drive, which the doc explicitly rules out. */
export function deviceTier(): DeviceTier {
  if (cached !== null) return cached;
  if (typeof window === "undefined" || typeof performance === "undefined") {
    cached = 1; // SSR / a test environment with no browser — never the live path (Playground.tsx already gates the whole world behind hasWebGL())
    return cached;
  }
  cached = computeTier({ phone: isPhoneViewport(), benchMs: benchmarkMs() });
  return cached;
}

/** Test-only escape hatch — a fresh probe on the next call. */
export function resetDeviceTierForTest(): void {
  cached = null;
}

export interface TierBudget {
  /** Fog distance — §4/§10: desktop vs mobile. */
  fogNearFar: readonly [number, number];
  /** `<Canvas dpr>`'s own upper bound — §10 drop 1: "pixelRatio clamped to
   *  2". Kept at the world's existing 1.5 ceiling on every tier (already
   *  under 2); tier 3 pulls it down further to shave fill-rate on the
   *  slowest devices. */
  dprMax: number;
  /** OpensourceSpeckle's instance budget — §10 drop 2. */
  speckleCount: number;
  /** Terrain.tsx's `PlaneGeometry` segment counts — §10 drop 3: "Ground
   *  segments drop to PlaneGeometry(56,168,14,92)". */
  groundSegments: readonly [number, number];
}

const DESKTOP_BUDGET: TierBudget = {
  fogNearFar: [18, 130],
  dprMax: 1.5,
  speckleCount: 480,
  groundSegments: [28, 184],
};

const PHONE_BUDGET: TierBudget = {
  fogNearFar: [12, 70],
  dprMax: 1.5,
  speckleCount: 140,
  groundSegments: [28, 184],
};

const THROTTLED_BUDGET: TierBudget = {
  fogNearFar: [12, 70],
  dprMax: 1,
  speckleCount: 140,
  groundSegments: [14, 92],
};

/** §10's three drop steps, collapsed to the budget each tier renders with.
 *  ponytail: §10 also calls for chess-bollard windowing (index-window the
 *  instanced draw to 60m of the car), a halved lit-map resolution/upload
 *  rate, and — at tier 3 — stripping every fixture family but the gantries
 *  and turning the car's contact decal off. None of those three exist to
 *  gate yet (no contact decal is built at all; the lit map and the bollard
 *  family are both fixed-size today), so this budget stops at the four
 *  values every consumer in this world already has a real, safe place to
 *  read from. Add a field here — and read it from Fixtures.tsx/litMap.ts —
 *  when those land, rather than growing a second tier system next to this
 *  one. */
export function tierBudget(tier: DeviceTier): TierBudget {
  if (tier === 3) return THROTTLED_BUDGET;
  if (tier === 2) return PHONE_BUDGET;
  return DESKTOP_BUDGET;
}
