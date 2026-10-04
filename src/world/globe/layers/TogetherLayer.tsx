import { useCallback, useEffect, useRef, useState } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { GLOBE_RADIUS, latLonToXyz, xyzToLatLon } from "../geoMath.ts";
import { useGlobe } from "../globeStore.ts";
import { useReducedMotion } from "../../../SceneActivity.tsx";
import { useTogetherPresence } from "../togetherPresence.ts";
import { GLIDE_MS, MAX_RENDERED, hoverLabel, interpolateLatLon, quantizeLatLon, shouldPublish, zoomBucket, type ViewPresence } from "../together.ts";
import { publish } from "../feed.ts"; // WAVE 6 LANE X1 (live world feed)

/**
 * WAVE 5 LANE W15 (together: anonymous live viewports of other explorers,
 * living-earth lanes doc's Wave 2/5 addendum). Publishes THIS tab's own
 * camera-centre direction (quantized 3 degrees), a coarse zoom bucket and
 * the view mode on `globe-view-v1` (togetherPresence.ts) -- never a
 * location, never an identity, never presenceGeo.ts's country. Draws every
 * OTHER explorer's published reading as a soft breathing ring at their
 * view centre, capped at MAX_RENDERED, with a short gliding trail. Click
 * flies the camera to look where they look; hover names the nearest
 * centroid (never their real location, which this component never sees --
 * only the already-quantized reading everyone on the channel reads).
 *
 * Per-tier cost (both tiers this ever mounts at -- GlobeScene.tsx gates
 * T3 out entirely, `layers.together && live && tier !== 3`): one
 * InstancedMesh (rings) and one LineSegments (trails) draw call total,
 * regardless of how many of the capped MAX_RENDERED=12 peers are live.
 * `useFrame` drives interpolation and the one hidden-DOM publish/render
 * count dataset (e2e seam); nothing here polls -- new peers arrive purely
 * from `usePresence`'s own live snapshot.
 */

const RETICLE_COLOR = new THREE.Color("#c9d4d0"); // ambient neutral -- SatelliteLayer.tsx's own AMBIENT_COLOR, restated: this is an ambient scene element, never a brand token (house rule), and the brief itself asks for "calm neutral tone (not brand colours)".
const RING_OUTER_RADIUS = 0.115;
const RING_GEOMETRY = new THREE.RingGeometry(0.085, RING_OUTER_RADIUS, 32);
// A filled disc, invisible (opacity 0, not `visible={false}` -- three still
// raycasts a visible-but-transparent mesh, which is the whole point) and
// bigger than the ring it sits over: quakeGlyphs.tsx's own HIT_GEOMETRY,
// restated for the identical reason -- the ring is a thin annulus with a
// genuine hole in the middle, so raycasting the visual glyph directly means
// a click aimed at its own centre (exactly where the e2e probe below and a
// real pointer both naturally aim) lands in that hole and hits nothing.
const HIT_GEOMETRY = new THREE.CircleGeometry(1, 16);
const HIT_RADIUS_MULTIPLIER = 1.8; // generous tap target beyond the ring's own thin annulus
// Pune declutter (P4, wave 9): this used to be 0.02, the exact same height
// as familyCiRing.tsx's and reachAppRing.tsx's own old surface epsilons -
// three translucent rings sharing one height above the globe is what the
// design/perf audits saw as a green/magenta moire directly over Pune. This
// reticle layer is the highest, most-active step of the five-layer stack
// (reachAppRing.tsx's own comment carries the full ordering: 0.008 <
// 0.016 < 0.024 < 0.032 < this 0.04) - a live "someone else is looking
// here" glyph reads best floating just above the calmer, static rings
// underneath it.
export const RING_LIFT = 0.04;
const dummy = new THREE.Object3D();

const SCALE_BY_ZOOM: Record<ViewPresence["zoom"], number> = { close: 0.68, region: 1, orbit: 1.32 };
const BREATHE_SPEED = 1.6; // radians/second
const BREATHE_AMOUNT = 0.16;

const TRAIL_POINTS = 4; // current + 3 history samples
const TRAIL_SEGMENTS = TRAIL_POINTS - 1;
const TRAIL_SAMPLE_MS = 450;
const TRAIL_VERT_COUNT = MAX_RENDERED * TRAIL_SEGMENTS * 2;

