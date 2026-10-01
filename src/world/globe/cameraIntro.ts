// WAVE 6 LANE X5 (cinematic, skippable first visit): pure timeline/path
// math for the intro, plus the tiny cross-component signal CameraDirector.tsx
// (inside the Canvas, drives the fly-in) and ui/Intro.tsx (a plain DOM
// overlay, mounted as a sibling OUTSIDE the Canvas in Globe.tsx, owns the
// copy/skip button) coordinate through. Neither can see the other's props --
// Intro.tsx alone has `tier`, CameraDirector.tsx alone has the camera -- and
// globeStore.ts (this app's actual shared state) is out of this lane's file
// ownership. A module-level singleton is the same shape globeStore.ts uses
// for its own `entityPositions`/`sceneHandles` maps: state two independent
// mounts both need that isn't worth a whole store slice for.
import { latLonToXyz, slerpUnit, vNorm, type Vec3 } from "./cameraMath.ts";

// 7s: mid-band of the brief's 6-8s window, split so the camera has time to
// actually travel and the copy line gets a real hold, not a flash.
export const INTRO_DURATION_MS = 7000;
export const INTRO_LINE = "Every claim below is sourced, live where it says live.";

const SEEN_KEY = "cv-siddharth:globe-intro-seen";

/** `typeof localStorage === "undefined"` guard + try/catch: the same shape
 *  as this repo's other localStorage helpers (excelsiorProgress.ts's own
 *  readProgress/writeProgress) -- a private tab, a full quota, or storage
 *  blocked by policy must never throw through this and break the globe.
 *  Worst case the intro replays next visit; never a crash. */
export function hasSeenIntro(): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}
export function markIntroSeen(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    // Storage unavailable: the intro just replays. Not fatal.
  }
}

/** Tier 3 is "minimal or off" (house budget rule) and reduced motion means
 *  no unrequested camera motion at all -- both hard-exclude the cinematic
 *  regardless of the seen-flag. The ONLY thing in this codebase that knows
 *  `tier` here is ui/Intro.tsx (its own prop); this stays a pure function of
 *  its inputs so that decision is unit-testable without mounting React. */
export function shouldPlayIntro(tier: 1 | 2 | 3, reducedMotion: boolean): boolean {
  return tier !== 3 && !reducedMotion && !hasSeenIntro();
}

export type IntroPhase = "idle" | "playing" | "skipped" | "done";
let phase: IntroPhase = "idle";
const listeners = new Set<() => void>();
function emit(): void {
  listeners.forEach((l) => l());
}
export function getIntroPhase(): IntroPhase {
  return phase;
}
/** Replay-on-subscribe isn't needed here: every caller reads
 *  `getIntroPhase()` itself right after subscribing (see CameraDirector.tsx
 *  and Intro.tsx), so this only needs to notify of a CHANGE. */
export function subscribeIntro(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
export function startIntro(): void {
  if (phase !== "idle") return;
  phase = "playing";
  emit();
}
export function skipIntro(): void {
  if (phase !== "playing") return;
  phase = "skipped";
  markIntroSeen();
  emit();
}
export function finishIntro(): void {
  if (phase !== "playing") return;
  phase = "done";
  markIntroSeen();
  emit();
}
/** Tests only: the module is a singleton, so a fresh `phase` between test
 *  cases needs an explicit reset rather than a fresh import. */
export function resetIntroForTest(): void {
  phase = "idle";
  listeners.clear();
}

/** Where the intro's camera flight starts, on the great circle between the
 *  CURRENT subsolar direction and where it ENDS (the app's own resting
 *  view) -- halfway across. t=0 on that circle (the subsolar direction
 *  itself) would face the sunlit disk dead-on; t=0.5 is "facing the sun
 *  limb": the sunlit hemisphere's curved edge against space, which is what
 *  the brief asks for, and it's already travelling the right direction
 *  (toward `endDir`) for the rest of the flight to continue along. Pure and
 *  parametrised on the two directions rather than reading Date.now() or a
 *  PUNE constant itself, so a test passes fixed vectors instead of flaking
 *  on wall-clock time. */
export function introStartDirection(subsolarDir: Vec3, endDir: Vec3): Vec3 {
  return slerpUnit(vNorm(subsolarDir), vNorm(endDir), 0.5);
}

/** Convenience wrapper of the above taking lat/lon degrees, since every
 *  caller has lat/lon (subsolarPoint's own return shape, PUNE) rather than
 *  unit vectors on hand. */
export function introStartDirectionFromLatLon(subsolarLat: number, subsolarLon: number, endDir: Vec3): Vec3 {
  return introStartDirection(latLonToXyz(subsolarLat, subsolarLon), endDir);
}
