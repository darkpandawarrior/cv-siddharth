// LANE W12. Resolves a `flyToPlace` action's free-text `query` ("tokyo",
// "the uk", "new york city") to a lat/lon. Brief: "resolved by a pluggable
// resolver the explore lane provides later: define the interface, default
// to a small built-in gazetteer of ~200 world cities/countries."
//
// The country half is centroids.ts (already committed, Natural Earth
// LABEL_X/LABEL_Y points, public domain — see that file's own header). The
// city half below is hand-compiled from public knowledge (well-known city
// centres, WGS84, ~0.1 degree precision) — not scraped from any licensed
// dataset, so the house "no CC-BY-NC data" rule doesn't apply; it is exactly
// the kind of plain geographic fact centroids.ts's own header describes.
import { centroids } from "../centroids.ts";

export interface ResolvedPlace {
  lat: number;
  lon: number;
  name: string;
}

/** The seam a later lane (W11 "explore", per the plan's Photon place search)
 *  swaps in — same shape, real geocoding instead of a fixed table. */
export interface PlaceResolver {
  resolve(query: string): ResolvedPlace | null;
}

interface CityRow {
  name: string;
  lat: number;
  lon: number;
  /** Extra strings that should also match this row ("nyc" -> New York). */
  aliases?: string[];
}