// Module-scope scratch (Ghosts.tsx's own `dummy` pattern): the ray/sphere
// used every frame to find where the camera is actually looking on the
// globe, reused rather than reallocated per frame.
const viewRay = new THREE.Ray();
const viewSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), GLOBE_RADIUS);
const viewDir = new THREE.Vector3();
const viewHit = new THREE.Vector3();
const ringUp = new THREE.Vector3(0, 0, 1);
const ringNormal = new THREE.Vector3();
const ringQuat = new THREE.Quaternion();
const screenScratch = new THREE.Vector3();

// Module-level, like RING_GEOMETRY above (Ghosts.tsx's cartGeometry /
// ArcLayer.tsx's DASH_GEOMETRY make the identical choice): there is
// exactly one globe on screen, so one shared, never-rebuilt buffer for
// every peer's trail is simpler than a per-mount useMemo -- and it sidesteps
// React Compiler's immutability rule entirely (a useMemo-returned geometry
// is treated as a frozen render output; mutating its Float32Array in place
// every frame, which this layer must do to stay allocation-free, is exactly
// what that rule flags. A plain module binding isn't tracked by the
// compiler at all, the same reason `dummy` above is mutated freely).
const TRAIL_GEOMETRY = new THREE.BufferGeometry();
TRAIL_GEOMETRY.setAttribute("position", new THREE.BufferAttribute(new Float32Array(TRAIL_VERT_COUNT * 3), 3));
TRAIL_GEOMETRY.setAttribute("color", new THREE.BufferAttribute(new Float32Array(TRAIL_VERT_COUNT * 3), 3));
TRAIL_GEOMETRY.setDrawRange(0, 0);
const trailPosArray = TRAIL_GEOMETRY.attributes.position.array as Float32Array;
const trailColorArray = TRAIL_GEOMETRY.attributes.color.array as Float32Array;

interface PeerTrail {
  from: { lat: number; lon: number };
  target: ViewPresence;
  glideMs: number;
  history: { lat: number; lon: number }[];
  sinceSampleMs: number;
}

interface InstanceMeta {
  key: string;
  view: ViewPresence;
}

function surfaceDistance(cameraPos: THREE.Vector3): number {
  return cameraPos.length() - GLOBE_RADIUS;
}

/** A fresh (non-scratch) tuple -- only ever called from render (the
 *  tooltip position below), never per-frame, so a small allocation here is
 *  fine (ArcLayer.tsx's own arcPoint return makes the identical trade). */
function scaledXyz(lat: number, lon: number, radius: number): [number, number, number] {
  const p = latLonToXyz(lat, lon);
  return [p.x * radius, p.y * radius, p.z * radius];
}

function samePresence(a: ViewPresence, b: ViewPresence): boolean {
  return a.lat === b.lat && a.lon === b.lon && a.zoom === b.zoom && a.mode === b.mode;
}

