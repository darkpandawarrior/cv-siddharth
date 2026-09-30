// City-level gazetteer for the "My Maps places" layer (LANE T1, Google Maps
// Local Guide contributions). Every coordinate below is a PUBLIC city
// centroid at two-decimal precision, on purpose: city precision, never the
// raw coordinate a Takeout export carries. scripts/gen-maps-places.mjs
// imports this same list so the generator and its tests can never disagree
// on where a point snaps to.
export interface GazetteerCity {
  slug: string;
  city: string;
  country: string;
  lat: number;
  lon: number;
}

// Reuses the audited Pune literal (src/data/globeGeo.ts) rather than
// restating it — same city, same source, two decimals either way.
import { GEOCODE } from "./globeGeo.ts";

export const MAPS_SNAP_RADIUS_KM = 45;

export const mapsGazetteer: readonly GazetteerCity[] = [
  { slug: "pune", city: "Pune", country: "IN", lat: GEOCODE["Pune, India"].lat, lon: GEOCODE["Pune, India"].lon },
  { slug: "bhopal", city: "Bhopal", country: "IN", lat: 23.25, lon: 77.41 },
  { slug: "kuwait-city", city: "Kuwait City", country: "KW", lat: 29.37, lon: 47.98 },
  { slug: "new-delhi", city: "New Delhi", country: "IN", lat: 28.61, lon: 77.21 },
  { slug: "mumbai", city: "Mumbai", country: "IN", lat: 19.08, lon: 72.88 },
  { slug: "chandigarh", city: "Chandigarh", country: "IN", lat: 30.73, lon: 76.78 },
  { slug: "bengaluru", city: "Bengaluru", country: "IN", lat: 12.97, lon: 77.59 },
  { slug: "hubballi", city: "Hubballi", country: "IN", lat: 15.36, lon: 75.12 },
  { slug: "chitradurga", city: "Chitradurga", country: "IN", lat: 14.23, lon: 76.40 },
  { slug: "kochi", city: "Kochi", country: "IN", lat: 9.93, lon: 76.27 },
  { slug: "kottayam", city: "Kottayam", country: "IN", lat: 9.59, lon: 76.52 },
  { slug: "alappuzha", city: "Alappuzha", country: "IN", lat: 9.50, lon: 76.34 },
  { slug: "muvattupuzha", city: "Muvattupuzha", country: "IN", lat: 9.98, lon: 76.58 },
  { slug: "kasol", city: "Kasol", country: "IN", lat: 32.01, lon: 77.31 },
  { slug: "sanchi", city: "Sanchi", country: "IN", lat: 23.48, lon: 77.74 },
  { slug: "dahanu", city: "Dahanu", country: "IN", lat: 19.97, lon: 72.73 },
  { slug: "murud", city: "Murud", country: "IN", lat: 18.32, lon: 72.96 },
  { slug: "kashid", city: "Kashid", country: "IN", lat: 18.44, lon: 72.91 },
  { slug: "khalapur", city: "Khalapur", country: "IN", lat: 18.83, lon: 73.28 },
  { slug: "akluj", city: "Akluj", country: "IN", lat: 17.88, lon: 75.02 },
];

/** Haversine distance in km — the one function both the generator and
 *  mapsPlaces.test.ts use to prove every point actually snapped within
 *  MAPS_SNAP_RADIUS_KM. */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Nearest gazetteer city to (lat, lon), or undefined when every city is
 *  farther than MAPS_SNAP_RADIUS_KM. (0, 0) and no-geometry points are the
 *  caller's job to filter out before calling this — a real (0, 0) point is
 *  thousands of km from every city here and would just fail the radius. */
export function nearestGazetteerCity(lat: number, lon: number): GazetteerCity | undefined {
  let best: GazetteerCity | undefined;
  let bestKm = Infinity;
  for (const c of mapsGazetteer) {
    const km = haversineKm(lat, lon, c.lat, c.lon);
    if (km < bestKm) {
      bestKm = km;
      best = c;
    }
  }
  return best && bestKm <= MAPS_SNAP_RADIUS_KM ? best : undefined;
}
