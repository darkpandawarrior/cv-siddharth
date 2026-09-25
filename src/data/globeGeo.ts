// Employer geocoding for GLOBE's origin markers (living-ledger-spec.md#6.3):
// city precision only, a fixed literal -- there are only two distinct
// resolvable employer cities to place, so this stays hand-written instead of
// generated (contrast centroids.ts, ~250 rows, which scripts/gen-globe-geo.mjs
// does generate from Natural Earth). Every experience.ts location string not
// in GEOCODE is listed in employersUnresolved rather than guessed at -- no
// arc is ever drawn to a location this table does not actually know (M37).
import { experience } from "./profile/experience.ts";

export interface GeoPoint {
  lat: number;
  lon: number;
}

/** City-precision coordinates for every resolvable experience.ts location
 *  string. "Pune, India" covers both Dice.tech and John Deere India -- both
 *  employer markers land on the same ring over the city. */
export const GEOCODE: Record<string, GeoPoint> = {
  "Pune, India": { lat: 18.5204, lon: 73.8567 },
};

/** experience.ts location strings with no entry in GEOCODE, in first-seen
 *  order, deduped: "Remote, India" and "Contract, India" (both real, neither
 *  a single city). Listed, never guessed (living-ledger-spec.md#6.3). */
export const employersUnresolved: string[] = [...new Set(experience.map((e) => e.location))].filter(
  (loc) => !(loc in GEOCODE),
);

export interface EmployerMarker {
  company: string;
  role: string;
  location: string;
  lat: number;
  lon: number;
}

/** Resolved employer markers only -- the ring GLOBE draws over Pune. The
 *  unresolved rows surface through employersUnresolved instead. */
export const employerMarkers: EmployerMarker[] = experience
  .filter((e) => e.location in GEOCODE)
  .map((e) => ({ company: e.company, role: e.role, location: e.location, ...GEOCODE[e.location] }));
