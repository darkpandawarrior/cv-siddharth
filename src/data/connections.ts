// The synergy graph — which writing series grew out of which case study or
// project. One source of truth powering the "field notes" chips on the home
// cards, the project detail pages, and anywhere else work and writing meet.
import { projects } from "./profile.ts";
import { writing } from "./writing.ts";
import { accentOf, titleize } from "./writingMeta.ts";

/**
 * case-study slug / project slug → writing series born from that work.
 *
 * Hand-kept, and it has to be: the registry says a lesson came from "Mileway",
 * not which of the four Mileway-shaped surfaces on this site the reader should
 * be sent to. What is NOT left to a person is noticing a gap. connections.test.ts
 * fails when a series in the registry appears under no key here, and names the
 * upstream project in the failure so the fix is a copy, not an investigation.
 */
export const RELATED_SERIES: Record<string, string[]> = {
  mileway: ["sensors-who-lie", "chain-of-custody", "crossing-the-schema"],
  paymentslab: ["one-brain-two-bodies"],
  "the-loopdown": ["notes-from-the-loop"],
  "gps-accuracy": ["the-night-shift", "sensors-who-lie"],
  "crash-reduction": ["the-coroutine-court"],
  "compose-migration": ["ghosts-in-the-recomposition"],
};

export type FieldNoteLink = { id: string; title: string; color: string; episodes: number };

export function fieldNotesFor(slug: string): FieldNoteLink[] {
  return (RELATED_SERIES[slug] || []).map((id) => {
    const s = writing.series.find((x) => x.id === id);
    return {
      id,
      title: s?.title || titleize(id),
      // accentOf, not SERIES_COLOR[id] — this file used to re-implement the
      // same lookup with the same hardcoded fallback, so fixing the legend
      // fixed the legend only and left these chips still colliding.
      color: accentOf(id),
      episodes: s?.episodes ?? 0,
    };
  });
}

/**
 * Reading order for the "next build" pager on project detail pages.
 *
 * A partial ordering, not the list. The curated half exists because mileway
 * genuinely should come first; everything else is appended from profile.ts, so
 * a new project joins the ring on arrival instead of falling out of it. The
 * filter guards the other direction too: a curated slug that gets renamed or
 * retired in profile.ts would otherwise leave `projects.find(...)` undefined
 * and kill the pager on the PREVIOUS project in the ring, which is a long way
 * from where the edit happened.
 */
const CURATED = ["mileway", "kursi", "paymentslab", "hiresignal", "deadlock"];

export const PROJECT_ORDER = [
  ...CURATED.filter((s) => projects.some((p) => p.slug === s)),
  ...projects.map((p) => p.slug).filter((s) => !CURATED.includes(s)),
];
