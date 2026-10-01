import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { GLOBE_RADIUS } from "../geoMath.ts";
import { useGlobe, type ImageryStack } from "../globeStore.ts";
import { useReducedMotion } from "../../../SceneActivity.tsx";
import { sunDirection, VERT } from "./sun.ts";
import { TILE_MATRIX_SETS, EOX_LEVELS, GIBS_LEVELS, lonStepDeg, latStepDeg, type TileBounds, type TileMatrixSetId } from "./tileMatrix.ts";
import { selectVisibleTiles, type SelectedTile } from "./tileSelect.ts";
import { selectVisibleEoxTiles } from "./tileSelectEox.ts";
import { buildTilePatchGeometry, TILE_SEGMENTS } from "./tileGeometry.ts";
import { TILE_FRAG_DAY, TILE_FRAG_PLAIN } from "./tileShader.ts";
import { TileLRU } from "./tileCache.ts";
import { GIBS_CATALOG, catalogDate, tileUrl, type GibsCatalogEntry } from "./gibsCatalog.ts";
import type { StatusKey } from "../globeStore.ts";

/**
 * WAVE 2 LANE W1 (deep zoom): draws real NASA GIBS tiles a hair above the
 * whole-globe EarthImagery sphere (radius TILE_RADIUS), swapping in finer
 * detail as the camera moves closer — one base layer plus the overlay stack
 * from `store.imagery`, each tile's own patch mesh crossfading in as its
 * texture lands so nothing pops or leaves a hole (the whole-globe sphere
 * underneath is the permanent fallback: a tile that hasn't loaded yet, or
 * that failed, simply shows that lower-resolution photo through, never a
 * black gap).
 *
 * Everything here is imperative THREE scene-graph management inside refs,
 * not per-tile React state/JSX: the tile SET changes shape every time the
 * camera moves enough to matter, and driving that through React reconciler
 * would mean a re-render (and a new fibre) per tile per frame that actually
 * moves — the "zero per-frame allocations" / "no React state set per frame"
 * rules this repo's other layers already follow (SatelliteLayer.tsx's own
 * ambient swarm is the closest precedent: one InstancedMesh mutated in
 * useFrame, not N React components).
 */

// e2e-only seam, the same shape as Inspector.tsx's __GLOBE_TEST_SELECT__ and
// LayerPanel.tsx's __GLOBE_TEST_SET_ENTITY__: LayerCatalog.tsx isn't wired
// into LayerPanel's own render yet (another lane's job, this ownership rule
// forbids editing LayerPanel to do it here), so an e2e test that wants to
// "add an overlay via the catalog" without waiting on that wiring calls this
// directly instead. A no-op in production — nothing outside a test ever
// calls it.
declare global {
  interface Window {
    __GLOBE_TEST_SET_IMAGERY__?: (imagery: ImageryStack) => void;
    // LANE V1 (wave 7, step A): the same reasoning as __GLOBE_TEST_SET_IMAGERY__
    // above — LayerCatalog.tsx (where a visitor would otherwise read a
    // "feed unavailable" status) isn't wired into LayerPanel's render yet
    // either, so e2e reads the same store status TileLayer.tsx writes to
    // directly instead of through unreachable UI.
    __GLOBE_TEST_GET_IMAGERY_STATUS__?: (layerId: string) => unknown;
  }
}
if (typeof window !== "undefined") {
  window.__GLOBE_TEST_SET_IMAGERY__ = (imagery) => useGlobe.getState().setImagery(imagery);
  window.__GLOBE_TEST_GET_IMAGERY_STATUS__ = (layerId) => useGlobe.getState().status[layerId as StatusKey];
}

