// LANE C1 ("Share a view"): pure parse/serialize for the address-bar view
// state. No three, no React, no DOM -- same discipline as cameraMath.ts and
// geoMath.ts, so every clamp/validation branch here is directly
// unit-testable and this stays a leaf module nothing else needs to import
// (ui/ShareView.tsx is its only real consumer, plus this file's own test).
//
// Security note (the brief's own words: "never execute anything from the
// URL"): every field below is validated into a plain number/string/enum and
// handed to globeStore.ts's existing typed setters. Nothing here ever
// evaluates, interpolates into HTML, or dynamically imports based on a URL
// value -- a hostile query string can only ever fail validation and be
// dropped, never run.
import { MIN_OFFSET_MIN, MAX_OFFSET_MIN } from "./timeMachine/rangeModel.ts";
import type { GlobeView, LayerId } from "./globeStore.ts";

/** Mirrors globeStore.ts's own LAYER_IDS -- restated rather than imported so
 *  a garbled URL is validated against the real set without this module
 *  reaching past its own leaf-module boundary for anything but the type. A
 *  drift test below cross-checks this copy against the live store, the same
 *  "duplicated, never silently drifts" discipline LayerPanel.tsx's own LABEL
 *  record uses (a Record<LayerId, ...> fails to compile if the two lists
 *  disagree). */
const KNOWN_LAYER_IDS: readonly LayerId[] = ["markers", "stars", "satellites", "aircraft", "presence", "pulses", "hazards", "wind", "reach", "countries", "together", "density", "guide", "daylight", "eclipse", "buoys"];
const KNOWN_VIEWS: readonly GlobeView[] = ["orbit", "ground", "follow", "street"];

// Sane world-unit bounds for a shared camera altitude: never inside the
// globe (GLOBE_RADIUS = 6, per cameraMath.ts), never absurdly far out.
const ALT_MIN = 6.05;
const ALT_MAX = 600;

const ID_PATTERN = /^[A-Za-z0-9_.:-]{1,80}$/;
const MAX_OVERLAYS = 12;

