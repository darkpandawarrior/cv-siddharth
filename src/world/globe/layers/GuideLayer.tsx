// LANE T1 ("My Maps places"): the owner's Google Maps Local Guide
// contributions, city level only. One InstancedMesh for the resting ring
// (radius by sqrt(reviews + photos), clamped) plus one bigger, invisible hit
// mesh (same tap-target trick as quakeGlyphs.tsx/TogetherLayer.tsx: a thin
// annulus is a poor click target). A THIRD, small instanced mesh draws a
// second ring only over places that are also a life place (lifePlaces.ts),
// so a visitor can tell "somewhere I lived" from "somewhere I reviewed" at a
// glance. Every placement is recomputed only when the Time Machine crosses a
// calendar year (see `simYear` below) — not per frame, not on every offset
// tick, so scrubbing still costs nothing per animation frame.
//
// S4: contribution rings scale by the fraction of recorded active years
// reached by the Time Machine, not reconstructed per-year totals. Maps
// community Q&A and automated-prompt answers remain separate counts. The
// Spain marker comes from career-ops-hq's own country-level location field.
// Pune's inspector shows public GitHub activity by IST hour only when at
// least five valid event timestamps exist.
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { GLOBE_RADIUS, latLonToXyz } from "../geoMath.ts";
import { readColor } from "../../../themeColorThree.ts";
import { readToken } from "../../../themeColor.ts";
import { sceneHandles, simTime, useGlobe } from "../globeStore.ts";
import { lifePlaces, lifePlaceGeo } from "../../../data/profile/lifePlaces.ts";
import { mapsExport, mapsPhotos, mapsPlaces, mapsReviews, mapsTotals } from "../../../data/generated/mapsPlaces.ts";
import { upstreamMergedPRs } from "../../../data/profile/openSource.ts";
import { upstreamStars } from "../../../data/careerOpsUpstream.ts";
import { useLiveSignal } from "../../../lib/useLiveSignal.ts";
import type { GithubActivity } from "../../../../api/_lib/github-activity-handler.ts";
import { localGuide } from "../../../data/profile/localGuide.ts";
import { guideMedia, guideReviewSelection } from "./guideReviewSelection.ts";
import { scaleForYear, hourHistogram } from "./guideActivity.ts";
import { claimGuideClick, registerGuideClickTargets, type GuideClickTarget, useMarkerClick } from "../useMarkerClick.ts";

const PIN_GEOMETRY = new THREE.SphereGeometry(0.018, 8, 6);
const PIN_HIT_GEOMETRY = new THREE.SphereGeometry(0.03, 8, 6);
const PIN_ZOOM_DISTANCE = 11.5;
const RING_GEOMETRY = new THREE.RingGeometry(0.72, 1, 28);
const LIFE_RING_GEOMETRY = new THREE.RingGeometry(1.25, 1.45, 28);
const HIT_GEOMETRY = new THREE.CircleGeometry(1, 16);
// City scale, not region scale: 1 world unit is ~1,062 km, so MAX_SCALE 0.2
// is a ~210 km ring. An earlier 0.42 (~450 km, with a ~700 km hit disc)
// read as a region and swallowed clicks on quakes across north India.
const MIN_SCALE = 0.07;
const MAX_SCALE = 0.2;
const HIT_RADIUS_MULTIPLIER = 1.3;
// Below every point entity (hexbin base 0.01, quake glyphs 0.015/0.02,
// launches 0.02), so a raycast reaches a quake or a launch before this
// static owner layer and they stay clickable where they overlap a city.
const LIFT = 0.008;
const UP = new THREE.Vector3(0, 0, 1);
const dummy = new THREE.Object3D();

function projectGuidePoint(slug: string): { x: number; y: number } | null {
  const p = slug === "career-ops-hq" ? CAREER_OPS_HQ : GUIDE_PLACES.find((p) => p.slug === slug) ?? mapsReviews.find((review) => review.id === slug);
  const { camera, canvas } = sceneHandles;
  if (!p || !camera || !canvas) return null;
  const xyz = latLonToXyz(p.lat, p.lon);
  const point = new THREE.Vector3(xyz.x, xyz.y, xyz.z).multiplyScalar(GLOBE_RADIUS + (slug.startsWith("review-") ? 0.06 : LIFT));
  if (point.dot(camera.position.clone().sub(point)) <= 0) return null;
  point.project(camera);
  if (point.z < -1 || point.z > 1) return null;
  const box = canvas.getBoundingClientRect();
  return { x: box.left + (point.x + 1) * box.width / 2, y: box.top + (1 - point.y) * box.height / 2 };
}

