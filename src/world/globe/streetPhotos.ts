// WAVE 2 LANE W3 (street level). Pure Panoramax parsing, bbox math and the
// MapLibre source/layer ids the street map's photo-marker layer draws from —
// no maplibre, no three, no DOM, no React. Same "render layer wraps pure
// math" split as quake.ts/eonet.ts (layers/) elsewhere in this house.
//
// Panoramax (https://panoramax.fr, keyless, CC-BY-SA imagery): verified by
// curl against the real API (2026-09-27):
//   GET https://api.panoramax.xyz/api/search?bbox=<minLon,minLat,maxLon,maxLat>&limit=N
// returns 200 with CORS echoing the request Origin (not "*"), a bare
// `{ features: [...], links: [...] }` (no top-level "type": "FeatureCollection"
// literal in the response body, unlike a strict GeoJSON FeatureCollection).
// Pune (18.5195, 73.8412) has real photos from a November 2022 GoPro Max 360
// capture. Image assets (`assets.hd/sd/thumb.href`) are served from
// panoramax.openstreetmap.fr with CORS "*", a different host than the search
// API — both need their own CSP entries (see csp.ts).

/** The one style this lane's street map ever loads — verified 200, CORS "*",
 *  and already ships a `building-3d` fill-extrusion layer (source-layer
 *  "building", `render_min_height`/`render_height` properties, minzoom 14)
 *  — no custom extrusion layer needed, the style already draws it. */
export const LIBERTY_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

export const PANORAMAX_SEARCH_ENDPOINT = "https://api.panoramax.xyz/api/search";

// ponytail: a flat cap, not an adaptive density budget — Panoramax bboxes at
// street zoom are small enough (a few hundred metres) that a real query
// rarely nears this; raise it if a dense city ever does.
export const PANORAMAX_QUERY_LIMIT = 200;

// House rule: cap counts per tier. T3 (throttled) asks for far fewer photos
// per query than T1 (desktop) — same shape as quake.ts's TIER_MIN_MAG.
export const TIER_PHOTO_LIMIT: Record<1 | 2 | 3, number> = { 1: PANORAMAX_QUERY_LIMIT, 2: 120, 3: 60 };

// Re-querying on every pixel of pan would hammer the API; ~0.0005 deg is
// roughly 50 m at the equator — smaller than a street-level pan usually
// moves without being so small a debounce timer alone already covers it.
export const MIN_REQUERY_DELTA_DEG = 0.0005;

export const PHOTO_SOURCE_ID = "street-photos";
export const PHOTO_LAYER_ID = "street-photos-circle";

export interface StreetPhoto {
  id: string;
  lat: number;
  lon: number;
  thumbUrl: string;
  sdUrl: string;
  hdUrl: string;
  /** `pers:interior_orientation.field_of_view === 360` — Panoramax's own
   *  signal for an equirectangular 360 capture vs. a flat photo. */
  is360: boolean;
  /** `properties.datetime`, ISO 8601 — "" when the feed omits it (never
   *  invented; formatCaptureDate returns null for an empty/bad string). */
  capturedAt: string;
  author: string;
  licence: string;
  licenceUrl: string | null;
}

export interface LngLatBoundsLike {
  west: number;
  south: number;
  east: number;
  north: number;
}

interface RawSearchResponse {
  features?: unknown[];
}

/** The Panoramax STAC-ish item shape this parser reads — restated narrowly
 *  from the real response, not the full spec (this app never needs the
 *  rest). */
interface RawFeature {
  id?: unknown;
  geometry?: { coordinates?: unknown } | null;
  assets?: {
    hd?: { href?: unknown };
    sd?: { href?: unknown };
    thumb?: { href?: unknown };
  };
  providers?: { name?: unknown; roles?: unknown }[];
  links?: { rel?: unknown; href?: unknown }[];
  properties?: {
    datetime?: unknown;
    license?: unknown;
    "geovisio:producer"?: unknown;
    "pers:interior_orientation"?: { field_of_view?: unknown };
  };
}

/** `null` on anything that doesn't look like the real search response — a
 *  fetch/shape failure shows "no photos" rather than garbage markers (the
 *  house "absent, not faked" rule every other live parser here follows).
 *  Individual malformed features are skipped rather than failing the whole
 *  batch: one bad item in a page of 50 shouldn't hide the other 49. */