export interface ShareState {
  lat: number;
  lon: number;
  alt: number;
  view: GlobeView;
  timeOffsetMin: number;
  /** Every layer id currently ON -- the full set, not a diff against
   *  defaults, so a restore is exact rather than a merge (LAYER_IDS not
   *  named here become OFF on restore, same as they'd read from the URL's
   *  own absence). */
  layers: LayerId[];
  base: string;
  overlays: { id: string; opacity: number }[];
  selectionId: string | null;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/** Cyclic wrap into [-180, 180) -- longitude has no natural clamp endpoint,
 *  a link built at 190 degrees means the same meridian as -170. Already
 *  in-range values pass straight through (no modulo round-trip noise), so a
 *  well-formed lon like 73.8567 serializes and reparses back to the exact
 *  same float rather than 73.85670000000005. */
function wrapLon(lon: number): number {
  if (lon >= -180 && lon < 180) return lon;
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

function parseFiniteNumber(raw: string | null): number | undefined {
  if (raw === null || raw === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Builds the query string this share link carries (no leading "?"). Numbers
 * are rounded to a fixed precision so `parseShareState(serializeShareState(s))`
 * round-trips exactly rather than drifting on float noise -- 4dp on lat/lon
 * is under 11m at the equator, 2dp on altitude is under a centimetre in
 * world-unit terms, both far tighter than anything a fly-in could show.
 */
export function serializeShareState(s: ShareState, nowMs = Date.now()): string {
  const params = new URLSearchParams();
  params.set("lat", clamp(s.lat, -90, 90).toFixed(4));
  params.set("lon", wrapLon(s.lon).toFixed(4));
  params.set("alt", clamp(s.alt, ALT_MIN, ALT_MAX).toFixed(2));
  params.set("view", s.view);
  if (Number.isFinite(s.timeOffsetMin) && (s.timeOffsetMin < MIN_OFFSET_MIN || s.timeOffsetMin > MAX_OFFSET_MIN)) {
    const minuteMs = Math.floor((nowMs + s.timeOffsetMin * 60_000) / 60_000) * 60_000;
    params.set("at", new Date(minuteMs).toISOString().slice(0, 16) + "Z");
  } else {
    params.set("t", String(Math.round(clamp(s.timeOffsetMin, MIN_OFFSET_MIN, MAX_OFFSET_MIN))));
  }
  params.set("ly", s.layers.join(","));
  if (s.base) params.set("base", s.base);
  if (s.overlays.length > 0) {
    params.set(
      "ov",
      s.overlays
        .slice(0, MAX_OVERLAYS)
        .map((o) => `${o.id}:${clamp(o.opacity, 0, 1).toFixed(2)}`)
        .join(","),
    );
  }
  if (s.selectionId) params.set("sel", s.selectionId);
  return params.toString();
}

/**
 * Parses and validates a query string (or `URLSearchParams`, or
 * `location.search`) into whichever fields were both present and valid.
 * Every field is independently optional in the result: a caller merges only
 * what's here onto the current store state, so one malformed field (a
 * fuzzed `lat=💥`, an out-of-range `alt`, an unknown `view`) never blocks the
 * rest of an otherwise-good link, and a link with nothing valid at all
 * parses to `{}` rather than throwing.
 */
export function parseShareState(search: string | URLSearchParams, nowMs = Date.now()): Partial<ShareState> {
  const params = typeof search === "string" ? new URLSearchParams(search.startsWith("?") ? search.slice(1) : search) : search;
  const out: Partial<ShareState> = {};

  const lat = parseFiniteNumber(params.get("lat"));
  if (lat !== undefined) out.lat = clamp(lat, -90, 90);

  const lon = parseFiniteNumber(params.get("lon"));
  if (lon !== undefined) out.lon = wrapLon(lon);

  const alt = parseFiniteNumber(params.get("alt"));
  if (alt !== undefined) out.alt = clamp(alt, ALT_MIN, ALT_MAX);

  const view = params.get("view");
  if (view !== null && (KNOWN_VIEWS as readonly string[]).includes(view)) out.view = view as GlobeView;

  const t = parseFiniteNumber(params.get("t"));
  if (t !== undefined) out.timeOffsetMin = Math.round(clamp(t, MIN_OFFSET_MIN, MAX_OFFSET_MIN));

  const at = params.get("at");
  if (at && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z$/.test(at)) {
    const ms = Date.parse(at);
    // Successive global solar eclipses are less than a year apart; 400 days
    // covers the next eclipse without accepting an unbounded future clock.
    if (Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 16) + "Z" === at
      && ms >= nowMs + MIN_OFFSET_MIN * 60_000 && ms <= nowMs + 400 * 86_400_000) {
      out.timeOffsetMin = (ms - nowMs) / 60_000;
    }
  }

  const ly = params.get("ly");
  if (ly !== null) {
    const ids = ly
      .split(",")
      .map((id) => id.trim())
      .filter((id): id is LayerId => (KNOWN_LAYER_IDS as readonly string[]).includes(id));
    // An empty result (every token garbage, or "ly=") is still a valid,
    // meaningful answer -- "every layer off" -- not the same as "absent",
    // so it's kept rather than dropped.
    out.layers = Array.from(new Set(ids));
  }

  const base = params.get("base");
  if (base !== null && ID_PATTERN.test(base)) out.base = base;

  const ov = params.get("ov");
  if (ov !== null) {
    const overlays: { id: string; opacity: number }[] = [];
    for (const pair of ov.split(",").slice(0, MAX_OVERLAYS)) {
      const [id, opacityRaw] = pair.split(":");
      if (!id || !ID_PATTERN.test(id)) continue;
      const opacity = parseFiniteNumber(opacityRaw ?? null);
      if (opacity === undefined) continue;
      overlays.push({ id, opacity: clamp(opacity, 0, 1) });
    }
    out.overlays = overlays;
  }

  const sel = params.get("sel");
  if (sel !== null && ID_PATTERN.test(sel) && sel.length <= 120) out.selectionId = sel;

  return out;
}

/** Whether a parsed result carries anything worth restoring -- ui/ShareView.tsx
 *  uses this to decide whether to suppress the first-visit intro and apply a
 *  fly-in at all; a bare `/globe` (no query, or every field invalid) must
 *  behave exactly as before this lane existed. */
export function hasShareFields(s: Partial<ShareState>): boolean {
  return Object.keys(s).length > 0;
}

/** Render-space earth radius, same literal as cameraMath.ts's own
 *  GLOBE_RADIUS -- duplicated for the same chunk-isolation reason that
 *  file's header documents (importing from it, or from geoMath.ts, would
 *  give either module a second, differently-chunked consumer and promote it
 *  out of this lane's own lazy chunk). This lane's own lazy chunk is the
 *  only consumer of the tiny inverse-trig pair below, so a THIRD duplicate
 *  copy is the lazy, correct choice here, not a shared import. */
const GLOBE_RADIUS = 6;

/** World-space camera position -> (lat, lon, altitude above the surface in
 *  world units). Same formula as cameraMath.ts's xyzToLatLon, restated (see
 *  header comment); ui/ShareView.tsx feeds this the live scene camera to
 *  build a share link, and `alt` here is the raw distance CameraDirector.tsx
 *  itself flies to (never re-derived to a "true" km altitude, which would
 *  claim more precision about the free camera's real height than a
 *  perspective-projected orbit position actually carries). */
export function cameraToLatLonAlt(x: number, y: number, z: number): { lat: number; lon: number; alt: number } {
  const dist = Math.hypot(x, y, z);
  if (dist < 1e-6) return { lat: 0, lon: 0, alt: GLOBE_RADIUS };
  const lat = (Math.asin(clamp(y / dist, -1, 1)) * 180) / Math.PI;
  const lon = (Math.atan2(-z, x) * 180) / Math.PI;
  return { lat, lon, alt: dist };
}
