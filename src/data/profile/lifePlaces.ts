// Hand-written, not generated: the owner's own account of where he has
// lived, given 2026-09-29, cross-checked against the education and
// experience periods already committed in this repo (core.ts, experience.ts).
// Coordinates are never new numbers here — every lat/lon is looked up from
// mapsGazetteer.ts by slug, so this file cannot silently drift from the
// gazetteer both the globe layer and the Maps places generator share.
import { mapsGazetteer } from "../mapsGazetteer.ts";

export interface LifePlace {
  slug: string;
  city: string;
  country: string;
  from?: number;
  to?: number;
  line: string;
}

export const lifePlaces: readonly LifePlace[] = [
  { slug: "kuwait-city", city: "Kuwait City", country: "Kuwait", to: 2017, line: "Grew up in Kuwait and finished school here, an NRI until 2017." },
  { slug: "bhopal", city: "Bhopal", country: "India", from: 2017, to: 2021, line: "College at NIT Bhopal, 2017 to 2021." },
  { slug: "mumbai", city: "Mumbai", country: "India", line: "My family's home after Kuwait." },
  { slug: "chandigarh", city: "Chandigarh", country: "India", from: 2021, to: 2023, line: "My first job brought me here." },
  { slug: "pune", city: "Pune", country: "India", from: 2023, line: "Moved to Pune in 2023." },
];

/** The gazetteer centroid for a life place's city — never a new coordinate. */
export function lifePlaceGeo(slug: string): { lat: number; lon: number } | undefined {
  const city = mapsGazetteer.find((c) => c.slug === slug);
  return city ? { lat: city.lat, lon: city.lon } : undefined;
}