export default function TogetherLayer({ tier: _tier }: { tier: 1 | 2 | 3 }) {
  const reducedMotion = useReducedMotion();
  const presence = useTogetherPresence();
  const entries = presence.rendered;

  const domRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<THREE.InstancedMesh>(null);
  const hitRef = useRef<THREE.InstancedMesh>(null);
  const trailRef = useRef<THREE.LineSegments>(null);
  const trailMap = useRef(new Map<string, PeerTrail>());
  // WAVE 6 LANE X1 (live world feed): true until the first sync effect has
  // run once, so the peers already on the channel at mount are a baseline,
  // not a burst of "N explorers joined" the instant this tab opens
  // (PulseLayer's own prevRef === null / ArcLayer's own seenCountriesRef
  // === null convention, restated for a Map that starts non-null but empty).
  const firstSyncRef = useRef(true);
  const metaRef = useRef<InstanceMeta[]>([]);
  const lastPublished = useRef<ViewPresence | null>(null);
  const sincePublishMs = useRef(0);
  // Counts every real publish regardless of domRef's own readiness (drei's
  // <Html> portal div doesn't exist yet on this component's very first
  // useFrame tick, so the unconditional first publish would otherwise be
  // silently lost from the e2e counter below even though it really went
  // out) -- mirrors ringCount's own "count in a ref, sync to the DOM every
  // frame" split a few lines down.
  const publishCount = useRef(0);
  // Holds the hovered peer's own key+view (not just an index): set only
  // from the pointer handlers below, so render never reads a ref's
  // `.current` (React Compiler's react-hooks/refs rule) to resolve it.
  const [hovered, setHovered] = useState<InstanceMeta | null>(null);

  // Sync trail state to the current entry list: a peer's first frame gets
  // a stationary trail (no glide-from-nowhere), a changed reading freezes
  // the CURRENT interpolated point as the new glide start (so a second
  // update arriving mid-glide never snaps), and a peer no longer present
  // is dropped so this Map never grows unbounded across a long session.
  useEffect(() => {
    const map = trailMap.current;
    const seen = new Set<string>();
    for (const [key, view] of entries) {
      seen.add(key);
      const existing = map.get(key);
      if (!existing) {
        map.set(key, { from: { lat: view.lat, lon: view.lon }, target: view, glideMs: GLIDE_MS, history: [{ lat: view.lat, lon: view.lon }], sinceSampleMs: 0 });
        if (!firstSyncRef.current) {
          publish({
            id: `together:${key}:${Date.now()}`,
            kind: "together",
            title: "An explorer joined",
            detail: hoverLabel(view),
            whenMs: Date.now(),
            source: "together presence channel",
            live: true,
            focus: { kind: "latlon", lat: view.lat, lon: view.lon },
            severity: "info",
          });
        }
        continue;
      }
      if (!samePresence(existing.target, view)) {
        const t = Math.min(1, existing.glideMs / GLIDE_MS);
        existing.from = interpolateLatLon(existing.from, existing.target, t);
        existing.target = view;
        existing.glideMs = 0;
      }
    }
    firstSyncRef.current = false;
    for (const key of Array.from(map.keys())) {
      if (!seen.has(key)) map.delete(key);
    }
  }, [entries]);

  // store.together.count / "N exploring with you" (a later UI lane's own
  // line) read the full, uncapped total -- never `entries.length`.
  useEffect(() => {
    const setCount = useGlobe.getState().setTogetherCount;
    const setStatus = useGlobe.getState().setStatus;
    setCount(presence.total);
    setStatus("together", presence.total > 0 ? { state: "live", detail: `${presence.total} other${presence.total === 1 ? "" : "s"} exploring now` } : { state: "live", detail: "just you right now" });
  }, [presence.total]);

  // e2e-only seam (togetherPresence.ts's own comment): stands in for the
  // sharing toggle the UI lane still owns, so "turning sharing off stops
  // publishing" is provable without that toggle existing yet.
  useEffect(() => {
    window.__GLOBE_TOGETHER_SET_SHARING__ = (sharing: boolean) => useGlobe.getState().setTogetherSharing(sharing);
    return () => {
      delete window.__GLOBE_TOGETHER_SET_SHARING__;
    };
  }, []);

  useFrame((state, dt) => {
    const { camera } = state;
    const dtMs = dt * 1000;

    // ---- publish this tab's own view: raycast the camera's own look
    // direction onto the globe sphere, which is exact for every view mode
    // (orbit always looks at the origin; ground/follow look wherever
    // CameraDirector.tsx points the camera) -- no per-view special case
    // needed. ----
    camera.getWorldDirection(viewDir);
    viewRay.origin.copy(camera.position);
    viewRay.direction.copy(viewDir);
    sincePublishMs.current += dtMs;
    if (viewRay.intersectSphere(viewSphere, viewHit)) {
      const ll = xyzToLatLon({ x: viewHit.x, y: viewHit.y, z: viewHit.z });
      const q = quantizeLatLon(ll.lat, ll.lon);
      const nextView: ViewPresence = { lat: q.lat, lon: q.lon, zoom: zoomBucket(surfaceDistance(camera.position)), mode: useGlobe.getState().view };
      const sharing = useGlobe.getState().together.sharing;
      const visible = typeof document === "undefined" || document.visibilityState === "visible";
      if (sharing && visible && shouldPublish(lastPublished.current, nextView, sincePublishMs.current)) {
        presence.publish(nextView);
        lastPublished.current = nextView;
        sincePublishMs.current = 0;
        publishCount.current += 1;
      }
    }
    // Synced every frame, not just on a fresh publish (ringCount/togetherCount
    // below make the identical choice): domRef.current is still null on this
    // component's very first tick (drei's <Html> portal mounts a frame late),
    // which would otherwise drop the unconditional first publish from this
    // counter forever rather than just delaying it one frame.
    if (domRef.current) domRef.current.dataset.togetherPublishCount = String(publishCount.current);

    // ---- advance every live peer's glide + trail sample ----
    for (const t of trailMap.current.values()) {
      t.glideMs = Math.min(GLIDE_MS, t.glideMs + dtMs);
      t.sinceSampleMs += dtMs;
      if (t.sinceSampleMs >= TRAIL_SAMPLE_MS) {
        t.sinceSampleMs = 0;
        const current = reducedMotion ? t.target : interpolateLatLon(t.from, t.target, t.glideMs / GLIDE_MS);
        t.history.unshift(current);
        if (t.history.length > TRAIL_POINTS) t.history.length = TRAIL_POINTS;
      }
    }

    // ---- write ring instances + the one shared trail line buffer ----
    const ring = ringRef.current;
    const hit = hitRef.current;
    const line = trailRef.current;
    let ringCount = 0;
    let vertCount = 0;
    if (ring) {
      for (const [key, view] of entries) {
        const t = trailMap.current.get(key);
        if (!t) continue;
        const cur = reducedMotion ? t.target : interpolateLatLon(t.from, t.target, Math.min(1, t.glideMs / GLIDE_MS));
        const p = latLonToXyz(cur.lat, cur.lon);
        const r = GLOBE_RADIUS + RING_LIFT;
        ringNormal.set(p.x, p.y, p.z);
        ringQuat.setFromUnitVectors(ringUp, ringNormal);
        const breathe = reducedMotion ? 1 : 1 + Math.sin(state.clock.elapsedTime * BREATHE_SPEED + (key.charCodeAt(0) % 7) * 0.5) * BREATHE_AMOUNT;
        dummy.position.set(p.x * r, p.y * r, p.z * r);
        dummy.quaternion.copy(ringQuat);
        dummy.scale.setScalar(SCALE_BY_ZOOM[view.zoom] * breathe);
        dummy.updateMatrix();
        ring.setMatrixAt(ringCount, dummy.matrix);
        ring.setColorAt(ringCount, RETICLE_COLOR);
        metaRef.current[ringCount] = { key, view };

        if (hit) {
          dummy.scale.setScalar(SCALE_BY_ZOOM[view.zoom] * breathe * RING_OUTER_RADIUS * HIT_RADIUS_MULTIPLIER);
          dummy.updateMatrix();
          hit.setMatrixAt(ringCount, dummy.matrix);
        }

        // e2e-only probe (GlobeScene.tsx's own SceneRig / SkyLayer.tsx's
        // moon probe make the identical "project a known world point,
        // write the screen coords to a dataset" trade): the first live
        // reticle's CURRENT screen position, so a test can click it
        // without reimplementing this component's own projection math.
        if (ringCount === 0 && domRef.current) {
          screenScratch.copy(dummy.position).project(camera);
          domRef.current.dataset.togetherFirstX = String(Math.round((screenScratch.x * 0.5 + 0.5) * state.size.width));
          domRef.current.dataset.togetherFirstY = String(Math.round((-screenScratch.y * 0.5 + 0.5) * state.size.height));
        }

        // Trail: history is most-recent-first, so segment s joins point s
        // to point s+1, fading toward the oldest sample.
        for (let s = 0; s < t.history.length - 1 && vertCount < TRAIL_VERT_COUNT; s++) {
          const a = latLonToXyz(t.history[s].lat, t.history[s].lon);
          const b = latLonToXyz(t.history[s + 1].lat, t.history[s + 1].lon);
          const fadeA = 1 - s / TRAIL_SEGMENTS;
          const fadeB = 1 - (s + 1) / TRAIL_SEGMENTS;
          const base = vertCount * 3;
          trailPosArray[base] = a.x * r;
          trailPosArray[base + 1] = a.y * r;
          trailPosArray[base + 2] = a.z * r;
          trailColorArray[base] = RETICLE_COLOR.r * fadeA;
          trailColorArray[base + 1] = RETICLE_COLOR.g * fadeA;
          trailColorArray[base + 2] = RETICLE_COLOR.b * fadeA;
          trailPosArray[base + 3] = b.x * r;
          trailPosArray[base + 4] = b.y * r;
          trailPosArray[base + 5] = b.z * r;
          trailColorArray[base + 3] = RETICLE_COLOR.r * fadeB;
          trailColorArray[base + 4] = RETICLE_COLOR.g * fadeB;
          trailColorArray[base + 5] = RETICLE_COLOR.b * fadeB;
          vertCount += 2;
        }
        ringCount++;
      }
      metaRef.current.length = ringCount;
      ring.count = ringCount;
      ring.instanceMatrix.needsUpdate = true;
      if (ring.instanceColor) ring.instanceColor.needsUpdate = true;
      if (hit) {
        hit.count = ringCount;
        hit.instanceMatrix.needsUpdate = true;
        // three's own InstancedMesh.raycast() computes (and permanently
        // CACHES) boundingSphere lazily on its first call, from whatever
        // instance matrices exist AT THAT MOMENT (its own doc comment:
        // "you may need to recompute the bounding sphere if an instance is
        // transformed via setMatrixAt"). Since this layer is React.lazy
        // -loaded, there is a real window where the canvas already takes
        // pointer events (other layers mounted) before this component's
        // first useFrame tick has ever run -- an incidental pointermove
        // anywhere on the canvas in that window locks in a bounding sphere
        // built from the mesh's still-default identity matrices (all
        // instances at the origin), and every later raycast at the real,
        // correct position then fails the coarse sphere pre-check forever,
        // for the rest of that page session. Recomputing every frame (12
        // instances max, negligible) means the cached sphere is always
        // built from the CURRENT real matrices by the time any raycast
        // reads it.
        hit.computeBoundingSphere();
      }
    }
    if (line) {
      TRAIL_GEOMETRY.attributes.position.needsUpdate = true;
      TRAIL_GEOMETRY.attributes.color.needsUpdate = true;
      TRAIL_GEOMETRY.setDrawRange(0, vertCount);
    }
    if (domRef.current) domRef.current.dataset.togetherCount = String(ringCount);
  });

  // instanceId -> the meta object THAT FRAME's useFrame pass just wrote
  // (metaRef.current is only ever read inside an event handler here, never
  // during render -- React Compiler's react-hooks/refs rule flags a ref
  // read at render time, not one inside a handler).
  const onPointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (e.instanceId == null) return;
    const meta = metaRef.current[e.instanceId];
    if (!meta) return;
    setHovered((prev) => (prev?.key === meta.key ? prev : meta));
  }, []);
  const onPointerOut = useCallback(() => setHovered(null), []);
  const onClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.instanceId == null) return;
    const meta = metaRef.current[e.instanceId];
    if (!meta) return;
    useGlobe.getState().flyTo({ kind: "latlon", lat: meta.view.lat, lon: meta.view.lon });
  }, []);

  // Recomputed from `hovered` state directly (no ref reads) -- cheap
  // enough (one latLonToXyz call) that a plain render-time value beats the
  // useMemo ceremony for something this small (ladder: shortest diff wins).
  const hoveredPos = hovered ? scaledXyz(hovered.view.lat, hovered.view.lon, GLOBE_RADIUS + RING_LIFT + 0.05) : null;

  return (
    <group>
      {/* Test/tooling seam only -- zero footprint, never painted. Total is
          the full live count (store.together.count's own source); count is
          the capped, actually-rendered number e2e asserts reticles against;
          togetherPublishCount is e2e's spy on this tab's own publish gate. */}
      <Html style={{ display: "none" }}>
        <div ref={domRef} data-together-layer data-together-total={presence.total} aria-hidden />
      </Html>
      <instancedMesh ref={ringRef} args={[RING_GEOMETRY, undefined, MAX_RENDERED]} frustumCulled={false} renderOrder={4}>
        {/* Highest step of the Pune ring stack (reachAppRing.tsx's own
            comment has the full ordering) - depthWrite was already false;
            polygonOffset is new, matching every other layer in the stack. */}
        <meshBasicMaterial color={RETICLE_COLOR} transparent opacity={0.8} side={THREE.DoubleSide} toneMapped={false} depthWrite={false} polygonOffset polygonOffsetFactor={-4} polygonOffsetUnits={-4} />
      </instancedMesh>
      {/* Invisible, generously-sized hit target over each ring (see
          HIT_GEOMETRY's own comment) -- this is what actually owns the
          pointer handlers; the ring above is purely visual. */}
      <instancedMesh ref={hitRef} args={[HIT_GEOMETRY, undefined, MAX_RENDERED]} frustumCulled={false} renderOrder={4} onPointerMove={onPointerMove} onPointerOut={onPointerOut} onClick={onClick}>
        <meshBasicMaterial transparent opacity={0} depthWrite={false} depthTest={false} side={THREE.DoubleSide} />
      </instancedMesh>
      <lineSegments ref={trailRef} geometry={TRAIL_GEOMETRY} frustumCulled={false} renderOrder={4}>
        <lineBasicMaterial vertexColors transparent opacity={0.5} toneMapped={false} depthWrite={false} />
      </lineSegments>
      {hovered && hoveredPos && (
        <Html position={hoveredPos} center distanceFactor={10} style={{ pointerEvents: "none" }}>
          <div
            data-together-tooltip
            style={{ background: "rgba(10,13,12,0.85)", color: "#c9d4d0", padding: "4px 8px", borderRadius: 6, fontSize: 12, whiteSpace: "nowrap", fontFamily: "inherit" }}
          >
            {hoverLabel(hovered.view)}
          </div>
        </Html>
      )}
    </group>
  );
}