// ponytail: ~95 cities, hand-picked for "a visitor is likely to type this" —
// major capitals, tech hubs and the largest metro areas per continent. Not
// an exhaustive gazetteer (that's W11's real geocoder); extend this table
// (or wait for setPlaceResolver to replace it) if a specific city a demo
// needs is missing.
const CITIES: readonly CityRow[] = [
  { name: "Tokyo", lat: 35.6762, lon: 139.6503 },
  { name: "Osaka", lat: 34.6937, lon: 135.5023 },
  { name: "Seoul", lat: 37.5665, lon: 126.978 },
  { name: "Beijing", lat: 39.9042, lon: 116.4074 },
  { name: "Shanghai", lat: 31.2304, lon: 121.4737 },
  { name: "Hong Kong", lat: 22.3193, lon: 114.1694 },
  { name: "Taipei", lat: 25.033, lon: 121.5654 },
  { name: "Singapore", lat: 1.3521, lon: 103.8198 },
  { name: "Kuala Lumpur", lat: 3.139, lon: 101.6869 },
  { name: "Bangkok", lat: 13.7563, lon: 100.5018 },
  { name: "Jakarta", lat: -6.2088, lon: 106.8456 },
  { name: "Manila", lat: 14.5995, lon: 120.9842 },
  { name: "Hanoi", lat: 21.0278, lon: 105.8342 },
  { name: "Ho Chi Minh City", lat: 10.8231, lon: 106.6297, aliases: ["saigon"] },
  { name: "Mumbai", lat: 19.076, lon: 72.8777, aliases: ["bombay"] },
  { name: "Delhi", lat: 28.7041, lon: 77.1025, aliases: ["new delhi"] },
  { name: "Bangalore", lat: 12.9716, lon: 77.5946, aliases: ["bengaluru"] },
  { name: "Pune", lat: 18.5204, lon: 73.8567 },
  { name: "Chennai", lat: 13.0827, lon: 80.2707, aliases: ["madras"] },
  { name: "Kolkata", lat: 22.5726, lon: 88.3639, aliases: ["calcutta"] },
  { name: "Hyderabad", lat: 17.385, lon: 78.4867 },
  { name: "Ahmedabad", lat: 23.0225, lon: 72.5714 },
  { name: "Jaipur", lat: 26.9124, lon: 75.7873 },
  { name: "Lucknow", lat: 26.8467, lon: 80.9462 },
  { name: "Karachi", lat: 24.8607, lon: 67.0011 },
  { name: "Lahore", lat: 31.5497, lon: 74.3436 },
  { name: "Islamabad", lat: 33.6844, lon: 73.0479 },
  { name: "Dhaka", lat: 23.8103, lon: 90.4125 },
  { name: "Colombo", lat: 6.9271, lon: 79.8612 },
  { name: "Kathmandu", lat: 27.7172, lon: 85.324 },
  { name: "Dubai", lat: 25.2048, lon: 55.2708 },
  { name: "Abu Dhabi", lat: 24.4539, lon: 54.3773 },
  { name: "Riyadh", lat: 24.7136, lon: 46.6753 },
  { name: "Tel Aviv", lat: 32.0853, lon: 34.7818 },
  { name: "Istanbul", lat: 41.0082, lon: 28.9784 },
  { name: "Tehran", lat: 35.6892, lon: 51.389 },
  { name: "Moscow", lat: 55.7558, lon: 37.6173 },
  { name: "Kyiv", lat: 50.4501, lon: 30.5234, aliases: ["kiev"] },
  { name: "Warsaw", lat: 52.2297, lon: 21.0122 },
  { name: "Prague", lat: 50.0755, lon: 14.4378 },
  { name: "Budapest", lat: 47.4979, lon: 19.0402 },
  { name: "Vienna", lat: 48.2082, lon: 16.3738 },
  { name: "Zurich", lat: 47.3769, lon: 8.5417 },
  { name: "Geneva", lat: 46.2044, lon: 6.1432 },
  { name: "Berlin", lat: 52.52, lon: 13.405 },
  { name: "Munich", lat: 48.1351, lon: 11.582 },
  { name: "Amsterdam", lat: 52.3676, lon: 4.9041 },
  { name: "Brussels", lat: 50.8503, lon: 4.3517 },
  { name: "Paris", lat: 48.8566, lon: 2.3522 },
  { name: "London", lat: 51.5074, lon: -0.1278 },
  { name: "Dublin", lat: 53.3498, lon: -6.2603 },
  { name: "Lisbon", lat: 38.7223, lon: -9.1393 },
  { name: "Madrid", lat: 40.4168, lon: -3.7038 },
  { name: "Barcelona", lat: 41.3851, lon: 2.1734 },
  { name: "Rome", lat: 41.9028, lon: 12.4964 },
  { name: "Milan", lat: 45.4642, lon: 9.19 },
  { name: "Athens", lat: 37.9838, lon: 23.7275 },
  { name: "Stockholm", lat: 59.3293, lon: 18.0686 },
  { name: "Oslo", lat: 59.9139, lon: 10.7522 },
  { name: "Copenhagen", lat: 55.6761, lon: 12.5683 },
  { name: "Helsinki", lat: 60.1699, lon: 24.9384 },
  { name: "Cairo", lat: 30.0444, lon: 31.2357 },
  { name: "Casablanca", lat: 33.5731, lon: -7.5898 },
  { name: "Algiers", lat: 36.7538, lon: 3.0588 },
  { name: "Tunis", lat: 36.8065, lon: 10.1815 },
  { name: "Lagos", lat: 6.5244, lon: 3.3792 },
  { name: "Accra", lat: 5.6037, lon: -0.187 },
  { name: "Nairobi", lat: -1.2921, lon: 36.8219 },
  { name: "Addis Ababa", lat: 9.03, lon: 38.74 },
  { name: "Dar es Salaam", lat: -6.7924, lon: 39.2083 },
  { name: "Kampala", lat: 0.3476, lon: 32.5825 },
  { name: "Kinshasa", lat: -4.4419, lon: 15.2663 },
  { name: "Johannesburg", lat: -26.2041, lon: 28.0473 },
  { name: "Cape Town", lat: -33.9249, lon: 18.4241 },
  { name: "New York", lat: 40.7128, lon: -74.006, aliases: ["nyc", "new york city"] },
  { name: "Los Angeles", lat: 34.0522, lon: -118.2437, aliases: ["la"] },
  { name: "San Francisco", lat: 37.7749, lon: -122.4194, aliases: ["sf", "bay area"] },
  { name: "Seattle", lat: 47.6062, lon: -122.3321 },
  { name: "Chicago", lat: 41.8781, lon: -87.6298 },
  { name: "Boston", lat: 42.3601, lon: -71.0589 },
  { name: "Washington", lat: 38.9072, lon: -77.0369, aliases: ["washington dc", "dc"] },
  { name: "Miami", lat: 25.7617, lon: -80.1918 },
  { name: "Houston", lat: 29.7604, lon: -95.3698 },
  { name: "Dallas", lat: 32.7767, lon: -96.797 },
  { name: "Atlanta", lat: 33.749, lon: -84.388 },
  { name: "Denver", lat: 39.7392, lon: -104.9903 },
  { name: "Las Vegas", lat: 36.1699, lon: -115.1398 },
  { name: "Phoenix", lat: 33.4484, lon: -112.074 },
  { name: "Toronto", lat: 43.6532, lon: -79.3832 },
  { name: "Vancouver", lat: 49.2827, lon: -123.1207 },
  { name: "Montreal", lat: 45.5019, lon: -73.5674 },
  { name: "Mexico City", lat: 19.4326, lon: -99.1332 },
  { name: "Sao Paulo", lat: -23.5505, lon: -46.6333 },
  { name: "Rio de Janeiro", lat: -22.9068, lon: -43.1729, aliases: ["rio"] },
  { name: "Buenos Aires", lat: -34.6037, lon: -58.3816 },
  { name: "Santiago", lat: -33.4489, lon: -70.6693 },
  { name: "Lima", lat: -12.0464, lon: -77.0428 },
  { name: "Bogota", lat: 4.711, lon: -74.0721 },
  { name: "Caracas", lat: 10.4806, lon: -66.9036 },
  { name: "Sydney", lat: -33.8688, lon: 151.2093 },
  { name: "Melbourne", lat: -37.8136, lon: 144.9631 },
  { name: "Perth", lat: -31.9505, lon: 115.8605 },
  { name: "Auckland", lat: -36.8485, lon: 174.7633 },
  { name: "Wellington", lat: -41.2865, lon: 174.7762 },
];

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/^(the|city of)\s+/, "");
}

