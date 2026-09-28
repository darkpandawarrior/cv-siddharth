// LANE W15 (together: anonymous live viewports of other explorers) --
// pure logic only. No @playhtml/react, no three, no DOM: same discipline
// geoMath.ts and cameraMath.ts already hold, so vitest's `environment:
// "node"` (no DOM) exercises every rule here directly. togetherPresence.ts
// and TogetherLayer.tsx (which DO import @playhtml/react -- fatal at
// module load under vitest, per the mock file's own comment at
// src/test/mocks/playhtml-react.ts) stay untested by vitest on purpose;
// Playwright (e2e/globe-W15.spec.ts) covers the render path via the
// `__GLOBE_TOGETHER_TEST__` seam.
//
// Privacy is the product (this lane's brief): what ever crosses the wire
// is a quantized view-centre direction, a coarse zoom bucket and a view
// mode -- never a location, never an identity, and never the presence-geo
// country presenceGeo.ts's `geo-v1` channel already carries (deliberately
// a separate channel, so a peer can never join a view direction to a
// country the way GLOBE's own privacy note for that channel forbids).

import { latLonToXyz, xyzToLatLon, type LatLon } from "./geoMath.ts";
import { centroids, type CountryCentroid } from "./centroids.ts";
import type { GlobeView } from "./globeStore.ts";

export const TOGETHER_CHANNEL = "globe-view-v1";

/** Degrees each axis rounds to before publishing -- coarse enough that a
 *  quantized reading alone can't reconstruct a visitor's exact gaze. */
export const QUANTUM_DEG = 3;
/** At most one publish this often, and only while the tab is visible. */
export const PUBLISH_MS = 2000;
/** Reticles ever drawn. `total` (selectOthers below) is never capped --
 *  that uncapped number is what store.together.count and the "N exploring
 *  with you" line read from. */
export const MAX_RENDERED = 12;
/** How long a reticle takes to glide from its last position to a new one.
 *  Roughly the publish cadence, so a peer's glide always finishes before
 *  (or right as) the next update could arrive -- never caught mid-glide. */
export const GLIDE_MS = 1600;

export type ZoomBucket = "orbit" | "region" | "close";
/** Reuses globeStore's own view union (type-only import, erased at
 *  compile time -- no runtime coupling to globeStore.ts, so this file
 *  keeps the "no DOM, no React" guarantee above) rather than a second
 *  copy that could silently drift from it. */
export type ViewMode = GlobeView;

/** What one explorer's browser publishes on TOGETHER_CHANNEL. A `type`
 *  alias, not an `interface`: playhtml's `usePresence<T extends
 *  Record<string, unknown>>` needs T's implicit string index signature,
 *  which TypeScript only grants an object type literal -- an `interface`
 *  here fails that generic constraint (Ghosts.tsx's own GhostPresence
 *  makes the identical choice for the identical reason). */
export type ViewPresence = {
  lat: number;
  lon: number;
  zoom: ZoomBucket;
  mode: ViewMode;
};

/** A raw presence-map entry: whatever this tab or a peer published, plus
 *  playhtml's own `isMe` flag -- a peer's very first frame after joining,
 *  before its own publish has ever landed, has neither field yet (same
 *  guard Ghosts.tsx's own `ghosts` filter already applies). */
export type RawViewEntry = Partial<ViewPresence> & { isMe?: boolean };

// Camera height above the globe's surface (world units, GLOBE_RADIUS=6):
// close covers ground/follow view (~0.02-0.4 above surface) and the
// tightest orbit zoom (minDistance=9 -> surfaceDist 3); orbit covers the
// loosest framing (maxDistance=42 -> surfaceDist 36). Buckets, not a
// precise measurement -- see GlobeScene.tsx's own OrbitControls min/max.
const CLOSE_MAX_SURFACE = 4;
const REGION_MAX_SURFACE = 14;