function scaleFor(reviews: number, photos: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.sqrt(reviews + photos) * 0.035));
}

// career-ops-hq is the only upstream org that self-publishes a location:
// `curl -s https://api.github.com/orgs/career-ops-hq` -> `location: "Spain"`
// (re-verified live 2026-09-30, this lane's session — sources-owner.md's own
// live check the same day). openMF publishes no `location` field at all
// (`null`), which is why it gets no marker here — that omission is the
// honesty guard, not a gap to "fix" by guessing Mifos's HQ from its blog
// URL. Spain is a COUNTRY the org published, not a city: this is a country
// centroid, not a city-level claim, and stays labelled that way in the
// inspector card. Same static-constant convention as `upstreamMergedPRs`/
// `mifosMergedPRs` (careerOpsUpstream.ts's own header) rather than a live
// fetch for one point that never moves.
const CAREER_OPS_HQ = { lat: 40.0, lon: -4.0 };
const ORG_MARKER_GEOMETRY = new THREE.RingGeometry(0.09, 0.14, 24);
const ORG_MARKER_HIT_GEOMETRY = new THREE.CircleGeometry(0.2, 16);

// LANE S4: recent-public-GitHub-activity-by-hour histogram (guideActivity.ts's
// hourHistogram), fed into Pune's own Inspector card via `Selection.spark`
// (the existing sparkline slot — no new UI component needed). Same POLL_MS
// neighbourhood as PulseLayer's other subscriber of this same URL:
// useLiveSignal's shared bus polls at the SMALLEST interval any mounted
// subscriber asks for, so this doesn't add a second origin request.
const ACTIVITY_POLL_MS = 60_000;

interface GuidePlace {
  slug: string;
  city: string;
  country: string;
  lat: number;
  lon: number;
  reviews: number;
  photos: number;
  photoViews: number;
  years: number[];
  isLifePlace: boolean;
  lifeLine?: string;
}

/** mapsPlaces plus any life place the generator found no Maps data for
 *  (none today — every lifePlaces.ts slug already has reviews or photos —
 *  but a future life place with no Maps activity must still draw a marker,
 *  per this lane's own brief). */
function buildGuidePlaces(): GuidePlace[] {
  const lifeBySlug = new Map(lifePlaces.map((p) => [p.slug, p]));
  const out: GuidePlace[] = mapsPlaces.map((p) => ({ ...p, isLifePlace: lifeBySlug.has(p.slug), lifeLine: lifeBySlug.get(p.slug)?.line }));
  const seen = new Set(out.map((p) => p.slug));
  for (const lp of lifePlaces) {
    if (seen.has(lp.slug)) continue;
    const geo = lifePlaceGeo(lp.slug);
    if (!geo) continue;
    out.push({ slug: lp.slug, city: lp.city, country: lp.country, lat: geo.lat, lon: geo.lon, reviews: 0, photos: 0, photoViews: 0, years: [], isLifePlace: true, lifeLine: lp.line });
  }
  return out;
}

const GUIDE_PLACES = buildGuidePlaces();

// Two cities close enough together (e.g. Pune and Mumbai, ~120km apart) can
// each earn a MAX_SCALE*HIT_RADIUS_MULTIPLIER hit-disc (up to ~276km radius)
// that reaches well past the other's own ring -- whichever disc the ray
// happens to graze marginally closer wins, even for a click aimed dead
// centre at the OTHER city. Capped once, at module load (GUIDE_PLACES is
// static), to at most half the gap to its nearest neighbour, so no two
// discs can ever swallow each other's centre.
const GUIDE_PLACE_WORLD_POS = GUIDE_PLACES.map((p) => {
  const xyz = latLonToXyz(p.lat, p.lon);
  return new THREE.Vector3(xyz.x, xyz.y, xyz.z).multiplyScalar(GLOBE_RADIUS + LIFT);
});
const GUIDE_PLACE_HIT_CAP = GUIDE_PLACE_WORLD_POS.map((pos, i) => {
  let nearest = Infinity;
  for (let j = 0; j < GUIDE_PLACE_WORLD_POS.length; j++) {
    if (j === i) continue;
    nearest = Math.min(nearest, pos.distanceTo(GUIDE_PLACE_WORLD_POS[j]));
  }
  return Number.isFinite(nearest) ? nearest * 0.45 : Infinity;
});