// A hair above the whole-globe sphere (EarthImagery's own GLOBE_RADIUS) so a
// tile never z-fights it, never so far above that a tile's edge visibly
// floats off the base sphere at a shallow viewing angle.
const TILE_RADIUS = GLOBE_RADIUS * 1.0015;
const FADE_MS = 200;
// "at most 6 requests in flight" (brief) — shared across the base layer and
// every active overlay, not 6 each: one visitor's browser, one connection.
const MAX_IN_FLIGHT = 6;
// A recompute is genuinely wasted work below this: half a world-unit of
// camera travel, or 2 degrees of camera-forward rotation, whichever fires
// first. Chosen so a slow orbital drift or a tiny mouse jiggle doesn't
// re-walk selectVisibleTiles every frame, while an actual zoom step or pan
// still reacts within a frame or two.
const RECOMPUTE_DISTANCE_EPS = 0.5;
const RECOMPUTE_ANGLE_COS_EPS = 0.9994; // ~2 degrees
// A damped zoom-button dolly or a drag-orbit moves the camera past the
// epsilons above on nearly every frame for its whole duration — recomputing
// on EVERY one of those frames means a new generation (new geometries, new
// queued fetches) started before the previous one even finished loading,
// without bound for as long as the motion continues, which is enough to
// visibly stall the page (caught by e2e/globe-W1.spec.ts's own zoom test: a
// real hang, not a slow test, until this rate limit existed). This is a
// minimum WALL-CLOCK gap between recomputes, not a "wait until idle"
// debounce — a debounce keyed off "has the camera moved since the last
// recompute" has a chicken-and-egg bug at mount (nothing has ever been
// recomputed for yet, so "moved" is trivially true forever, so the debounce
// timer resets every frame and never fires). A plain rate limit has no such
// bootstrap problem and still caps recompute frequency during sustained
// motion to a sane rate.
const RECOMPUTE_MIN_INTERVAL_MS = 150;
// LANE V1 (wave 7, step A): "steps back 10 minutes on a 404 or blank frame up
// to 3 times, then reports 'feed unavailable'" (the brief, verbatim) — this
// is the "up to 3 times" cap. Scoped to `subdaily` roles only (GOES/Himawari):
// a daily/static role 404ing means something is actually broken, not "this
// exact 10-minute frame hasn't published yet", so it keeps the plain
// per-tile error handling below instead of this retry loop.
const MAX_SUBDAILY_BACKOFF_STEPS = 3;

interface TileEntry {
  tile: SelectedTile;
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  geometry: THREE.BufferGeometry;
  texture: THREE.Texture | null;
  status: "loading" | "loaded" | "error";
  generation: number;
  cancelled: boolean;
}

interface QueuedRequest {
  entry: TileEntry;
  url: string;
  controller: AbortController;
}

interface RoleState {
  role: string; // "base" or "overlay:<gibs id>"
  catalogEntry: GibsCatalogEntry;
  shader: "day" | "plain";
  opacity: number; // the layer-panel slider value (overlays) or 1 (base)
  group: THREE.Group;
  entries: Map<string, TileEntry>;
  liveGeneration: number;
  pendingGeneration: number | null;
  transitionStart: number | null;
  generationCounter: number;
  /** LANE V1 (wave 7, step A): how many times in a row this `subdaily`
   *  role's most recent frame request has come back with zero tiles loaded
   *  (a 404/blank frame, not a partial network hiccup — see the settle-check
   *  comment in the useFrame loop below). 0 once any tile of the current
   *  frame has loaded. Unused (stays 0) for daily/static roles. */
  subdailyBackoffSteps: number;
  frame?: string;
  displayedFrame?: string;
}

/** Module-level integration seam (brief: "keep your own detail in a module
 *  export for integration"), mirroring how globeStore.ts's own status map
 *  works but scoped to this lane's own numbers — tile-request counts and
 *  cache sizes a QA script or another lane can read without this lane
 *  needing to edit globeStore.ts or GlobeScene.tsx. Updated in place
 *  (mutated, not replaced) so a reader holding the reference always sees the
 *  latest values, same convention as entityPositions in globeStore.ts.
 *  (A plain data export beside the default component — same pattern
 *  globeStore.ts's own entityPositions uses; nothing here is a component.) */
// eslint-disable-next-line react-refresh/only-export-components
export const tileLayerStats = {
  requested: 0,
  loaded: 0,
  failed: 0,
  aborted: 0,
  inFlight: 0,
  cacheSize: 0,
  cacheMax: 0,
  roles: 0,
  lastRecomputeMs: 0,
};

