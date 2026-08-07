import { facets } from "../data/facets.ts";
import { dateZ, type PaletteToken } from "./city.ts";

/**
 * AUTHORED vs DISCOVERED — the two overhead threads, and the six markers
 * that deliberately do NOT get one.
 *
 * facets.ts has 8 entries. Six of them have `authored === discovered`:
 * nothing was recovered for those, so nothing is drawn but a single pillar
 * with a ring at its base — the same two colours the arcs use (accent for
 * the authored/past channel, probe for the discovered/now channel), just
 * collapsed onto one point because there is no gap to arc across. Two have a
 * real gap — `excelsior` (5+ years) and `board`/EB Profiles (7+ years) — and
 * those get the full treatment: a solid pillar where the thing was made, a
 * lit ring where it was found, and a tube arcing between them at
 * `x = 0`, directly over the boulevard, so a visitor drives UNDER the one
 * piece of geometry in this world that hangs above the road.
 *
 * Pure, and deliberately generic over `facets`: this file does not name
 * "excelsior" or "board" anywhere in its logic, only in the design doc's
 * prose above. Add a ninth facet with its own gap and an arc appears with no
 * edit here — that is exactly what threads.test.ts's own "arcCount ===
 * facets.filter(...)" assertion is checking.
 */

/** Every pillar/ring pair — arc or not — stands this tall before any arc
 *  height is added. The two arced facets' pillars and rings sit at exactly
 *  this height too; only the TUBE between them reaches the real apex. */
export const THREAD_MARKER_HEIGHT = 3;

const ARC_APEX_BASE = 6;
const ARC_APEX_PER_GAP_YEAR = 3.4;
const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

export const THREAD_PILLAR_TOKEN: PaletteToken = "accent";
export const THREAD_RING_TOKEN: PaletteToken = "probe";

export interface FacetThread {
  id: string;
  label: string;
  /** Where the pillar (the past/authored channel) stands. */
  authoredZ: number;
  /** Where the ring (the now/discovered channel) stands — equal to
   *  `authoredZ` when nothing was recovered. */
  discoveredZ: number;
  hasArc: boolean;
  /** 0 for the six flat markers. */
  gapYears: number;
  /** THREAD_MARKER_HEIGHT for the six flat markers; the tube's apex y for
   *  the two arcs. */
  apexY: number;
}

function requireZ(dateStr: string, facetId: string, field: string): number {
  const z = dateZ(dateStr);
  if (z === null) {
    // facets.ts's `authored`/`discovered` are always plain ISO dates ("the
    // ISO date the thing was made" per its own doc comment) — never a prose
    // era like writing.archive's `era` field, so a null here means the data
    // itself is malformed, not a legitimate "undated" case to route around.
    throw new Error(`threads: facets.ts["${facetId}"].${field} = "${dateStr}" is not a parseable date`);
  }
  return z;
}

/** One entry per `facets.ts` row (8), in the array's own order. */
export function facetThreads(): FacetThread[] {
  return facets.map((f) => {
    const authoredZ = requireZ(f.authored, f.id, "authored");
    const discoveredZ = requireZ(f.discovered, f.id, "discovered");
    const hasArc = f.authored !== f.discovered;
    const gapYears = hasArc ? (Date.parse(f.discovered) - Date.parse(f.authored)) / MS_PER_YEAR : 0;
    return {
      id: f.id,
      label: f.label,
      authoredZ,
      discoveredZ,
      hasArc,
      gapYears,
      apexY: hasArc ? ARC_APEX_BASE + gapYears * ARC_APEX_PER_GAP_YEAR : THREAD_MARKER_HEIGHT,
    };
  });
}