/** e2e-only read seam, same convention as HazardLayer's `__HAZARD_DEBUG__`
 *  and HistoryLayer's `__HISTORY_DEBUG__` (a plain global, not a DOM node —
 *  those files' own comments measured a chunk-budget regression from an
 *  `<Html>`-based seam on a lazy layer). Reading an undefined global is a
 *  no-op in production; nobody sets it outside a test. `scales` is keyed by
 *  `GuidePlace.slug` so a test can assert a specific city's ring grew or
 *  shrank without depending on instance order. */
declare global {
  interface Window {
    __GUIDE_DEBUG__?: {
      simYear: number;
      scales: Record<string, number>;
      statusDetail: string;
      orgMarker: { lat: number; lon: number };
      activityEvents: number;
      activityHistogram: number[] | null;
      face: (slug: string) => void;
      screenPoint: (slug: string) => { x: number; y: number } | null;
      /** The camera's own distance from the globe centre, right now -- a
       *  flyTo's dolly keeps looking straight at the target throughout its
       *  whole transition, so a target's own `screenPoint` can read as
       *  "stable" well before the distance animation actually finishes.
       *  e2e needs this second signal too, or it can click mid-flight. */
      cameraDistance: () => number | null;
      screenRadii: () => { horizontal: number; vertical: number } | null;
    };
  }
}

