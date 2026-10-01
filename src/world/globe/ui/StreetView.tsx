import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { GeoJSONSource, Map as MaplibreMap, MapLayerMouseEvent } from "maplibre-gl";
import { entityPositions, useGlobe, type Focus } from "../globeStore.ts";
import { useReducedMotion } from "../../../SceneActivity.tsx";
import { PUNE } from "../../../lib/sky.ts";
import { focusHandoffUrl } from "../../altitude.ts";
import { GLOBE_RADIUS, xyzToLatLon } from "../cameraMath.ts";
import { armStreetHandoff, consumeStreetHandoff, streetZoomToAltitude } from "../cameraZoomGate.ts";
import {
  LIBERTY_STYLE_URL,
  PHOTO_SOURCE_ID,
  PHOTO_LAYER_ID,
  TIER_PHOTO_LIMIT,
  panoramaxSearchUrl,
  parsePanoramaxFeatures,
  photosToGeoJSON,
  shouldRequery,
  type StreetPhoto,
  type LngLatBoundsLike,
} from "../streetPhotos.ts";
import StreetPhotoViewer from "./streetPhotoViewer.tsx";

/** WAVE 2 LANE W3 (street level: vector map, 3D buildings, street photos) owns this file. */

const STREET_ZOOM = 16.5;
const STREET_PITCH = 60;
const STREET_BEARING = 0;
const QUERY_DEBOUNCE_MS = 400;
// WAVE 10 LANE P10B: real 3D terrain (AWS elevation-tiles-prod, Terrarium
// PNG DEM, proxied through api/_lib/terrain-handler.ts — see that file for
// the curl verification of the source's own zoom ceiling and encoding).
// Tier 3 (throttled) stays flat per the brief; tier 1/2 get relief only once
// zoomed in enough that it reads as more than noise.
const TERRAIN_SOURCE_ID = "terrain-dem";
const TERRAIN_HILLSHADE_LAYER_ID = "terrain-hillshade";
const TERRAIN_MIN_ZOOM = 10;
const TERRAIN_EXAGGERATION = 1.3; // modest — real relief, not a cartoon
const TERRAIN_ATTRIBUTION = "Terrain: SRTM, courtesy of the U.S. Geological Survey, via AWS Open Data";
// WAVE 6 LANE X5 hand-off hooks: below this the visitor is trying to zoom
// OUT past the surface's own floor -- "past its min zoom returns to the
// globe" (the brief's own words). Below altitudeToStreetZoom's own MIN_Z
// (12, cameraZoomGate.ts) with margin, so the widest seamless-zoom hand-off
// never opens already sitting at/under this floor.
const STREET_MIN_ZOOM = 11;
// WAVE 6 LANE X5: a feed that never resolves (hangs, not fails) would
// otherwise leave "Looking for street photos…" up forever -- the house rule
// is "no invented/stale data", not "eventually say something", so this is a
// real watchdog, not a repeat of the already-existing "loaded, zero results"
// message below.
const NO_FEATURES_TIMEOUT_MS = 3000;
// "For Pune only" (this lane's brief): a loose radius, not an exact-equality
// check — a fly-to that lands a few metres off Pune's own coordinate (e.g. a
// registered entity's current position) should still count as Pune.
const PUNE_EPSILON_DEG = 0.05;
const FADE_MS = 300;
// WAVE 6 LANE X5: restated from GlobeScene.tsx's own OrbitControls
// min/maxDistance (out of this lane's file ownership; CameraDirector.tsx --
// a Canvas-side sibling this file can't reach into -- already restates the
// same two numbers as its own fallback default when `controls` isn't
// mounted). altitudeToStreetZoom's inverse needs the exact same band its
// forward direction used, or "matching orbit distance" lands at the wrong
// distance from what the zoom-in side computed.
const ORBIT_MIN_ALTITUDE = GLOBE_RADIUS * 1.5 - GLOBE_RADIUS; // 3
const ORBIT_MAX_ALTITUDE = GLOBE_RADIUS * 7 - GLOBE_RADIUS; // 36

