import { GEOCODE } from "../../../data/globeGeo.ts";

export interface StoryPlace { readonly name: string; readonly lat: number; readonly lon: number }

/** Reuse the audited city literal, never an employer's headquarters or an app's
 * market. City precision only: a point marks the city, never a campus or an
 * address. */
export const STORY_GEO = Object.freeze({
  // Source: src/data/globeGeo.ts:21, backed by the role locations in
  // src/data/profile/experience.ts:62,254. No new coordinate claim is made.
  "Pune, India": Object.freeze({ name: "Pune, India", ...GEOCODE["Pune, India"] }),
  // The city is named by the data itself: src/data/profile/core.ts:46,
  // school "NIT Bhopal (MANIT)". Coordinates are Bhopal's city centre
  // (23 deg 15' N, 77 deg 25' E, per Wikipedia and GeoNames id 1275841),
  // rounded to two decimals on purpose: city precision, not the campus.
  "Bhopal, India": Object.freeze({ name: "Bhopal, India", lat: 23.25, lon: 77.41 }),
  // LANE T1 (life places): three more cities the owner's own account names
  // (src/data/profile/lifePlaces.ts), city precision, same gazetteer as the
  // Maps places layer (src/data/mapsGazetteer.ts) — no new coordinate claim.
  "Kuwait City, Kuwait": Object.freeze({ name: "Kuwait City, Kuwait", lat: 29.37, lon: 47.98 }),
  "Mumbai, India": Object.freeze({ name: "Mumbai, India", lat: 19.08, lon: 72.88 }),
  "Chandigarh, India": Object.freeze({ name: "Chandigarh, India", lat: 30.73, lon: 76.78 }),
});

/** Exact membership also checks coordinates: a familiar city name attached to
 * invented coordinates must not silently become a known story location. */
export function isStoryPlace(place: StoryPlace): boolean {
  return Object.values(STORY_GEO).some((p) => p.name === place.name && p.lat === place.lat && p.lon === place.lon);
}

export function storyPlace(name: string): StoryPlace | undefined {
  return Object.values(STORY_GEO).find((p) => p.name === name);
}

export interface StoryArc { from: StoryPlace; to: StoryPlace; familyMove?: boolean }

/** Unknown endpoints produce no arc. The visual cue must never imply a journey
 * to a remote employer, an app audience, or a guessed university coordinate. */
export function storyArc(from?: StoryPlace, to?: StoryPlace): StoryArc | undefined {
  if (!from || !to || !isStoryPlace(from) || !isStoryPlace(to) || from.name === to.name) return undefined;
  return { from, to };
}
