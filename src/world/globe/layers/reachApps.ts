// LANE W6 (living-earth wave 3, the owner's own data on the globe): pure
// logic for the app-reach ring -- one thin column per live app in the
// white-label fleet (src/data/store.ts's `fleet`), height by log10 of its
// own install-band floor. No three, no React -- same discipline as
// geoMath.ts and pulseEvents.ts.
//
// Scale note: HEIGHT_PER_DECADE and MIN_HEIGHT are copied from
// ReachColumns.tsx's own convention on purpose, not imported -- that file
// belongs to another lane mid-restyle this wave, and the two rings must
// read on the SAME absolute scale (a lone 1M+ app column should sit close
// to, never past, the aggregate install-floor column ReachColumns draws) so
// the numbers stay comparable at a glance.
export const HEIGHT_PER_DECADE = 0.25;
export const MIN_HEIGHT = 0.4;
export const APP_RING_RADIUS = 0.55;

export interface FleetAppInput {
  id: string;
  name: string;
  installs: string;
  side: "rider" | "driver";
  rating: number | null;
  updated: string;
  url: string;
}

export interface AppRingEntry extends FleetAppInput {
  floor: number;
  height: number;
  /** Radians, measured around the ring's own local up-axis (Pune's surface
   *  normal), 0 at the ring's local +X. */
  angle: number;
}

/** Play's own install-band string ("100K+", "5M+", "500+") to its floor --
 *  the number Play itself guarantees is a LOWER bound, never a derived
 *  midpoint or estimate. Unparseable input floors to 0 rather than throwing
 *  (a malformed band should shrink a column to nothing, not crash the ring). */
export function installFloor(installs: string): number {
  const m = /^(\d+(?:\.\d+)?)([KMB])?\+?$/.exec(installs.trim());
  if (!m) return 0;
  const [, numStr, unit] = m;
  const mult = unit === "K" ? 1e3 : unit === "M" ? 1e6 : unit === "B" ? 1e9 : 1;
  return Math.round(Number(numStr) * mult);
}

export function columnHeight(floor: number): number {
  return Math.max(MIN_HEIGHT, Math.log10(Math.max(1, floor)) * HEIGHT_PER_DECADE);
}

/** Every app, biggest floor first, spread evenly around the ring --
 *  "ordered by installs". */
export function buildAppRing(apps: readonly FleetAppInput[]): AppRingEntry[] {
  const sorted = [...apps].sort((a, b) => installFloor(b.installs) - installFloor(a.installs));
  return sorted.map((app, i) => {
    const floor = installFloor(app.installs);
    return { ...app, floor, height: columnHeight(floor), angle: (i / sorted.length) * Math.PI * 2 };
  });
}

/** "store.ts (Play Store listing snapshot, as of <date>)" -- the newer of
 *  the two committed stamps (storeVerifiedAt is a --published-only
 *  re-check, storeGeneratedAt a full regen; check-freshness.mjs already
 *  reads max(both) for the same reason, per store.ts's own comment). */
export function freshestStoreDate(generatedAt: string, verifiedAt: string): string {
  return Date.parse(verifiedAt) >= Date.parse(generatedAt) ? verifiedAt : generatedAt;
}
