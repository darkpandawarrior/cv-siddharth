// LANE V5 (wave 7, lane 5, step A): parses the NOAA NHC MapServer's
// forecast-cone GeoJSON (see feedUrls.ts's NHC_CONE_LAYER_IDS -- 15
// sub-layers, AT1-5/EP1-5/CP1-5) and matches a cone to its GDACS
// tropical-cyclone point. Pure: no three, no React (same convention as
// hazardAlerts.ts, this lane's own model for "one feed, one parse module").
import type { LatLon } from "../geoMath.ts";
import type { GdacsAlert } from "./hazardAlerts.ts";

export const NHC_POLL_MS = 30 * 60_000; // brief: "refresh every 30 minutes"

/** Keep adjacent longitudes continuous for planar triangulation across 180 degrees. */
export function unwrapConeRing(ring: readonly LatLon[]): LatLon[] {
  let previous = ring[0]?.lon ?? 0;
  return ring.map((point) => {
    const lon = previous + ((point.lon - previous + 180) % 360 + 360) % 360 - 180;
    previous = lon;
    return { lat: point.lat, lon };
  });
}

export interface ConePolygon {
  id: string;
  stormName: string;
  basin: string;
  /** Outer ring first, any holes after -- GeoJSON's own ring order. Each
   *  point keeps GeoJSON's [lon, lat] order translated straight into
   *  `{ lat, lon }`, never swapped (a swap would silently mirror every
   *  cone across the equator/prime-meridian, which is exactly what the
   *  acceptance test for this file checks). */
  rings: LatLon[][];
}

interface RawGeometry {
  type?: string;
  coordinates?: unknown;
}
interface RawFeature {
  id?: number | string;
  geometry?: RawGeometry;
  properties?: { stormname?: string; basin?: string };
}
interface RawFeed {
  features?: RawFeature[];
}

function ringFromCoords(coords: unknown): LatLon[] | null {
  if (!Array.isArray(coords)) return null;
  const ring: LatLon[] = [];
  for (const pt of coords) {
    if (!Array.isArray(pt) || pt.length < 2 || typeof pt[0] !== "number" || typeof pt[1] !== "number") return null;
    ring.push({ lon: pt[0], lat: pt[1] }); // GeoJSON order is [lon, lat] -- kept, not swapped.
  }
  return ring.length >= 3 ? ring : null;
}

/** `null` means the feed itself is malformed (not shaped like a
 *  FeatureCollection at all); `[]` means a well-formed feed with zero
 *  active storms in this layer. The layer must tell those two apart --
 *  "failed" health for the former, "No active NHC storms" for the latter. */
export function parseNhcCones(json: unknown): ConePolygon[] | null {
  const feed = json as Partial<RawFeed> | null;
  if (!feed || typeof feed !== "object" || !Array.isArray(feed.features)) return null;

  const out: ConePolygon[] = [];
  for (const f of feed.features) {
    const geom = f.geometry;
    if (!geom || !Array.isArray(geom.coordinates)) continue;
    const rings: LatLon[][] = [];
    if (geom.type === "Polygon") {
      for (const raw of geom.coordinates as unknown[]) {
        const ring = ringFromCoords(raw);
        if (ring) rings.push(ring);
      }
    } else if (geom.type === "MultiPolygon") {
      for (const poly of geom.coordinates as unknown[]) {
        if (!Array.isArray(poly)) continue;
        for (const raw of poly) {
          const ring = ringFromCoords(raw);
          if (ring) rings.push(ring);
        }
      }
    }
    if (rings.length === 0) continue;
    out.push({
      id: String(f.id ?? out.length),
      stormName: f.properties?.stormname ?? "Unnamed storm",
      basin: f.properties?.basin ?? "",
      rings,
    });
  }
  return out;
}

// ponytail: a flat lat/lon degree distance, same heuristic hazardAlerts.ts
// uses for its own MATCH_THRESHOLD_DEG -- a cone spans a whole basin (a
// forecast track can run thousands of km), so this is a generous "same
// storm, two feeds" heuristic, not a navigation calculation. Widen further,
// or switch to a real polygon-contains-point test, if a future season ever
// puts two active cones within this radius of each other.
const MATCH_THRESHOLD_DEG = 8;

function centroid(ring: LatLon[]): LatLon {
  let lat = 0;
  let lon = 0;
  for (const p of ring) {
    lat += p.lat;
    lon += p.lon;
  }
  return { lat: lat / ring.length, lon: lon / ring.length };
}

/** "matched to GDACS tropical-cyclone points by name or distance" -- name
 *  match first (NHC and GDACS both carry the storm's public name), the
 *  cone's centroid-to-point distance as a fallback for when GDACS hasn't
 *  picked up the name yet. Only GDACS's own TC event type is a candidate:
 *  a WF/FL/VO alert can never be the same event as a hurricane cone. */
export function matchConeToGdacs(cone: ConePolygon, alerts: GdacsAlert[]): GdacsAlert | null {
  const tc = alerts.filter((a) => a.eventType === "TC");
  const byName = tc.find((a) => a.name.toLowerCase().includes(cone.stormName.toLowerCase()));
  if (byName) return byName;

  const c = centroid(cone.rings[0]);
  let best: GdacsAlert | null = null;
  let bestDist = MATCH_THRESHOLD_DEG;
  for (const a of tc) {
    const d = Math.hypot(a.lat - c.lat, a.lon - c.lon);
    if (d <= bestDist) {
      best = a;
      bestDist = d;
    }
  }
  return best;
}
