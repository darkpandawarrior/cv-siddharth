/**
 * The registry of navigable things. Home sections, the rail's deviations and
 * the instrument view all derive from this one list — adding a facet is a data
 * edit, not an App.tsx edit.
 *
 * `authored` and `discovered` are separate because they genuinely are: a 2021
 * story found in 2026 belongs at 2021 in the trace and is still news.
 */
export type FacetPath = "fast" | "deep" | "wandering";
export type FacetKind = "work" | "writing" | "corpus" | "lab" | "record";

export interface Facet {
  id: string;
  label: string;
  href: string;
  /** ISO date the thing was made. */
  authored: string;
  /** ISO date it became expressible here. Equal to `authored` when nothing was recovered. */
  discovered: string;
  paths: FacetPath[];
  kind: FacetKind;
}

export const facets: Facet[] = [
  { id: "work", label: "Case studies", href: "/#work", authored: "2021-08-01",
    discovered: "2021-08-01", paths: ["fast", "deep"], kind: "work" },
  { id: "experience", label: "Experience", href: "/#experience", authored: "2021-08-01",
    discovered: "2021-08-01", paths: ["fast"], kind: "record" },
  { id: "loopdown", label: "Notes From The Loop", href: "/loopdown", authored: "2026-08-13",
    discovered: "2026-08-13", paths: ["deep"], kind: "writing" },
  { id: "excelsior", label: "Excelsior", href: "/excelsior", authored: "2021-06-15",
    discovered: "2026-07-10", paths: ["deep", "wandering"], kind: "writing" },
  { id: "board", label: "EB Profiles", href: "/ink#board", authored: "2019-05-09",
    discovered: "2026-07-10", paths: ["deep"], kind: "record" },
  { id: "chess", label: "Chess corpus", href: "/chess", authored: "2026-07-30",
    discovered: "2026-07-30", paths: ["wandering"], kind: "corpus" },
  { id: "lab", label: "Labs", href: "/lab", authored: "2026-07-24",
    discovered: "2026-07-24", paths: ["wandering"], kind: "lab" },
];