export default function GuideLayer(_props: { tier: 1 | 2 | 3 }) {
  const pinRef = useRef<THREE.InstancedMesh>(null);
  const pinHitRef = useRef<THREE.InstancedMesh>(null);
  const [hoverReview, setHoverReview] = useState<number | null>(null);
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const hitRef = useRef<THREE.InstancedMesh>(null);
  const lifeRef = useRef<THREE.InstancedMesh>(null);
  const orgRef = useRef<THREE.Mesh>(null);
  const orgHitRef = useRef<THREE.Mesh>(null);
  const select = useGlobe((s) => s.select);
  const markerClick = useMarkerClick(true);
  const setView = useGlobe((s) => s.setView);
  const probe = useMemo(() => readColor("--color-probe", "#5ee6ff"), []);
  const accent = useMemo(() => readColor("--color-accent", "#f2a13d"), []);
  const alt = useMemo(() => readColor("--color-alt", "#db61ff"), []);

  const lifeIndices = useMemo(() => GUIDE_PLACES.map((p, i) => (p.isLifePlace ? i : -1)).filter((i) => i >= 0), []);

  // The Time Machine's simulated instant, reduced to its calendar year — the
  // only unit `mapsPlaces[].years` and `mapsByYear` are recorded in. Rebuilds
  // fire only when this changes (a year boundary), not on every offset tick
  // during play: this layer's own header comment on "no per-frame
  // allocation" holds even while the scrubber is animating.
  const offset = useGlobe((s) => s.timeOffsetMin);
  const simYear = useMemo(() => simTime(offset).getFullYear(), [offset]);

  // sources-owner.md finding 3: the already-wired /api/github-activity feed
  // (PulseLayer.tsx polls it too; useLiveSignal's shared bus means this
  // second subscriber costs no extra request), bucketed by IST hour and fed
  // into Pune's own Inspector card as a `spark` series — see hourHistogram's
  // own honesty-guard comment for the >= 5-event gate.
  const { data: activity, error: activityError } = useLiveSignal<GithubActivity>("/api/github-activity", ACTIVITY_POLL_MS);
  const activityHistogram = useMemo(() => activityError || !activity?.connected ? null : hourHistogram(activity.items), [activity, activityError]);

  // Filled by the ring-building effect below, read by the debug-seam effect
  // further down: a ref, not state, so a 60s activity poll (which does not
  // change any ring) never re-triggers the GPU buffer uploads that effect
  // does — the two concerns (positions/scale vs. e2e visibility) stay on
  // their own update cadences.
  const scalesRef = useRef<Record<string, number>>({});
  const statusDetailRef = useRef("");

  useEffect(() => {
    const mesh = meshRef.current;
    const hit = hitRef.current;
    if (!mesh || !hit) return;
    const scales: Record<string, number> = {};
    for (let i = 0; i < GUIDE_PLACES.length; i++) {
      const p = GUIDE_PLACES[i];
      const xyz = latLonToXyz(p.lat, p.lon);
      const normal = new THREE.Vector3(xyz.x, xyz.y, xyz.z);
      dummy.position.copy(normal).multiplyScalar(GLOBE_RADIUS + LIFT);
      dummy.quaternion.setFromUnitVectors(UP, normal);
      const scale = scaleForYear(scaleFor, p.reviews, p.photos, p.years, simYear);
      scales[p.slug] = scale;
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, probe);
      dummy.scale.setScalar(Math.min(scale * HIT_RADIUS_MULTIPLIER, GUIDE_PLACE_HIT_CAP[i]));
      dummy.updateMatrix();
      hit.setMatrixAt(i, dummy.matrix);
    }
    mesh.count = GUIDE_PLACES.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    hit.count = GUIDE_PLACES.length;
    hit.instanceMatrix.needsUpdate = true;

    const life = lifeRef.current;
    if (life) {
      for (let n = 0; n < lifeIndices.length; n++) {
        const p = GUIDE_PLACES[lifeIndices[n]];
        const xyz = latLonToXyz(p.lat, p.lon);
        const normal = new THREE.Vector3(xyz.x, xyz.y, xyz.z);
        dummy.position.copy(normal).multiplyScalar(GLOBE_RADIUS + LIFT);
        dummy.quaternion.setFromUnitVectors(UP, normal);
        dummy.scale.setScalar(scaleFor(p.reviews, p.photos));
        dummy.updateMatrix();
        life.setMatrixAt(n, dummy.matrix);
        life.setColorAt(n, accent);
      }
      life.count = lifeIndices.length;
      life.instanceMatrix.needsUpdate = true;
      if (life.instanceColor) life.instanceColor.needsUpdate = true;
    }

    const org = orgRef.current;
    const orgHit = orgHitRef.current;
    if (org && orgHit) {
      const xyz = latLonToXyz(CAREER_OPS_HQ.lat, CAREER_OPS_HQ.lon);
      const normal = new THREE.Vector3(xyz.x, xyz.y, xyz.z);
      const worldPos = normal.clone().multiplyScalar(GLOBE_RADIUS + LIFT);
      const worldQuat = new THREE.Quaternion().setFromUnitVectors(UP, normal);
      org.position.copy(worldPos);
      org.quaternion.copy(worldQuat);
      orgHit.position.copy(worldPos);
      orgHit.quaternion.copy(worldQuat);
    }

    const notLive = simYear !== new Date().getFullYear();
    const statusDetail = `${localGuide.label} · ${mapsTotals.reviews} reviews, ${mapsTotals.photos} photos, ${mapsTotals.qaAnswers} Q&A answers, ${mapsTotals.answers} automated-prompt answers, Maps export ${mapsExport}${notLive ? ` · rings scaled by recorded active years through ${simYear} (computed, not contribution totals)` : ""}`;
    useGlobe.getState().setStatus("guide", { state: "snapshot", detail: statusDetail });
    scalesRef.current = scales;
    statusDetailRef.current = statusDetail;
    return () => useGlobe.getState().setStatus("guide", undefined);
  }, [probe, accent, lifeIndices, simYear]);

  // e2e-only debug seam (see the `__GUIDE_DEBUG__` declaration above): kept
  // in its own effect so an activity poll (up to every ACTIVITY_POLL_MS)
  // never re-triggers the ring-building effect's GPU buffer uploads above.
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.__GUIDE_DEBUG__ = {
      simYear,
      scales: scalesRef.current,
      statusDetail: statusDetailRef.current,
      orgMarker: CAREER_OPS_HQ,
      activityEvents: activity?.items.length ?? 0,
      activityHistogram,
      // Stage only the camera, never a selection: e2e must hit the real mesh.
      face: (slug) => {
        const p = slug === "career-ops-hq" ? CAREER_OPS_HQ : GUIDE_PLACES.find((p) => p.slug === slug) ?? mapsReviews.find((review) => review.id === slug);
        if (p) useGlobe.getState().flyTo({ kind: "latlon", lat: p.lat, lon: p.lon, distance: slug.startsWith("review-") ? 9.5 : 14 });
      },
      screenPoint: projectGuidePoint,
      cameraDistance: () => sceneHandles.camera?.position.length() ?? null,
      screenRadii: () => {
        const { camera, canvas } = sceneHandles;
        if (!camera || !canvas) return null;
        const centre = new THREE.Vector3().project(camera);
        const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar(GLOBE_RADIUS).project(camera);
        const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1).multiplyScalar(GLOBE_RADIUS).project(camera);
        const box = canvas.getBoundingClientRect();
        return { horizontal: Math.abs(right.x - centre.x) * box.width / 2, vertical: Math.abs(up.y - centre.y) * box.height / 2 };
      },
    };
  }, [simYear, activity, activityHistogram]);

  const selectCity = (i: number | undefined, event: { clientX: number; clientY: number }) => {
    if (i === undefined || !GUIDE_PLACES[i]) return;
    const p = GUIDE_PLACES[i];
    markerClick(event, () => {
      const photos = mapsPhotos.filter((ph) => ph.slug === p.slug);
      const notLive = simYear !== new Date().getFullYear();
      setView("orbit");
      select({
        id: `guide-place:${p.slug}`,
        kind: "guide-place",
        title: `${p.city}, ${p.country === "IN" ? "India" : p.country === "KW" ? "Kuwait" : p.country}`,
        rows: [
          { label: "Reviews", value: String(p.reviews) },
          { label: "Photos", value: String(p.photos) },
          { label: "Photo views", value: p.photoViews.toLocaleString("en-IN") },
          { label: "Years active", value: p.years.join(", ") || "Not recorded" },
          ...(notLive ? [{ label: "Ring shown", value: `recorded active years through ${simYear} (computed, not contribution totals)` }] : []),
          ...(p.isLifePlace && p.lifeLine ? [{ label: "Life", value: p.lifeLine, swatch: readToken("--color-accent", "#f2a13d") }] : []),
        ],
        source: `Google Maps Takeout, exported ${mapsExport} · city rings, reviewed public places at exact pins`,
        guide: { places: mapsReviews.filter((review) => review.slug === p.slug).sort((a, b) => b.month.localeCompare(a.month)) },
        live: false,
        focus: { kind: "latlon" as const, lat: p.lat, lon: p.lon, distance: 14 },
        media: photos.length > 0 ? guideMedia(photos) : undefined,
        ...(p.slug === "pune" && activityHistogram
          ? {
              spark: activityHistogram,
              sparkKind: "histogram" as const,
              sparkLabel: `recent public GitHub activity only, by IST hour of day (${activityHistogram.reduce((sum, count) => sum + count, 0)} events; latest ${new Date(Math.max(...(activity?.items ?? []).map((item) => Date.parse(item.at)).filter(Number.isFinite))).toISOString().slice(0, 10)}; not employer work)`,
            }
          : {}),
      });
    });
  };
  const onOrgClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    markerClick(e.nativeEvent, () => {
      setView("orbit");
      select({
        id: "guide-org:career-ops-hq",
        kind: "guide-org",
        title: "career-ops-hq · open source, out",
        rows: [
          { label: "Merged PRs", value: String(upstreamMergedPRs) },
          { label: "Upstream stars", value: upstreamStars },
          { label: "Location", value: "Spain · org-published location, not a person or office", swatch: readToken("--color-alt", "#db61ff") },
        ],
        source: "api.github.com/orgs/career-ops-hq, org-published location field · country level only · checked 2026-09-30",
        live: false,
        focus: { kind: "latlon" as const, lat: CAREER_OPS_HQ.lat, lon: CAREER_OPS_HQ.lon, distance: 14 },
      });
    });
  };
  const setCursor = (hover: boolean) => {
    document.body.style.cursor = hover ? "pointer" : "auto";
  };

  useEffect(() => {
    if (!pinRef.current || !pinHitRef.current) return;
    const colours = ["--color-danger", "--color-warn", "--color-accent", "--color-probe", "--color-alt"].map((token) => readColor(token, "#5ee6ff"));
    mapsReviews.forEach((review, i) => {
      const xyz = latLonToXyz(review.lat, review.lon);
      dummy.position.set(xyz.x, xyz.y, xyz.z).multiplyScalar(GLOBE_RADIUS + 0.06);
      dummy.quaternion.identity(); dummy.scale.setScalar(1); dummy.updateMatrix();
      pinRef.current!.setMatrixAt(i, dummy.matrix); pinHitRef.current!.setMatrixAt(i, dummy.matrix);
      pinRef.current!.setColorAt(i, colours[review.rating - 1]);
    });
    pinRef.current.instanceMatrix.needsUpdate = true;
    pinHitRef.current.instanceMatrix.needsUpdate = true;
    if (pinRef.current.instanceColor) pinRef.current.instanceColor.needsUpdate = true;
  }, []);
  useFrame(({ camera }) => {
    const visible = camera.position.length() < PIN_ZOOM_DISTANCE;
    if (pinRef.current) pinRef.current.visible = visible;
    if (pinHitRef.current) pinHitRef.current.visible = visible;
  });
  const selectReview = (i: number, event: { clientX: number; clientY: number }) => {
    const review = mapsReviews[i];
    if (review) markerClick(event, () => { setView("orbit"); select(guideReviewSelection(review)); useGlobe.getState().setSheet("inspector"); });
  };
  useEffect(() => registerGuideClickTargets(() => {
    if (useGlobe.getState().view !== "orbit") return [];
    const targets: GuideClickTarget[] = [];
    if ((sceneHandles.camera?.position.length() ?? Infinity) < PIN_ZOOM_DISTANCE) {
      mapsReviews.forEach((review, i) => {
        const point = projectGuidePoint(review.id);
        if (point) targets.push({ ...point, priority: 1, select: event => selectReview(i, event) });
      });
    }
    GUIDE_PLACES.forEach((place, i) => {
      const point = projectGuidePoint(place.slug);
      if (point) targets.push({ ...point, select: event => selectCity(i, event) });
    });
    return targets;
  }));
  const onClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    if (!claimGuideClick(event.nativeEvent)) selectCity(event.instanceId, event.nativeEvent);
  };
  const onReviewClick = (event: ThreeEvent<MouseEvent>) => {
    if (event.camera.position.length() >= PIN_ZOOM_DISTANCE) return;
    event.stopPropagation();
    if (!claimGuideClick(event.nativeEvent)) selectReview(event.instanceId ?? -1, event.nativeEvent);
  };
  const hover = hoverReview === null ? undefined : mapsReviews[hoverReview];
  const hoverPoint = hover ? latLonToXyz(hover.lat, hover.lon) : null;

  if (GUIDE_PLACES.length === 0) return null;

  return (
    <group>
      <instancedMesh ref={pinRef} args={[PIN_GEOMETRY, undefined, mapsReviews.length]} frustumCulled={false} visible={false}>
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={pinHitRef} args={[PIN_HIT_GEOMETRY, undefined, mapsReviews.length]} frustumCulled={false} visible={false} onClick={onReviewClick}
        onPointerOver={(event) => { if (!pinHitRef.current?.visible) return; event.stopPropagation(); setHoverReview(event.instanceId ?? null); setCursor(true); }}
        onPointerOut={() => { setHoverReview(null); setCursor(false); }}>
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </instancedMesh>
      {hover && hoverPoint && <Html position={[hoverPoint.x * (GLOBE_RADIUS + 0.09), hoverPoint.y * (GLOBE_RADIUS + 0.09), hoverPoint.z * (GLOBE_RADIUS + 0.09)]} center style={{ pointerEvents: "none" }}><span role="tooltip" className="whitespace-nowrap rounded bg-ink px-2 py-1 text-xs text-zinc-100">{hover.name}</span></Html>}
      <instancedMesh ref={meshRef} args={[RING_GEOMETRY, undefined, GUIDE_PLACES.length]} frustumCulled={false}>
        <meshBasicMaterial toneMapped={false} transparent opacity={0.85} side={THREE.DoubleSide} />
      </instancedMesh>
      {lifeIndices.length > 0 && (
        <instancedMesh ref={lifeRef} args={[LIFE_RING_GEOMETRY, undefined, lifeIndices.length]} frustumCulled={false}>
          <meshBasicMaterial toneMapped={false} transparent opacity={0.6} side={THREE.DoubleSide} />
        </instancedMesh>
      )}
      <instancedMesh
        ref={hitRef}
        args={[HIT_GEOMETRY, undefined, GUIDE_PLACES.length]}
        frustumCulled={false}
        onClick={onClick}
        onPointerOver={() => setCursor(true)}
        onPointerOut={() => setCursor(false)}
      >
        <meshBasicMaterial transparent opacity={0} depthWrite={false} depthTest={false} side={THREE.DoubleSide} />
      </instancedMesh>
      {/* career-ops-hq's own self-published org location (Spain, country
          level) — a single static point, visually distinct (--color-alt)
          from every "owner data, in" ring above it: this one is code he
          wrote landing somewhere else, not a place he went. */}
      <mesh ref={orgRef} geometry={ORG_MARKER_GEOMETRY} frustumCulled={false}>
        <meshBasicMaterial toneMapped={false} transparent opacity={0.9} color={alt} side={THREE.DoubleSide} />
      </mesh>
      <mesh
        ref={orgHitRef}
        geometry={ORG_MARKER_HIT_GEOMETRY}
        frustumCulled={false}
        onClick={onOrgClick}
        onPointerOver={() => setCursor(true)}
        onPointerOut={() => setCursor(false)}
      >
        <meshBasicMaterial transparent opacity={0} depthWrite={false} depthTest={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}
