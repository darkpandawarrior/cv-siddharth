import type { Facet, FacetPath } from "../data/facets";

export function facetsForPath(all: Facet[], path: FacetPath): Facet[] {
  return all.filter((f) => f.paths.includes(path));
}

/** Ordered by when the thing was MADE, which is not when it turned up. */
export function byChronology(all: Facet[]): Facet[] {
  return [...all].sort((a, b) => a.authored.localeCompare(b.authored));
}

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

export function isRecovered(facet: Facet, minGapYears: number): boolean {
  const gap = Date.parse(facet.discovered) - Date.parse(facet.authored);
  return gap >= minGapYears * MS_PER_YEAR;
}

/** His own form, from the 2020 draft: `A :: B` when the two eras overlap. */
export function dualStamp(facet: Facet): string {
  return facet.authored === facet.discovered
    ? facet.authored
    : `${facet.authored} :: ${facet.discovered}`;
}