function matchesCity(row: CityRow, needle: string): boolean {
  if (normalize(row.name) === needle) return true;
  return row.aliases?.some((a) => a === needle) ?? false;
}

const defaultGazetteerResolver: PlaceResolver = {
  resolve(query: string): ResolvedPlace | null {
    const needle = normalize(query);
    if (!needle) return null;
    // Exact city match first (a country's name can be a substring of a
    // city's, e.g. "Georgia" the country vs a US state — exact match wins
    // over the fuzzier country substring pass below).
    const exactCity = CITIES.find((c) => matchesCity(c, needle));
    if (exactCity) return { lat: exactCity.lat, lon: exactCity.lon, name: exactCity.name };

    const exactCountry = centroids.find((c) => normalize(c.name) === needle || c.iso2.toLowerCase() === needle);
    if (exactCountry) return { lat: exactCountry.lat, lon: exactCountry.lon, name: exactCountry.name };

    // Loose fallback: a city/country name containing the query, or vice
    // versa ("new york" matches "New York", "unites states" won't — this is
    // a convenience for a shortened phrase like "the uk", not a fuzzy
    // search engine).
    const looseCity = CITIES.find((c) => normalize(c.name).includes(needle) || needle.includes(normalize(c.name)));
    if (looseCity) return { lat: looseCity.lat, lon: looseCity.lon, name: looseCity.name };
    const looseCountry = centroids.find((c) => normalize(c.name).includes(needle) || needle.includes(normalize(c.name)));
    if (looseCountry) return { lat: looseCountry.lat, lon: looseCountry.lon, name: looseCountry.name };

    return null;
  },
};

let activeResolver: PlaceResolver = defaultGazetteerResolver;

/** The explore lane's hook: swap in a real geocoder without touching this
 *  file or execute.ts, which always calls through `resolvePlace`. */
export function setPlaceResolver(resolver: PlaceResolver): void {
  activeResolver = resolver;
}
export function resetPlaceResolver(): void {
  activeResolver = defaultGazetteerResolver;
}
export function resolvePlace(query: string): ResolvedPlace | null {
  return activeResolver.resolve(query);
}
