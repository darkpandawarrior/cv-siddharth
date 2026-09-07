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
 */
export interface Facet {
  id: string;
  label: string;
  to: string;
  hash?: string;
  /** ISO date the thing was made. */
  authored: string;
  /** ISO date it became expressible here. Equal to `authored` when nothing was recovered. */
  discovered: string;
}

export const facets: Facet[] = [
  { id: "work", label: "Case studies", to: "/", hash: "work", authored: "2021-08-01",
    discovered: "2021-08-01" },
  { id: "experience", label: "Experience", to: "/", hash: "experience", authored: "2021-08-01",
    discovered: "2021-08-01" },
  { id: "loopdown", label: "Notes From The Loop", to: "/loopdown", authored: "2026-08-13",
    discovered: "2026-08-13" },
  { id: "excelsior", label: "Excelsior", to: "/excelsior", authored: "2021-06-15",
    discovered: "2026-07-10" },
  { id: "board", label: "EB Profiles", to: "/ink", hash: "board", authored: "2019-05-09",
    discovered: "2026-07-10" },
  { id: "chess", label: "Chess corpus", to: "/chess", authored: "2026-07-30",
    discovered: "2026-07-30" },
  { id: "lab", label: "Labs", to: "/lab", authored: "2026-07-24",
    discovered: "2026-07-24" },
  // The list itself is years old, but it carries no usable start date — its
  // `Date` column is empty on every row — so `authored` cannot be dated without
  // inventing one. Equal dates here mean "not recoverable", not "made today".
  { id: "weeb", label: "Weeb Central", to: "/weeb", authored: "2026-08-05",
    discovered: "2026-08-05" },
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
 * after it so a 90-second read ends at Contact instead of a 14,000px scroll.
 * They're still on `/`, still in the DOM, just past the fold a satisfied
 * recruiter doesn't have to cross.
 */
export const homeFastPath = ["hero", "metrics", "fit", "casestudies", "projects", "experience"] as const;
export const homeDeepPath = ["morph", "shipped", "source", "skills"] as const;