/** LANE C2 (X-ray mode): read-only export of the tile set actually on screen
 *  right now — one entry per tile that has loaded and is currently visible
 *  (opacity > 0), across every role. `enabled` is a plain bool layers/
 *  XRayTiles.tsx flips true on mount / false on unmount: an ordinary visitor
 *  who never opens X-ray never pays for this (the population loop below is
 *  skipped outright while `enabled` is false, same "zero cost when off"
 *  discipline tileLayerStats's own module comment already states for the
 *  stats counters above). Mutated in place (array truncated and refilled),
 *  never replaced, so a reader holding the reference always sees the latest
 *  frame — same convention tileLayerStats and globeStore.ts's own
 *  entityPositions already use. */
export interface DrawnTile {
  key: string;
  role: string;
  level: number;
  bounds: TileBounds;
  status: "loaded";
  opacity: number;
}
// eslint-disable-next-line react-refresh/only-export-components
export const drawnTileSet: { enabled: boolean; tiles: DrawnTile[] } = { enabled: false, tiles: [] };

function disposeEntry(entry: TileEntry): void {
  entry.cancelled = true;
  entry.mesh.parent?.remove(entry.mesh);
  entry.geometry.dispose();
  entry.material.dispose();
  // NOTE: the texture is owned by the LRU cache (keyed by URL), not by the
  // entry — a tile leaving view must not dispose a texture another still-
  // live tile, or a later re-request of the same URL, is sharing.
}