function wrapLon(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

/** Rounds a real lat/lon to the QUANTUM_DEG grid -- the one place a raw
 *  camera direction becomes the coarse reading actually published. */
export function quantizeLatLon(lat: number, lon: number): LatLon {
  const q = (v: number) => Math.round(v / QUANTUM_DEG) * QUANTUM_DEG;
  return { lat: Math.max(-90, Math.min(90, q(lat))), lon: wrapLon(q(lon)) };
}

/** Camera height above the globe's surface -> the coarse bucket published
 *  instead of a raw distance. */
export function zoomBucket(surfaceDist: number): ZoomBucket {
  if (surfaceDist < CLOSE_MAX_SURFACE) return "close";
  if (surfaceDist < REGION_MAX_SURFACE) return "region";
  return "orbit";
}

function lonDelta(a: number, b: number): number {
  return wrapLon(b - a);
}

/** The gate TogetherLayer's own publish call runs through every frame:
 *  rate-limited to PUBLISH_MS AND only when the quantized reading moved
 *  by more than one quantum, or the bucket/mode changed outright.
 *  Publishing on every sub-quantum jitter would defeat the point of
 *  quantizing at all -- a peer could reconstruct the fine path just by
 *  watching how often "no change" gaps break. `sharing` and tab
 *  visibility are checked by the caller, not here: this function is pure
 *  geometry, no DOM. */
export function shouldPublish(last: ViewPresence | null, next: ViewPresence, elapsedMs: number): boolean {
  if (!last) return true;
  if (elapsedMs < PUBLISH_MS) return false;
  if (last.zoom !== next.zoom || last.mode !== next.mode) return true;
  return Math.abs(last.lat - next.lat) > QUANTUM_DEG || Math.abs(lonDelta(last.lon, next.lon)) > QUANTUM_DEG;
}

/** Others only (self excluded via playhtml's own `isMe`), capped at
 *  MAX_RENDERED for the draw. `total` is the full, uncapped count --
 *  store.together.count and the "N exploring with you" line read from
 *  this, never from `rendered.length`. */
export function selectOthers(entries: Iterable<readonly [string, RawViewEntry]>): { rendered: [string, ViewPresence][]; total: number } {
  const valid: [string, ViewPresence][] = [];
  for (const [key, p] of entries) {
    if (p.isMe) continue;
    if (typeof p.lat !== "number" || typeof p.lon !== "number" || !p.zoom || !p.mode) continue;
    valid.push([key, { lat: p.lat, lon: p.lon, zoom: p.zoom, mode: p.mode }]);
  }
  return { rendered: valid.slice(0, MAX_RENDERED), total: valid.length };
}

function easeOutCubic(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return 1 - (1 - c) ** 3;
}

/** Nlerp (normalize, then lerp) between two lat/lons on the unit sphere:
 *  a true slerp is unnecessary at the small angular deltas one quantum
 *  step (QUANTUM_DEG=3) ever produces, and this is three additions and a
 *  sqrt cheaper. `t` is eased (easeOutCubic) so a glide settles into its
 *  target rather than arriving at a constant clip. */
export function interpolateLatLon(a: LatLon, b: LatLon, t: number): LatLon {
  const eased = easeOutCubic(t);
  const pa = latLonToXyz(a.lat, a.lon);
  const pb = latLonToXyz(b.lat, b.lon);
  const x = pa.x + (pb.x - pa.x) * eased;
  const y = pa.y + (pb.y - pa.y) * eased;
  const z = pa.z + (pb.z - pa.z) * eased;
  const len = Math.hypot(x, y, z) || 1;
  return xyzToLatLon({ x: x / len, y: y / len, z: z / len });
}

// Precomputed once at module load (centroids.ts is a fixed ~250-row
// table): nearestPlaceName below is only ever called on hover, but a
// per-call latLonToXyz over every row would still be wasted work when the
// centroid list itself never changes.
const centroidVectors: { c: CountryCentroid; v: ReturnType<typeof latLonToXyz> }[] = centroids.map((c) => ({ c, v: latLonToXyz(c.lat, c.lon) }));

/** The nearest named place to a (quantized) view centre, for the hover
 *  label only ("looking near India") -- reuses centroids.ts (LiveDots.tsx
 *  / ArcLayer.tsx's own country centroids) rather than shipping a second,
 *  finer city gazetteer nobody else in GLOBE needs (DISK rule: the
 *  machine this runs on is under 5 GB free). Angular nearest neighbour via
 *  a dot-product max, not haversine -- both centroidVectors and the query
 *  are unit vectors, so the largest dot product IS the smallest angle. */
export function nearestPlaceName(lat: number, lon: number): string {
  const v = latLonToXyz(lat, lon);
  let best = centroidVectors[0];
  let bestDot = -Infinity;
  for (const entry of centroidVectors) {
    const dot = v.x * entry.v.x + v.y * entry.v.y + v.z * entry.v.z;
    if (dot > bestDot) {
      bestDot = dot;
      best = entry;
    }
  }
  return best.c.name;
}

export function describeZoom(zoom: ZoomBucket): string {
  if (zoom === "close") return "zoomed in";
  if (zoom === "region") return "at regional zoom";
  return "zoomed out";
}

/** The hover tooltip's exact line (brief's own example string). Never the
 *  visitor's real location -- it only ever sees the PUBLISHED, already
 *  quantized reading, same as every other read of this channel. */
export function hoverLabel(view: ViewPresence): string {
  return `an explorer, ${describeZoom(view.zoom)}, looking near ${nearestPlaceName(view.lat, view.lon)}`;
}
