/**
 * The registry of navigable things. The rail's deviations and the instrument
 * view derive from this one list — adding a facet there is a data edit, not
 * an App.tsx edit. (The home page's own section order is still hardcoded in
 * App.tsx — a registry-driven home sequence was scoped out of this pass as a
 * larger refactor; see git history for the note.)
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