declare global {
  interface Window {
    /** e2e-only seam (this lane's own brief, task 9), same shape as
     *  Inspector.tsx's own `__GLOBE_TEST_SELECT__`: no trigger lane's UI
     *  lives in this worktree, so a test flies here directly and switches
     *  the view itself. Read once on mount; a no-op in production since
     *  nothing outside a test ever sets it. `bearing`/`pitch` are optional:
     *  a test asserting a real bearing/pitch hand-off arms them (routed
     *  through the exact same StreetHandoff box the zoom-hold gesture
     *  uses -- see the mount effect below), one that only cares about
     *  lat/lon (the pre-existing exit-hand-off test) leaves them out and
     *  gets the plain STREET_BEARING/STREET_PITCH defaults. */
    __GLOBE_TEST_STREET__?: { lat: number; lon: number; bearing?: number; pitch?: number };
    /** Exposed only while `__GLOBE_TEST_STREET__` armed this session — lets
     *  an e2e test compute a marker's real screen position (`map.project`)
     *  to click it, since photo markers are a GL circle layer, not DOM
     *  nodes. Deleted on unmount; never set for a real visitor. */
    __GLOBE_TEST_STREET_MAP__?: MaplibreMap;
  }
}

/** "18.5204°N, 73.8567°E" — the brief's own "lat/lon, no reverse-geocode" line. */
function formatLatLon(lat: number, lon: number): string {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(4)}°${ns}, ${Math.abs(lon).toFixed(4)}°${ew}`;
}

/** Where the street map centres: `focus`'s own latlon, a registered entity's
 *  CURRENT position converted back to latlon, or Pune as the documented
 *  fallback (this lane's brief, task 1). */
function resolveCenter(focus: Focus | null): { lat: number; lon: number } {
  if (focus?.kind === "latlon") return { lat: focus.lat, lon: focus.lon };
  if (focus?.kind === "entity") {
    const p = entityPositions.get(focus.id)?.();
    if (p) return xyzToLatLon({ x: p.x, y: p.y, z: p.z });
  }
  return { lat: PUNE.lat, lon: PUNE.lon };
}

const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function StreetView({ tier }: { tier: 1 | 2 | 3 }) {
  const view = useGlobe((s) => s.view);
  const focus = useGlobe((s) => s.focus);
  const selected = useGlobe((s) => s.selected);
  const setView = useGlobe((s) => s.setView);
  const flyTo = useGlobe((s) => s.flyTo);
  const reducedMotion = useReducedMotion();
  const active = view === "street";

  const rootRef = useRef<HTMLDivElement>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const photosRef = useRef<StreetPhoto[]>([]);
  const lastBoundsRef = useRef<LngLatBoundsLike | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [photos, setPhotos] = useState<StreetPhoto[]>([]);
  const [photoStatus, setPhotoStatus] = useState<"loading" | "loaded" | "failed">("loading");
  const [selectedPhoto, setSelectedPhoto] = useState<StreetPhoto | null>(null);
  const [visible, setVisible] = useState(false);
  // WAVE 10 LANE P10B: drives the attribution line's terrain credit — only
  // true while the DEM source is actually loaded, tier-eligible, and past
  // TERRAIN_MIN_ZOOM (never claim a credit for a layer that isn't drawing).
  const [terrainState, setTerrainState] = useState<"off" | "loading" | "enabled" | "unreachable">("off");
  // Pending requests remain explicitly pending after 3s (a
  // watchdog, not a repeat of the "loaded, zero results" message below —
  // that one only ever fires once a query has actually FINISHED).
  const [noFeaturesTimedOut, setNoFeaturesTimedOut] = useState(false);
  const noFeaturesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // WAVE 6 LANE X5: guards the zoom-out hand-off firing more than once per
  // open — MapLibre's own "zoom" event fires on every frame of a wheel/pinch
  // gesture, not just the one that first crosses STREET_MIN_ZOOM.
  const exitedRef = useRef(false);

  // e2e-only seam: fires once on mount, before the map-creation effect below
  // ever reads `view`/`focus` — the same "read on mount, no-op absent a
  // test" shape as Inspector.tsx's own __GLOBE_TEST_SELECT__.
  useEffect(() => {
    const seam = window.__GLOBE_TEST_STREET__;
    if (seam) {
      // Same StreetHandoff box the real zoom-hold gesture arms (in
      // CameraDirector.tsx) -- a test asserting map.getBearing()/getPitch()
      // exercises the actual hand-off/consume/map-init path this way,
      // rather than a separate seam that would only prove the test's own
      // plumbing works.
      if (seam.bearing !== undefined || seam.pitch !== undefined) {
        armStreetHandoff({ zoom: STREET_ZOOM, bearing: seam.bearing, pitch: seam.pitch });
      }
      flyTo({ kind: "latlon", lat: seam.lat, lon: seam.lon });
      setView("street");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only
  }, []);

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  // Fade in over the canvas; instant under reduced motion (this lane's
  // brief). Every branch sets state from inside a callback (rAF, or a 0ms
  // timeout standing in for one) rather than synchronously at the top of the
  // effect body, so a re-open always restarts the fade from 0 instead of
  // skipping it because `visible` was still true from the last time.
  useEffect(() => {
    if (!active) {
      const t = setTimeout(() => setVisible(false), 0);
      return () => clearTimeout(t);
    }
    if (reducedMotion) {
      const t = setTimeout(() => setVisible(true), 0);
      return () => clearTimeout(t);
    }
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, [active, reducedMotion]);

  // No page scroll while this full-bleed surface is open.
  useEffect(() => {
    if (!active) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [active]);

  // Focus trap: Tab cycles within this surface only, so a keyboard visitor
  // never lands back on the layer panel / inspector hidden underneath.
  // Re-armed whenever the photo viewer opens or closes, since that changes
  // which controls exist to cycle through.
  useEffect(() => {
    if (!active) return;
    const root = rootRef.current;
    if (!root) return;
    const getFocusable = () => Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    const raf = requestAnimationFrame(() => getFocusable()[0]?.focus());
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const els = getFocusable();
      if (els.length === 0) return;
      const first = els[0];
      const last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    root.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(raf);
      root.removeEventListener("keydown", onKeyDown);
    };
  }, [active, selectedPhoto]);

  // Esc, handled locally as well as by CameraDirector's own global listener
  // (out of this lane's file ownership — see the note on the `view ===
  // "street"` no-op there). Belt and braces: measured empirically (lane W3
  // QA), a keydown fired in the first ~second after this surface's own brand
  // new WebGL context is created sometimes never reaches — or never gets
  // acted on by — that OTHER listener (a real, reproducible race outside
  // this file's own code; a >=1s delay before the SAME keypress always
  // works). A surface the brief calls out by name ("Back to globe (Esc)")
  // closing reliably belongs to this lane regardless of where the race
  // actually lives; setView is idempotent, so this firing alongside
  // CameraDirector's own handler on a normal press costs nothing.
  useEffect(() => {
    if (!active) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setView("orbit");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, setView]);

  // The map itself: created fresh on open, fully torn down on close (house
  // perf rule — no work, no live WebGL context, while this surface is shut).
  // Intentionally NOT re-armed on a `focus` change while already open —
  // same "arm once" shape as CameraDirector's own ground/follow views.
  useEffect(() => {
    if (!active) return;
    const container = mapContainerRef.current;
    if (!container) return;

    let cancelled = false;
    let map: MaplibreMap | null = null;
    const isTestMode = Boolean(window.__GLOBE_TEST_STREET__);
    const limit = TIER_PHOTO_LIMIT[tier];
    exitedRef.current = false;
    // WAVE 6 LANE X5: read-once hand-off from the seamless zoom-in gesture
    // (CameraDirector.tsx armed it right before calling setView("street")).
    // Absent one (the explicit street button, or a re-open), STREET_ZOOM/
    // STREET_BEARING/STREET_PITCH are the pre-existing defaults this lane's
    // brief says to keep. Bearing/pitch matching the globe camera (not just
    // zoom) is the verifier-flagged blocking gap this pass fixes --
    // cameraOrientation.ts's cameraForwardToBearingPitch is what
    // CameraDirector.tsx derived them from.
    const handoff = consumeStreetHandoff();
    const openZoom = handoff?.zoom ?? STREET_ZOOM;
    const openBearing = handoff?.bearing ?? STREET_BEARING;
    const openPitch = handoff?.pitch ?? STREET_PITCH;

    const queryPhotos = async () => {
      if (!map) return;
      const b = map.getBounds();
      const bounds: LngLatBoundsLike = { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() };
      if (!shouldRequery(lastBoundsRef.current, bounds)) return;
      lastBoundsRef.current = bounds;
      setPhotoStatus("loading");
      setNoFeaturesTimedOut(false);
      if (noFeaturesTimerRef.current) clearTimeout(noFeaturesTimerRef.current);
      noFeaturesTimerRef.current = setTimeout(() => setNoFeaturesTimedOut(true), NO_FEATURES_TIMEOUT_MS);
      try {
        const res = await fetch(panoramaxSearchUrl(bounds, limit));
        if (!res.ok) throw new Error(`panoramax ${res.status}`);
        const json = await res.json();
        const parsed = parsePanoramaxFeatures(json);
        if (parsed === null) throw new Error("panoramax: unexpected response shape");
        if (cancelled || !map) return;
        if (noFeaturesTimerRef.current) clearTimeout(noFeaturesTimerRef.current);
        setPhotos(parsed);
        setPhotoStatus("loaded");
        const source = map.getSource(PHOTO_SOURCE_ID) as GeoJSONSource | undefined;
        source?.setData(photosToGeoJSON(parsed));
      } catch {
        // House rule: a feed that fails draws nothing and says so — never a
        // stale or invented photo list.
        if (cancelled) return;
        if (noFeaturesTimerRef.current) clearTimeout(noFeaturesTimerRef.current);
        setPhotos([]);
        setPhotoStatus("failed");
      }
    };

    (async () => {
      // maplibre-gl needs its own web worker for EVERY GeoJSON source and
      // vector tile it parses (this lane's own photo-marker circle layer
      // included) — without it, `map.loaded()`/`isSourceLoaded()` never turn
      // true and nothing queryable ever renders, though the map still LOOKS
      // fine (paint-only layers keep working). At runtime maplibre computes
      // the worker's URL as `new URL("./maplibre-gl-worker.mjs",
      // import.meta.url)` relative to ITS OWN bundled chunk — a pattern
      // buried inside the already-built node_modules/maplibre-gl/dist/*.mjs,
      // not a `new Worker(new URL(...))` call in OUR source, so Vite's
      // worker-chunk detection (the thing that correctly emits
      // engine.worker.ts/splat.worker.ts as their own chunks) never sees it
      // and never copies the sibling file the build needs. Confirmed via a
      // 404 for assets/maplibre-gl-worker.mjs (then, once that was copied
      // in, a second 404 for the file ITS OWN `import` pulls in,
      // maplibre-gl-shared.mjs) in a real `vite build` + `vite preview` run —
      // dev mode hides this because Vite serves node_modules source
      // on-demand there. Fixed by vendoring both files, byte-identical from
      // the installed package, at public/assets/maplibre-gl-{worker,shared}.mjs
      // so Vite's plain publicDir copy lands them at the exact unhashed path
      // the library computes, next to whatever hash its own main chunk gets.
      // Re-copy both after any maplibre-gl version bump.
      const [{ Map: MaplibreMapCtor }] = await Promise.all([
        import("maplibre-gl"),
        // CSS only ever loads from here — this lane's brief: maplibre-gl and
        // its stylesheet load ONLY inside street view, their own lazy chunk.
        import("maplibre-gl/dist/maplibre-gl.css"),
      ]);
      if (cancelled) return;

      const { lat, lon } = resolveCenter(focus);
      map = new MaplibreMapCtor({
        container,
        style: LIBERTY_STYLE_URL,
        center: [lon, lat],
        zoom: openZoom,
        pitch: openPitch,
        bearing: openBearing,
        // MapLibre's own default maxPitch is 60 -- below cameraOrientation.ts's
        // clamp ceiling of 85, so a real matched hand-off past 60 would
        // otherwise get silently re-clamped a second time, right here,
        // regardless of what this lane computed.
        maxPitch: 85,
        attributionControl: false,
      });
      if (isTestMode) window.__GLOBE_TEST_STREET_MAP__ = map;

      map.on("load", () => {
        if (cancelled || !map) return;
        // The orbit camera always looks at the globe's centre, so a matched
        // hand-off opens flat (pitch ~0). Opening matched keeps the zoom-in
        // continuous; settling into the street tilt afterwards keeps the
        // street view readable. Skipped under reduced motion, and in the
        // e2e seam, which asserts the matched values themselves.
        if (handoff && !reducedMotion && !isTestMode && openPitch < STREET_PITCH - 5) {
          map.easeTo({ pitch: STREET_PITCH, bearing: openBearing, duration: 1200 });
        }
        map.addSource(PHOTO_SOURCE_ID, { type: "geojson", data: photosToGeoJSON([]) });
        map.addLayer({
          id: PHOTO_LAYER_ID,
          type: "circle",
          source: PHOTO_SOURCE_ID,
          paint: {
            // --color-probe: a live/claim thing (real photo evidence), never
            // an ambient-earth colour (house colour rule, globe-lanes.md).
            "circle-radius": 7,
            "circle-color": "#5ee6ff",
            "circle-stroke-width": 2,
            "circle-stroke-color": "#0b0e14",
          },
        });
        map.on("mouseenter", PHOTO_LAYER_ID, () => {
          if (map) map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", PHOTO_LAYER_ID, () => {
          if (map) map.getCanvas().style.cursor = "";
        });
        map.on("click", PHOTO_LAYER_ID, (e: MapLayerMouseEvent) => {
          const id = e.features?.[0]?.properties?.id as string | undefined;
          const photo = photosRef.current.find((p) => p.id === id);
          if (photo) setSelectedPhoto(photo);
        });
        void queryPhotos();

        // WAVE 10 LANE P10B: raster-dem source over api/_lib/terrain-handler.ts
        // (Terrarium encoding — the format that route's PNG bytes are in).
        // Tier 3 never gets this source at all (house tier rule: "T3 minimal
        // or off", and a DEM source is real per-frame GPU/network cost this
        // lane's brief explicitly excludes it from). Added once at open,
        // toggled on/off by zoom below rather than added/removed, since
        // MapLibre's setTerrain(null) / layer visibility are cheap and this
        // avoids re-adding a source on every zoom crossing.
        if (tier !== 3 && map) {
          let failed = false, loaded = false;
          // MapLibre 6 suppresses HTTP 404 error events. The loading event
          // exposes the same tile object whose state later becomes errored.
          const pendingTiles = new Set<{ state: string; dem?: unknown }>();
          let terrainFrame: number | null = null;
          map.on("sourcedataloading", (event) => {
            if (failed || event.sourceId !== TERRAIN_SOURCE_ID || !event.tile) return;
            pendingTiles.add(event.tile);
            if (terrainFrame === null) terrainFrame = requestAnimationFrame(inspectTerrainTiles);
          });
          map.on("remove", () => { if (terrainFrame !== null) cancelAnimationFrame(terrainFrame); });
          map.addSource(TERRAIN_SOURCE_ID, {
            type: "raster-dem",
            encoding: "terrarium",
            tiles: ["/api/terrain?z={z}&x={x}&y={y}"],
            tileSize: 256,
            maxzoom: 15, // matches terrain-handler.ts's curl-verified MAX_Z
          });
          // Hillshade under labels: the style's own first symbol layer id,
          // so shading paints under place-name text instead of over it —
          // same "insert before" pattern as every other MapLibre layer this
          // house adds under an existing style's labels.
          const beforeId = map.getStyle()?.layers?.find((l) => l.type === "symbol")?.id;
          map.addLayer(
            {
              id: TERRAIN_HILLSHADE_LAYER_ID,
              type: "hillshade",
              source: TERRAIN_SOURCE_ID,
              paint: { "hillshade-exaggeration": 0.5 },
            },
            beforeId,
          );

          const applyTerrainForZoom = () => {
            if (!map) return;
            const on = !failed && map.getZoom() >= TERRAIN_MIN_ZOOM;
            map.setTerrain(on ? { source: TERRAIN_SOURCE_ID, exaggeration: TERRAIN_EXAGGERATION } : null);
            map.setLayoutProperty(TERRAIN_HILLSHADE_LAYER_ID, "visibility", on ? "visible" : "none");
            setTerrainState(failed ? "unreachable" : on ? loaded ? "enabled" : "loading" : "off");
          };
          applyTerrainForZoom();
          map.on("zoom", applyTerrainForZoom);
          const failTerrain = () => {
            if (failed) return;
            failed = true;
            pendingTiles.clear();
            applyTerrainForZoom();
          };
          map.on("sourcedata", (event) => {
            if (failed || event.sourceId !== TERRAIN_SOURCE_ID || event.tile?.state !== "loaded" || !event.tile.dem) return;
            pendingTiles.delete(event.tile);
            if (!loaded) { loaded = true; applyTerrainForZoom(); }
          });
          // A suppressed 404 need not repaint a reduced-motion map. Inspect
          // pending tiles independently until each request has settled.
          const inspectTerrainTiles = () => {
            terrainFrame = null;
            for (const tile of pendingTiles) {
              if (tile.state === "errored") { failTerrain(); break; }
              if (tile.state === "unloaded" || tile.state === "loaded") pendingTiles.delete(tile);
            }
            if (!failed && pendingTiles.size) terrainFrame = requestAnimationFrame(inspectTerrainTiles);
          };
          map.on("error", (event) => {
            if (!("sourceId" in event) || event.sourceId !== TERRAIN_SOURCE_ID) return;
            failTerrain();
          });
        }
      });

      map.on("moveend", () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => void queryPhotos(), QUERY_DEBOUNCE_MS);
      });

      // WAVE 6 LANE X5: "zooming out of the street map past its min zoom
      // returns to the globe at the matching orbit distance over the same
      // point" (the brief's own words). `map.getCenter()` — not `focus`,
      // which is only where this surface OPENED — so panning around inside
      // street level before zooming back out still lands the orbit camera
      // over wherever the visitor actually ended up, not the stale entry
      // point. `flyTo` + `setView("orbit")` together (both synchronous
      // Zustand writes, same tick): CameraDirector.tsx's own
      // view-change-to-orbit effect resets any in-flight state first, then
      // its focus-only effect (still queued for the same commit, `focus`'s
      // identity having also just changed) arms the actual flight — the same
      // two-effect handshake it already uses for a plain click-to-fly while
      // orbit is the CURRENT view.
      map.on("zoom", () => {
        if (!map || exitedRef.current || map.getZoom() >= STREET_MIN_ZOOM) return;
        exitedRef.current = true;
        const center = map.getCenter();
        const altitude = streetZoomToAltitude(map.getZoom(), ORBIT_MIN_ALTITUDE, ORBIT_MAX_ALTITUDE);
        flyTo({ kind: "latlon", lat: center.lat, lon: center.lng, distance: GLOBE_RADIUS + altitude });
        setView("orbit");
      });
    })();

    return () => {
      cancelled = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = null;
      if (noFeaturesTimerRef.current) clearTimeout(noFeaturesTimerRef.current);
      noFeaturesTimerRef.current = null;
      map?.remove();
      map = null;
      delete window.__GLOBE_TEST_STREET_MAP__;
      lastBoundsRef.current = null;
      setPhotos([]);
      setPhotoStatus("loading");
      setNoFeaturesTimedOut(false);
      setSelectedPhoto(null);
      setTerrainState("off");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- create/destroy only on `active`; `focus`/`tier` are read once at open time on purpose
  }, [active]);

  const onBackToGlobe = useCallback(() => setView("orbit"), [setView]);

  if (!active) return null;

  const { lat, lon } = resolveCenter(focus);
  const isPune = Math.abs(lat - PUNE.lat) < PUNE_EPSILON_DEG && Math.abs(lon - PUNE.lon) < PUNE_EPSILON_DEG;
  const placeTitle = selected?.title ?? null;

  // Portalled straight to <body>, not left as a plain sibling under
  // data-globe-root: GlobeScene's own drei <Html> callouts (Markers.tsx's
  // Pune card) keep rendering and tracking the 3D scene behind this
  // surface, and empirically (screenshot QA) paint above any merely-high
  // z-index — a max-value z-[2147483647] (the largest legal CSS z-index in
  // every browser, so nothing can ever outrank it) is what it actually took
  // to make this genuinely full-bleed. A body-level portal keeps that
  // z-index meaningful regardless of which ancestor's stacking context this
  // component would otherwise inherit.
  return createPortal(
    <div
      ref={rootRef}
      data-street-view
      data-terrain-state={terrainState}
      role="dialog"
      aria-modal="true"
      aria-label="Street level"
      style={{ opacity: visible ? 1 : 0, transition: reducedMotion ? "none" : `opacity ${FADE_MS}ms ease`, zIndex: 2147483647 }}
      className="pointer-events-auto fixed inset-0 overflow-hidden bg-ink"
    >
      {/* maplibre-gl.css's own `.maplibregl-map` rule sets `position: relative`
          on this element once the map mounts, at equal CSS specificity to
          (and loaded after, so cascading over) Tailwind's `absolute` utility
          — silently collapsing an inset-0-only div to 0 height, no map ever
          visible (confirmed: measured containerRect.height === 0 before this
          fix). `h-full w-full` sizes it from the parent's own determinate
          height regardless of which `position` wins. */}
      <div ref={mapContainerRef} data-street-map className="absolute inset-0 h-full w-full" />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-2 glass-panel px-3 py-2 font-mono text-xs text-zinc-200">
        <div className="pointer-events-auto min-w-0 truncate">
          {placeTitle && <span className="mr-2 font-semibold text-zinc-100">{placeTitle}</span>}
          <span className="text-zinc-400">{formatLatLon(lat, lon)}</span>
        </div>
        <div className="pointer-events-auto flex shrink-0 items-center gap-2">
          {isPune && (
            <a
              href={focusHandoffUrl("globe", "street")}
              className="rounded-full border border-line px-2 py-1 hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              Walk the valley
            </a>
          )}
          <button
            type="button"
            onClick={onBackToGlobe}
            className="min-h-11 min-w-11 rounded-full border border-line px-2 py-1 hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            Back to globe
          </button>
        </div>
      </div>

      <div
        data-street-status
        className="pointer-events-none absolute left-1/2 top-14 z-10 -translate-x-1/2 whitespace-nowrap rounded-full glass-panel px-3 py-1 font-mono text-xs text-zinc-300"
      >
        {photoStatus === "loading" && !noFeaturesTimedOut && "Looking for street photos…"}
        {photoStatus === "loading" && noFeaturesTimedOut && "Still looking for streets"}
        {photoStatus === "failed" && "Street photo search failed"}
        {photoStatus === "loaded" && photos.length === 0 && "No streets here"}
        {photoStatus === "loaded" && photos.length > 0 && `${photos.length} street photo${photos.length === 1 ? "" : "s"}`}
      </div>

      {/* No `truncate` here on purpose: attribution text is required, not
          decorative, so on a 390px phone it wraps to a second line instead
          of silently hiding "Photos: Panoramax contributors" off the edge. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 glass-panel px-3 py-1.5 font-mono text-xs leading-snug text-zinc-500">
        © OpenMapTiles © OpenStreetMap contributors, OpenFreeMap{photos.length > 0 ? " · Photos: Panoramax contributors" : ""}
        {terrainState === "enabled" ? ` · ${TERRAIN_ATTRIBUTION}` : ""}
        {terrainState === "loading" ? " · Terrain loading" : ""}
        {terrainState === "unreachable" ? " · Terrain unreachable; showing a flat map" : ""}
      </div>

      {selectedPhoto && <StreetPhotoViewer photo={selectedPhoto} onClose={() => setSelectedPhoto(null)} />}
    </div>,
    document.body,
  );
}