export function parsePanoramaxFeatures(json: unknown): StreetPhoto[] | null {
  const doc = json as RawSearchResponse | null;
  if (!doc || typeof doc !== "object" || !Array.isArray(doc.features)) return null;

  const photos: StreetPhoto[] = [];
  for (const raw of doc.features) {
    const f = raw as RawFeature;
    const coords = f.geometry?.coordinates;
    const id = f.id;
    const thumbHref = f.assets?.thumb?.href;
    if (!Array.isArray(coords) || coords.length < 2 || typeof id !== "string" || typeof thumbHref !== "string") continue;
    const [lon, lat] = coords;
    if (typeof lon !== "number" || typeof lat !== "number") continue;

    const sdHref = f.assets?.sd?.href;
    const hdHref = f.assets?.hd?.href;
    const sdUrl = typeof sdHref === "string" ? sdHref : thumbHref;
    const hdUrl = typeof hdHref === "string" ? hdHref : sdUrl;

    const producer = f.providers?.find((p) => Array.isArray(p.roles) && p.roles.includes("producer"))?.name;
    const author =
      typeof producer === "string"
        ? producer
        : typeof f.properties?.["geovisio:producer"] === "string"
          ? (f.properties["geovisio:producer"] as string)
          : "unknown contributor";

    const licenceLink = f.links?.find((l) => l.rel === "license")?.href;
    const fov = f.properties?.["pers:interior_orientation"]?.field_of_view;

    photos.push({
      id,
      lon,
      lat,
      thumbUrl: thumbHref,
      sdUrl,
      hdUrl,
      is360: fov === 360,
      capturedAt: typeof f.properties?.datetime === "string" ? f.properties.datetime : "",
      author,
      licence: typeof f.properties?.license === "string" ? f.properties.license : "unknown licence",
      licenceUrl: typeof licenceLink === "string" ? licenceLink : null,
    });
  }
  return photos;
}

/** Panoramax's `bbox` query param shape: "minLon,minLat,maxLon,maxLat". */
export function boundsToBboxParam(b: LngLatBoundsLike): string {
  return [b.west, b.south, b.east, b.north].map((n) => n.toFixed(6)).join(",");
}

/** The full search URL for a visible bbox, capped at PANORAMAX_QUERY_LIMIT. */
export function panoramaxSearchUrl(b: LngLatBoundsLike, limit: number = PANORAMAX_QUERY_LIMIT): string {
  const params = new URLSearchParams({ bbox: boundsToBboxParam(b), limit: String(limit) });
  return `${PANORAMAX_SEARCH_ENDPOINT}?${params.toString()}`;
}

/** Whether the map has moved far enough since the last query to bother
 *  re-querying — `null` prev (no query yet) always requeries. Guards a
 *  debounced `moveend` handler from re-fetching on a one-pixel nudge. */
export function shouldRequery(prev: LngLatBoundsLike | null, next: LngLatBoundsLike, minDeltaDeg: number = MIN_REQUERY_DELTA_DEG): boolean {
  if (!prev) return true;
  return (
    Math.abs(next.west - prev.west) > minDeltaDeg ||
    Math.abs(next.east - prev.east) > minDeltaDeg ||
    Math.abs(next.south - prev.south) > minDeltaDeg ||
    Math.abs(next.north - prev.north) > minDeltaDeg
  );
}

/** The MapLibre GeoJSON source data for the photo-point circle layer. `id`
 *  travels in `properties` (not just the Feature's own top-level id) because
 *  `queryRenderedFeatures` hands the click handler `properties`, and a plain
 *  string id is simpler to read back than relying on GL's numeric feature id. */
export function photosToGeoJSON(photos: StreetPhoto[]): GeoJSON.FeatureCollection<GeoJSON.Point, { id: string }> {
  return {
    type: "FeatureCollection",
    features: photos.map((p) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [p.lon, p.lat] },
      properties: { id: p.id },
    })),
  };
}

/** "9 Nov 2022" from a Panoramax `datetime` ISO string. `null` on an empty or
 *  unparseable string — never invents a date the feed didn't send. UTC, not
 *  local time: a capture date is a calendar fact, not a moment to localize. */
export function formatCaptureDate(iso: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}
