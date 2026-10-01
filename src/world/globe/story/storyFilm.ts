// LANE C3 ("Life journey film"): the five dated life chapters storyModel.ts's own
// buildStory() already derives from src/data/profile/lifePlaces.ts, replayed
// in the owner's own fixed order (lifePlaces.ts's own listing) rather than
// buildStory()'s full chronological reach across every role/OSS/store claim.
// A FilmChapter IS a StoryChapter (never a parallel type) so this reuses
// story/storyPlayer.ts's existing, already-tested timing engine unchanged --
// one synthetic StoryEvent per chapter, same shape checkSources() in
// storyModel.test.ts already validates against every other chapter kind.
import { GLOBE_RADIUS } from "../geoMath.ts";
import { lifePlaces } from "../../../data/profile/lifePlaces.ts";
import { mapsPlaces, mapsPhotos } from "../../../data/generated/mapsPlaces.ts";
import type { MapsPhoto } from "../../../data/generated/mapsPlaces.ts";
import { storyArc, storyPlace } from "./storyGeo.ts";
import type { StoryChapter } from "./storyModel.ts";

export interface FilmChapter extends StoryChapter {
  /** e.g. "9 reviews, 37 photos on Google Maps, 2017 to 2018" -- straight
   *  from mapsPlaces.ts's own totals for this city, never a new count. */
  mapsLine?: string;
  photos: readonly MapsPhoto[];
}

// The owner's own account, in the order lifePlaces.ts already lists a lived
// stay: Kuwait, then college in Bhopal, then the first job in Chandigarh,
// then Pune, with the family's July 2019 Mumbai move inserted by date.
// Mumbai does not change the origin of the owner's Bhopal-to-Chandigarh move.
const FILM_SLUGS = ["kuwait-city", "bhopal", "mumbai", "chandigarh", "pune"] as const;
const PLACE_NAME: Record<(typeof FILM_SLUGS)[number], string> = {
  "kuwait-city": "Kuwait City, Kuwait",
  bhopal: "Bhopal, India",
  chandigarh: "Chandigarh, India",
  mumbai: "Mumbai, India",
  pune: "Pune, India",
};

/** A photo illustrates a chapter only when its own slug names that exact
 * city (never another -- mapsPhotos.ts already tags every photo to one
 * city, this is belt and braces) and its year falls within the lived years,
 * one year of slack either side for a visit close to the actual move date.
 * A decade-later trip back must never stand in for "the college years". */
function honestPhotos(slug: string, fromDate: number | string | undefined, toDate: number | string | undefined): MapsPhoto[] {
  const from = fromDate === undefined ? undefined : Number(String(fromDate).slice(0, 4));
  const to = toDate === undefined ? undefined : Number(String(toDate).slice(0, 4));
  if (from === undefined && to === undefined) return [];
  const lo = Math.min(from ?? Infinity, to ?? Infinity) - 1;
  const hi = Math.max(from ?? -Infinity, to ?? -Infinity) + 1;
  return mapsPhotos.filter((p) => p.slug === slug && p.year >= lo && p.year <= hi).sort((a, b) => b.views - a.views);
}

/** The five-chapter short film: city, then arc in from the previous city
 * (storyArc()'s own guard -- unknown endpoint or same-city hop draws
 * nothing), then this city's own Maps contribution line and honest photos.
 * No new coordinate, count or caption is invented anywhere in this file. */
export function buildStoryFilm(): FilmChapter[] {
  const chapters: FilmChapter[] = [];
  let prevPlace: ReturnType<typeof storyPlace>;
  for (const slug of FILM_SLUGS) {
    const lp = lifePlaces.find((p) => p.slug === slug);
    const place = storyPlace(PLACE_NAME[slug]);
    const raw = lp?.from ?? lp?.to;
    if (!lp || !place || raw === undefined) continue; // no dated account, no chapter -- never a guessed one
    const mapsPlace = mapsPlaces.find((m) => m.slug === slug);
    const years = mapsPlace?.years ?? [];
    const lo = years.length ? Math.min(...years) : undefined;
    const hi = years.length ? Math.max(...years) : undefined;
    const mapsLine = mapsPlace ? `${mapsPlace.reviews} reviews, ${mapsPlace.photos} photos on Google Maps, ${lo}${hi !== lo ? ` to ${hi}` : ""}` : undefined;
    const arc = storyArc(slug === "mumbai" ? storyPlace("Kuwait City, Kuwait") : prevPlace, place);
    chapters.push({
      id: `film:${slug}`,
      title: `${lp.city}, ${lp.country}`,
      events: [
        {
          id: `film:${slug}`,
          date: String(raw),
          precision: String(raw).length === 7 ? "month" : "year",
          dateNote: `${lp.dateNote ?? "Owner's account; year only"}; ${String(raw).length === 7 ? "month" : "year"} precision`,
          title: `${lp.city}, ${lp.country}`,
          detail: lp.line,
          source: "src/data/profile/lifePlaces.ts",
          place,
        },
      ],
      camera: { focus: place, anchor: place, distance: GLOBE_RADIUS * 3, emphasise: ["markers"] },
      arcs: arc ? [{ ...arc, ...(slug === "mumbai" ? { familyMove: true } : {}) }] : [],
      mapsLine,
      photos: honestPhotos(slug, lp.from, lp.to),
    });
    if (slug !== "mumbai") prevPlace = place;
  }
  return chapters;
}