export default function TileLayer({ now, tier, earthRef: _earthRef }: { now: Date; tier: 1 | 2 | 3; earthRef?: RefObject<THREE.Mesh> }) {
  const groupRef = useRef<THREE.Group>(null!);
  const { size, camera, gl } = useThree();
  const reducedMotion = useReducedMotion();
  const imagery = useGlobe((s) => s.imagery);
  // perf.md: TileLayer and EarthImagery used to fire the same-region fetch
  // at two resolutions simultaneously — the whole-globe base texture and
  // deep-zoom tiles racing for the same bytes on the same connection. Wait
  // for EarthImagery's own base sphere to settle (live OR failed — either
  // way it's done fetching) before this layer's tiles start requesting, so
  // the low-res base always wins the wire first and detail streams in after.
  const earthReady = useGlobe((s) => s.status.earth?.state === "live" || s.status.earth?.state === "failed");

  // T1 (desktop) caches more tiles than T2 (phone) — living-earth's own
  // per-tier cost/cap convention (GlobeScene.tsx's TIER_DOT_COUNT is the
  // same idea for the dot earth). Tier 3 never mounts this component at all
  // (GlobeScene.tsx's own `tier !== 3` gate), so only 1|2 are reachable here.
  const cacheMax = tier === 1 ? 128 : 48;
  const textureCache = useMemo(() => new TileLRU<THREE.Texture>(cacheMax, (tex) => tex.dispose()), [cacheMax]);

  const rolesRef = useRef(new Map<string, RoleState>());
  const sunRef = useRef(new THREE.Vector3());
  const lastCamPos = useRef(new THREE.Vector3(Infinity, Infinity, Infinity));
  const lastCamForward = useRef(new THREE.Vector3());
  const queueRef = useRef<QueuedRequest[]>([]);
  const inFlightRef = useRef(0);
  const scratchForward = useRef(new THREE.Vector3());
  // Rate limit (module doc comment on RECOMPUTE_MIN_INTERVAL_MS): the clock
  // time of the most recent actual recompute.
  const lastRecomputeAtMs = useRef(-Infinity);

  useEffect(() => {
    sunDirection(now, sunRef.current);
    // A clock/scrubber change can select a new frame without camera motion.
    lastCamPos.current.set(Infinity, Infinity, Infinity);
    lastRecomputeAtMs.current = -Infinity;
  }, [now]);

  useEffect(() => {
    tileLayerStats.cacheMax = cacheMax;
    return () => {
      textureCache.clear();
    };
  }, [cacheMax, textureCache]);

  // Full teardown on unmount: every role's every entry disposed, every
  // in-flight request aborted, the cache cleared. GlobeScene.tsx toggles
  // this component in and out (style change, tier change), so this is a
  // real path, not just defensive.
  useEffect(() => {
    const roles = rolesRef.current;
    const queue = queueRef.current;
    return () => {
      for (const role of roles.values()) for (const entry of role.entries.values()) disposeEntry(entry);
      roles.clear();
      for (const q of queue) q.controller.abort();
      queue.length = 0;
      textureCache.clear();
    };
  }, [textureCache]);

  function pump(): void {
    const queue = queueRef.current;
    while (inFlightRef.current < MAX_IN_FLIGHT && queue.length > 0) {
      const req = queue.shift()!;
      if (req.entry.cancelled) continue; // left the view before its turn came up
      inFlightRef.current++;
      tileLayerStats.inFlight = inFlightRef.current;
      fetch(req.url, { signal: req.controller.signal })
        .then((res) => {
          if (!res.ok) throw new Error(`TileLayer: ${res.status} ${req.url}`);
          return res.blob();
        })
        .then((blob) => createImageBitmap(blob))
        .then((bitmap) => {
          inFlightRef.current--;
          tileLayerStats.inFlight = inFlightRef.current;
          if (req.entry.cancelled) {
            bitmap.close?.();
            pump();
            return;
          }
          let texture = textureCache.get(req.url);
          if (!texture) {
            texture = new THREE.Texture(bitmap);
            texture.colorSpace = THREE.SRGBColorSpace;
            // render.md finding 3: every GIBS tile bitmap is power-of-two
            // (256/512px), so three's own default mip chain
            // (generateMipmaps=true + LinearMipmapLinearFilter) is free to
            // enable and kills the moire/shimmer a flat LinearFilter-only
            // sample gets at oblique limb angles or when zoomed out past 1
            // tile-texel per screen pixel — the default view, not an edge
            // case. Anisotropy matches EarthImagery.tsx's own whole-globe
            // sphere (8) for consistency, capped at 8 on tier 2 specifically
            // per the brief; tier 1 (desktop) takes the GPU's real max.
            texture.generateMipmaps = true;
            texture.minFilter = THREE.LinearMipmapLinearFilter;
            texture.magFilter = THREE.LinearFilter;
            const maxAniso = gl.capabilities.getMaxAnisotropy();
            texture.anisotropy = tier === 2 ? Math.min(maxAniso, 8) : maxAniso;
            texture.wrapS = THREE.ClampToEdgeWrapping;
            texture.wrapT = THREE.ClampToEdgeWrapping;
            texture.needsUpdate = true;
            textureCache.set(req.url, texture);
          }
          req.entry.texture = texture;
          // Mutating a uniform's `.value` in place is the documented R3F
          // pattern (sun.ts's own useSunUniforms does the same); the
          // material was constructed WITH this uniforms object via `args`.
          req.entry.material.uniforms.uTex.value = texture;
          req.entry.status = "loaded";
          tileLayerStats.loaded++;
          tileLayerStats.cacheSize = textureCache.size;
          pump();
        })
        .catch((err) => {
          inFlightRef.current--;
          tileLayerStats.inFlight = inFlightRef.current;
          if (req.entry.cancelled) {
            pump();
            return;
          }
          if (err?.name !== "AbortError") {
            req.entry.status = "error";
            tileLayerStats.failed++;
          } else {
            tileLayerStats.aborted++;
          }
          pump();
        });
    }
  }

  function removeRole(roleId: string): void {
    const role = rolesRef.current.get(roleId);
    if (!role) return;
    for (const entry of role.entries.values()) disposeEntry(entry);
    role.group.parent?.remove(role.group);
    rolesRef.current.delete(roleId);
    useGlobe.getState().setStatus(role.catalogEntry.id as StatusKey, undefined);
  }

  function ensureRole(roleId: string, catalogId: string, shader: "day" | "plain", opacity: number): void {
    const catalogEntry = GIBS_CATALOG[catalogId];
    if (!catalogEntry) {
      // Not one of this lane's verified catalog entries (a stray id in the
      // store, or a layer that failed its own curl check) — draw nothing
      // for it rather than requesting a URL nobody verified.
      removeRole(roleId);
      return;
    }
    let role = rolesRef.current.get(roleId);
    if (!role || role.catalogEntry.id !== catalogEntry.id) {
      removeRole(roleId);
      const group = new THREE.Group();
      groupRef.current.add(group);
      role = { role: roleId, catalogEntry, shader, opacity, group, entries: new Map(), liveGeneration: 0, pendingGeneration: null, transitionStart: null, generationCounter: 0, subdailyBackoffSteps: 0 };
      rolesRef.current.set(roleId, role);
    }
    role.opacity = opacity;
  }

  function recomputeRole(role: RoleState): void {
    const fovRadians = (camera as THREE.PerspectiveCamera).fov ? (((camera as THREE.PerspectiveCamera).fov * Math.PI) / 180) : 0.7;
    const matrixSet = role.catalogEntry.matrixSet as TileMatrixSetId;
    const maxLevel = Math.min(role.catalogEntry.maxLevel, TILE_MATRIX_SETS[matrixSet].maxLevel);
    const cam = {
      position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
      forward: { x: scratchForward.current.x, y: scratchForward.current.y, z: scratchForward.current.z },
      fovRadians,
      canvasHeightPx: size.height,
    };
    // LANE V1 (wave 7, step B): EOX's s2cloudless base rides a genuinely
    // different tile matrix (tileMatrix.ts's own EOX_LEVELS, 256px tiles) —
    // tileSelect.ts's shared `selectVisibleTiles` always reads GIBS_LEVELS
    // (a file this lane doesn't own, see tileSelectEox.ts's own header), so
    // "WGS84" is the one matrixSet routed to this lane's own EOX-scoped
    // selector instead.
    const selected = matrixSet === "WGS84" ? selectVisibleEoxTiles(maxLevel, cam) : selectVisibleTiles(matrixSet, maxLevel, cam);

    const newKeys = new Set(selected.map((t) => t.key));
    const currentGenKeys = new Set(
      [...role.entries.values()].filter((e) => e.generation === (role.pendingGeneration ?? role.liveGeneration)).map((e) => e.tile.key),
    );
    let same = newKeys.size === currentGenKeys.size;
    if (same) for (const k of newKeys) if (!currentGenKeys.has(k)) { same = false; break; }
    const frame = catalogDate(role.catalogEntry, now);
    if (same && frame === role.frame) return;
    if (frame !== role.frame) {
      for (const entry of role.entries.values()) disposeEntry(entry);
      role.entries.clear();
      role.subdailyBackoffSteps = 0;
    }
    role.frame = frame;
    role.displayedFrame = frame;
    useGlobe.getState().setStatus(role.catalogEntry.id as StatusKey, { state: "loading" });

    const nextGeneration = ++role.generationCounter;
    const date = now;

    // A previous pending generation that never finished loading is
    // superseded before it ever went live: cancel and drop its own
    // not-yet-settled entries outright (they never showed anything).
    if (role.pendingGeneration !== null) {
      for (const [key, entry] of role.entries) {
        if (entry.generation === role.pendingGeneration && entry.status === "loading" && !newKeys.has(key)) {
          disposeEntry(entry);
          role.entries.delete(key);
        }
      }
    }

    for (const tile of selected) {
      const existing = role.entries.get(tile.key);
      if (existing) {
        // Already on screen (reused across the recompute, e.g. a small pan):
        // just relabel it into the new generation instead of rebuilding it.
        existing.generation = nextGeneration;
        continue;
      }
      // A coarse tile's fixed 16-cell grid bowed through the base sphere,
      // exposing alternating dark triangles on phones. At most 2 degrees
      // per edge keeps every chord outside the base at TILE_RADIUS.
      const b = tile.bounds;
      const segments = Math.max(TILE_SEGMENTS, Math.ceil(Math.max(b.lat0 - b.lat1, b.lon1 - b.lon0) / 2));
      const geometry = buildTilePatchGeometry(b, TILE_RADIUS, segments);
      // Edge tiles retain their full image footprint beyond +/-180, +/-90.
      // Clip the mesh and its UVs together; never stretch padding over Earth.
      const levels = role.catalogEntry.matrixSet === "WGS84" ? EOX_LEVELS : GIBS_LEVELS;
      const uScale = (b.lon1 - b.lon0) / lonStepDeg(tile.level, levels);
      const vScale = (b.lat0 - b.lat1) / latStepDeg(tile.level, levels);
      const uv = geometry.getAttribute("uv");
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * uScale, uv.getY(i) * vScale);
      // Always the same uniform SHAPE regardless of shader variant (the
      // plain overlay fragment shader just never references uSun) — three
      // only binds what a compiled program actually declared, and this
      // keeps one object shape instead of a union TypeScript can't reduce
      // to THREE.ShaderMaterialParameters['uniforms'].
      const uniforms = { uSun: { value: sunRef.current }, uTex: { value: null as THREE.Texture | null }, uOpacity: { value: 0 } };
      const material = new THREE.ShaderMaterial({
        vertexShader: VERT,
        // JPEG reflectance swath gaps are opaque black. Let the permanent
        // whole-globe photo fill those just as it fills PNG alpha gaps.
        fragmentShader: role.shader === "day" ? (role.catalogEntry.dateRule.kind === "daily"
          ? TILE_FRAG_DAY.replace("tex.a * uOpacity * lit", "tex.a * uOpacity * lit * smoothstep(0.001, 0.01, dot(tex.rgb, vec3(0.299, 0.587, 0.114)))")
          : TILE_FRAG_DAY) : TILE_FRAG_PLAIN,
        uniforms,
        transparent: true,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geometry, material);
      role.group.add(mesh);
      const entry: TileEntry = { tile, mesh, material, geometry, texture: null, status: "loading", generation: nextGeneration, cancelled: false };
      role.entries.set(tile.key, entry);

      const cached = textureCache.get(tileUrl(role.catalogEntry, tile.level, tile.row, tile.col, date));
      if (cached) {
        entry.texture = cached;
        entry.material.uniforms.uTex.value = cached;
        entry.status = "loaded";
        continue;
      }
      tileLayerStats.requested++;
      const controller = new AbortController();
      queueRef.current.push({ entry, url: tileUrl(role.catalogEntry, tile.level, tile.row, tile.col, date), controller });
    }

    // Anything left over that isn't in this generation and isn't the
    // current live generation either is an orphan from an even older,
    // already-superseded pending wave — drop it immediately, it was never
    // shown.
    for (const [key, entry] of role.entries) {
      if (entry.generation !== nextGeneration && entry.generation !== role.liveGeneration) {
        disposeEntry(entry);
        role.entries.delete(key);
      }
    }

    role.pendingGeneration = nextGeneration;
    role.transitionStart = null;
    pump();
  }

  /** LANE V1 (wave 7, step A): re-requests a `subdaily` role's just-failed
   *  frame at a stepped-back time — SAME row/col/level (a 404'd timestamp
   *  doesn't change what's on screen, only when the requested frame is), so
   *  this reuses the existing mesh/geometry/material for each tile rather
   *  than tearing down and rebuilding what recomputeRole would (recomputeRole
   *  itself can't be reused for this: its own "did the tile KEY set change"
   *  dedup — tileKey has no time component — would see the identical
   *  row/col/level set and bail out as "nothing changed", never reissuing
   *  the fetch at the new time). */
  function retrySubdailyRole(role: RoleState, effectiveNow: Date): void {
    role.displayedFrame = catalogDate(role.catalogEntry, effectiveNow);
    const nextGeneration = ++role.generationCounter;
    for (const entry of role.entries.values()) {
      if (entry.generation !== role.pendingGeneration) continue;
      entry.generation = nextGeneration;
      entry.status = "loading";
      tileLayerStats.requested++;
      const controller = new AbortController();
      queueRef.current.push({ entry, url: tileUrl(role.catalogEntry, entry.tile.level, entry.tile.row, entry.tile.col, effectiveNow), controller });
    }
    role.pendingGeneration = nextGeneration;
    role.transitionStart = null;
    pump();
  }

  useFrame(({ clock }) => {
    const group = groupRef.current;
    if (!group) return;

    // Sun direction only actually changes when `now` changes (an effect,
    // not per frame); every tile's uSun is the SAME shared vector object, so
    // this is a reference each frame costs nothing to hand out again.
    camera.getWorldDirection(scratchForward.current);

    // Rate-limited throttle (module doc comment on RECOMPUTE_MIN_INTERVAL_MS):
    // re-walk tile selection only when the camera moved/turned past the
    // epsilon AND enough wall-clock time has passed since the last actual
    // recompute — the epsilon alone isn't enough during sustained motion
    // (see that comment for why a "wait until idle" debounce has a bootstrap
    // bug here instead).
    const nowMs = clock.elapsedTime * 1000;
    const moved = camera.position.distanceTo(lastCamPos.current) > RECOMPUTE_DISTANCE_EPS;
    const turnedCos = lastCamForward.current.lengthSq() === 0 ? -1 : lastCamForward.current.dot(scratchForward.current);
    const turned = turnedCos < RECOMPUTE_ANGLE_COS_EPS;
    // perf.md fetch-race fix: `moved` is true on frame 1 regardless (camera
    // hasn't left its Infinity-sentinel start), so gating on `earthReady`
    // here alone is enough — the first real recompute (and its fetches)
    // simply waits for the base sphere's own load to settle first, no extra
    // effect/timer needed to "wake up" once it does.
    if (earthReady && (moved || turned) && nowMs - lastRecomputeAtMs.current >= RECOMPUTE_MIN_INTERVAL_MS) {
      const t0 = performance.now();
      for (const role of rolesRef.current.values()) recomputeRole(role);
      tileLayerStats.lastRecomputeMs = performance.now() - t0;
      lastCamPos.current.copy(camera.position);
      lastCamForward.current.copy(scratchForward.current);
      lastRecomputeAtMs.current = nowMs;
    }

    // Crossfade + settle check, every frame regardless of whether a
    // recompute ran (an in-flight generation can finish loading on any
    // frame, not just the one that requested it).
    for (const role of rolesRef.current.values()) {
      if (role.pendingGeneration !== null && role.transitionStart === null) {
        let allSettled = true;
        const pendingEntries: TileEntry[] = [];
        for (const entry of role.entries.values()) {
          if (entry.generation !== role.pendingGeneration) continue;
          pendingEntries.push(entry);
          if (entry.status === "loading") allSettled = false;
        }
        if (allSettled) {
          const dateRule = role.catalogEntry.dateRule;
          if (dateRule.kind === "subdaily" && pendingEntries.length > 0 && !pendingEntries.some((e) => e.status === "loaded")) {
            // LANE V1 (wave 7, step A): every tile of this frame errored (a
            // 404, "this timestamp isn't published yet", not a partial
            // network hiccup — a partial failure already reads honestly
            // through the ordinary per-tile blank-on-error path below) — step
            // back and retry, up to MAX_SUBDAILY_BACKOFF_STEPS times, before
            // giving up and reporting the feed unavailable. Never promotes
            // this failed generation to `liveGeneration`, so nothing but a
            // blank tile is ever shown for it — no stale frame, silently or
            // otherwise.
            if (role.subdailyBackoffSteps < MAX_SUBDAILY_BACKOFF_STEPS) {
              role.subdailyBackoffSteps++;
              const effectiveNow = new Date(now.getTime() - role.subdailyBackoffSteps * dateRule.stepMin * 60_000);
              retrySubdailyRole(role, effectiveNow);
              continue; // this role's frame isn't settled yet — re-enter next frame
            }
            useGlobe.getState().setStatus(role.catalogEntry.id as StatusKey, { state: "failed", detail: "feed unavailable" });
          } else if (pendingEntries.length > 0) {
            const failed = pendingEntries.some((entry) => entry.status === "error");
            role.subdailyBackoffSteps = 0;
            useGlobe.getState().setStatus(role.catalogEntry.id as StatusKey, failed
              ? { state: "failed", detail: pendingEntries.some((entry) => entry.status === "loaded") ? "some tiles unavailable" : "feed unavailable" }
              : { state: "live", detail: role.displayedFrame });
          }
          role.transitionStart = reducedMotion ? nowMs - FADE_MS : nowMs;
        }
      }

      if (role.transitionStart !== null) {
        const t = Math.min(1, (nowMs - role.transitionStart) / FADE_MS);
        for (const entry of role.entries.values()) {
          if (entry.generation === role.liveGeneration) {
            entry.material.uniforms.uOpacity.value = (1 - t) * role.opacity;
          } else if (entry.generation === role.pendingGeneration) {
            entry.material.uniforms.uOpacity.value = entry.status === "loaded" ? t * role.opacity : 0;
          }
        }
        if (t >= 1) {
          for (const [key, entry] of role.entries) {
            if (entry.generation === role.liveGeneration) {
              disposeEntry(entry);
              role.entries.delete(key);
            }
          }
          role.liveGeneration = role.pendingGeneration!;
          role.pendingGeneration = null;
          role.transitionStart = null;
        }
      } else {
        // Steady state: no transition in flight, live tiles just carry the
        // current opacity slider value (overlay opacity can change without
        // any tile selection change).
        for (const entry of role.entries.values()) {
          if (entry.generation === role.liveGeneration && entry.status === "loaded") entry.material.uniforms.uOpacity.value = role.opacity;
        }
      }
    }

    tileLayerStats.roles = rolesRef.current.size;
    let cacheSize = 0;
    for (const role of rolesRef.current.values()) cacheSize += role.entries.size;
    tileLayerStats.cacheSize = textureCache.size;
    void cacheSize;

    // LANE C2 (X-ray mode): skipped entirely while nobody is looking (see
    // drawnTileSet's own doc comment) — while it IS enabled this allocates a
    // small object per visible tile every frame, which is fine for a debug
    // overlay (at most a few hundred tiles, MAX_SELECTED_TILES-capped per
    // role) but deliberately not paid by every other visitor.
    if (drawnTileSet.enabled) {
      const out = drawnTileSet.tiles;
      out.length = 0;
      for (const role of rolesRef.current.values()) {
        for (const entry of role.entries.values()) {
          if (entry.status !== "loaded") continue;
          const opacity = entry.material.uniforms.uOpacity.value as number;
          if (opacity <= 0) continue;
          out.push({ key: entry.tile.key, role: role.role, level: entry.tile.level, bounds: entry.tile.bounds, status: "loaded", opacity });
        }
      }
    }
  });

  // Keeping roles in sync with the store is a genuine (if infrequent) event,
  // not a per-frame concern — a visitor picking a base layer or toggling an
  // overlay, not a camera tick — so this belongs in an effect, not useFrame.
  useEffect(() => {
    const wantedRoleIds = new Set<string>(["base", ...imagery.overlays.map((o) => `overlay:${o.id}`)]);
    for (const roleId of [...rolesRef.current.keys()]) {
      if (!wantedRoleIds.has(roleId)) removeRole(roleId);
    }
    ensureRole("base", imagery.base, "day", 1);
    for (const overlay of imagery.overlays) ensureRole(`overlay:${overlay.id}`, overlay.id, "plain", overlay.opacity);
    // Force a recompute next frame for any role whose tile set might now be
    // stale (a fresh role, or an existing one whose catalog id changed) — a
    // user-initiated layer change gets no rate-limit delay, only sustained
    // camera motion does.
    lastCamPos.current.set(Infinity, Infinity, Infinity);
    lastRecomputeAtMs.current = -Infinity;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ensureRole/recomputeRole close over refs, not props; imagery is the real dependency.
  }, [imagery]);

  return <group ref={groupRef} />;
}
