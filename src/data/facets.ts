import { writing } from "./writing.ts";

/**
 * The registry of navigable things. The rail's deviations and the instrument
 * view derive from this one list — adding a facet there is a data edit, not
 * an App.tsx edit.
 *
 * `authored` and `discovered` are separate because they genuinely are: a 2021
 * story found in 2026 belongs at 2021 in the trace and is still news.
 *
 * `to`/`hash` (not a single `href`) so render sites can hand these straight
 * to TanStack's `<Link to hash>` and get a real, SPA-routed anchor — no
 * string-parsing a combined href back apart at render time.
 *
 * `paths` and `kind` are the design doc's three-path idea (§3.1/§3.3): which
 * of Fast/Deep/Wandering a facet belongs to, and how it renders. Declared
 * here and not yet read anywhere — `facetsForPath` below is the derivation,
 * a path-scoped rail or home sequence is future work the type doesn't block.
 */
export type FacetPath = "fast" | "deep" | "wandering";
export type FacetKind = "work" | "writing" | "corpus" | "lab" | "record";

export interface Facet {
  id: string;
  label: string;
  to: string;
  hash?: string;
  /** ISO date the thing was made. */
  authored: string;
  /** ISO date it became expressible here. Equal to `authored` when nothing was recovered. */
  discovered: string;
  paths: FacetPath[];
  kind: FacetKind;
}

// m13: derived from the live corpus rather than typed by hand — a hand-copied
// literal here drifted the moment a new post shipped (this last read
// "2026-08-13" while writing.ts had already run to 2026-09-02, three weeks
// of undercount with nothing to notice it). Empty-string fallback so an
// empty lessons array degenerates to "always losing the max" instead of
// throwing.
const LOOPDOWN_AUTHORED = writing.lessons.reduce(
  (max, l) => (l.created && l.created > max ? l.created : max),
  "",
);

export const facets: Facet[] = [
  { id: "work", label: "Case studies", to: "/", hash: "work", authored: "2021-08-01",
    discovered: "2021-08-01", paths: ["fast", "deep"], kind: "work" },
  { id: "experience", label: "Experience", to: "/", hash: "experience", authored: "2021-08-01",
    discovered: "2021-08-01", paths: ["fast"], kind: "record" },
  { id: "loopdown", label: "Notes From The Loop", to: "/loopdown", authored: LOOPDOWN_AUTHORED,
    discovered: LOOPDOWN_AUTHORED, paths: ["deep"], kind: "writing" },
  { id: "excelsior", label: "Excelsior", to: "/excelsior", authored: "2021-06-15",
    discovered: "2026-07-10", paths: ["deep", "wandering"], kind: "writing" },
  // so-p1-soul-surfaced: this used to point at /ink#board, so a visitor never
  // reached the EB Profiles without first routing through the ink doorway.
  // It now points at the homepage's own EB Profiles section (App.tsx's
  // `EbProfiles`, homeDeepPath below) — a registry facet of its own, per
  // site-overhaul-design.md §3.4. /ink still hosts the full write-up.
  { id: "board", label: "EB Profiles", to: "/", hash: "board", authored: "2019-05-09",
    discovered: "2026-07-10", paths: ["deep"], kind: "record" },
  { id: "chess", label: "Chess corpus", to: "/chess", authored: "2026-07-30",
    discovered: "2026-07-30", paths: ["wandering"], kind: "corpus" },
  { id: "lab", label: "Labs", to: "/lab", authored: "2026-07-24",
    discovered: "2026-07-24", paths: ["wandering"], kind: "lab" },
  // The list itself is years old, but it carries no usable start date — its
  // `Date` column is empty on every row — so `authored` cannot be dated without
  // inventing one. Equal dates here mean "not recoverable", not "made today".
  { id: "weeb", label: "Weeb Central", to: "/weeb", authored: "2026-08-05",
    discovered: "2026-08-05", paths: ["wandering"], kind: "corpus" },
  // m12: the fiction archive was reachable site-wide (surfaces.ts, the wall,
  // the sitemap) but had no entry in this registry, so the rail and
  // instrument view — which read only from `facets`, not `surfaces` — never
  // offered a way into forty-eight stories. Same "no usable date" situation
  // as `weeb`: anthology.ts carries no per-entry authored date, so this is
  // anchored at the date the corpus and its route shipped (both first
  // committed 2026-08-15), not invented.
  { id: "anthology", label: "The Morkinstar Journals", to: "/anthology", authored: "2026-08-15",
    discovered: "2026-08-15", paths: ["wandering"], kind: "writing" },
];

/**
 * The home page's own section order, now a data entry instead of the
 * hardcoded JSX order `HomePage` used to carry. Each id maps to a component
 * in App.tsx's `HOME_SECTIONS`/`DEEP_SECTIONS` lookup — recovering a section
 * (or adding a new one) is one id here plus one lookup entry, not a reflow
 * of the render tree.
 *
 * Kept separate from `facets` above rather than folding in as another kind:
 * `facets` feeds the rail and instrument view, which position every entry by
 * `authored`/`discovered` chronology — these seven have no chronology (Hero
 * isn't "authored" on a date), and adding them there would put fixed page
 * furniture on the trace as if it were recovered material.
 *
 * `homeFastPath`: the seven the visitor sees without deciding to keep going
 * (site-overhaul-design.md, "three paths, one page" — Fast). `homeDeepPath`:
 * the evidence sections (device/platform proof, the shipped shelf, the repo
 * wall, skills) that used to be interleaved with the fast path, now placed
 * after it so a 90-second read ends at Contact instead of a 14,000px scroll,
 * plus `board` (so-p1-soul-surfaced, §3.4) — the EB Profiles, promoted onto
 * this path rather than left reachable only from /ink. They're still on `/`,
 * still in the DOM, just past the fold a satisfied recruiter doesn't have
 * to cross.
 */
export const homeFastPath = ["hero", "metrics", "fit", "casestudies", "projects", "experience"] as const;
export const homeDeepPath = ["morph", "shipped", "source", "skills", "board"] as const;
