// The synergy graph — which writing series grew out of which case study or
// project. One source of truth powering the "field notes" chips on the home
// cards, the project detail pages, and anywhere else work and writing meet.
import { writing } from "./writing.ts";
import { SERIES_COLOR, titleize } from "./writingMeta.ts";

// case-study slug / project slug → writing series born from that work
export const RELATED_SERIES: Record<string, string[]> = {
  mileway: ["sensors-who-lie", "one-brain-two-bodies"],
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
      color: SERIES_COLOR[id] || "#7c5cff",
      episodes: s?.episodes ?? 0,
    };
  });
}

// Reading order for the "next build" pager on project detail pages.
export const PROJECT_ORDER = ["mileway", "kursi", "paymentslab", "hiresignal", "deadlock"];
