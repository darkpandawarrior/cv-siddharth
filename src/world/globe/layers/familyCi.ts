// LANE W6: pure logic for the CI-family ring -- arc segments over the
// sibling KMP-family repos signals-handler.ts's /api/signals already polls
// (M18). No three, no React -- same discipline as pulseEvents.ts, which
// already reads this same SignalsResponse.ci for its own ci-family pulses.
import type { CiRepoSlug, SignalsResponse } from "../../../../api/_lib/signals-handler.ts";

export const CI_RING_RADIUS = 0.85;
// The gap between segments (radians) at 5 repos keeps the ring reading as
// distinct instrument ticks, not one solid band.
const SEGMENT_GAP = 0.12;

/** Mirrors signals-handler.ts's own CI_REPOS order (not imported -- that's
 *  a server module's internal const; only its TYPES are meant to cross the
 *  client boundary, same reasoning as everywhere else this file imports
 *  `type` only). CiRepoSlug keeps this list honest: a TS error here is the
 *  day that union changes without a matching edit. */
export const CI_FAMILY_SLUGS: CiRepoSlug[] = ["doori", "gaddi", "paymentslab-kmp", "kmp-toolkit", "kmp-build-logic"];

export type CiSegmentStatus = "pass" | "fail" | "unknown";

export interface CiSegment {
  slug: CiRepoSlug;
  status: CiSegmentStatus;
  newestAt: string | null;
  failing: string[];
  /** Radians, measured the same way reachApps.ts's AppRingEntry.angle is:
   *  around the ring's local up-axis, 0 at local +X. */
  angleStart: number;
  angleLength: number;
}

/** `ci === null` (the whole feed down, or every repo failed server-side --
 *  signals-handler.ts's assembleOrNull zeroes the whole block on ANY one
 *  repo failing) draws no segments at all: "feed down: segments hidden". */
export function buildCiSegments(ci: SignalsResponse["ci"]): CiSegment[] {
  if (!ci) return [];
  const step = (Math.PI * 2) / CI_FAMILY_SLUGS.length;
  return CI_FAMILY_SLUGS.map((slug, i) => {
    const entry = ci[slug];
    const status: CiSegmentStatus = !entry || entry.state === "none" ? "unknown" : entry.state === "pass" ? "pass" : "fail";
    return {
      slug,
      status,
      newestAt: entry?.newestAt ?? null,
      failing: entry?.failing ?? [],
      angleStart: i * step + SEGMENT_GAP / 2,
      angleLength: step - SEGMENT_GAP,
    };
  });
}

/** Which slugs flipped status between two polls -- FamilyCiRing.tsx's own
 *  "small pulse on a status change" reads this. */
export function changedSlugs(prev: CiSegment[] | null, curr: CiSegment[]): Set<CiRepoSlug> {
  const changed = new Set<CiRepoSlug>();
  if (!prev) return changed;
  const before = new Map(prev.map((s) => [s.slug, s.status] as const));
  for (const s of curr) {
    const priorStatus = before.get(s.slug);
    if (priorStatus !== undefined && priorStatus !== s.status) changed.add(s.slug);
  }
  return changed;
}

/** "CI 5/5 passing" -- the reach status line's own CI clause. `null` when
 *  the whole feed is down (nothing to count). */
export function ciPassSummary(ci: SignalsResponse["ci"]): { pass: number; total: number } | null {
  if (!ci) return null;
  const pass = CI_FAMILY_SLUGS.filter((slug) => ci[slug]?.state === "pass").length;
  return { pass, total: CI_FAMILY_SLUGS.length };
}
