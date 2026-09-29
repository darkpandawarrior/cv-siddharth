// LANE T1 ("My Maps places"): the owner's Google Maps Local Guide
// contributions, city level only. One InstancedMesh for the resting ring
// (radius by sqrt(reviews + photos), clamped) plus one bigger, invisible hit
// mesh (same tap-target trick as quakeGlyphs.tsx/TogetherLayer.tsx: a thin
// annulus is a poor click target). A THIRD, small instanced mesh draws a
// second ring only over places that are also a life place (lifePlaces.ts),
// so a visitor can tell "somewhere I lived" from "somewhere I reviewed" at a
// glance. Every placement is computed once (this data never changes at
// runtime) — no useFrame, no per-frame allocation.
import { useEffect, useMemo, useRef } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { GLOBE_RADIUS, latLonToXyz } from "../geoMath.ts";
import { readColor } from "../../../themeColorThree.ts";
import { readToken } from "../../../themeColor.ts";
import { useGlobe } from "../globeStore.ts";
import { lifePlaces } from "../../../data/profile/lifePlaces.ts";
import { mapsExport, mapsPhotos, mapsPlaces, mapsTotals } from "../../../data/generated/mapsPlaces.ts";

const RING_GEOMETRY = new THREE.RingGeometry(0.72, 1, 28);
const LIFE_RING_GEOMETRY = new THREE.RingGeometry(1.25, 1.45, 28);
const HIT_GEOMETRY = new THREE.CircleGeometry(1, 16);
const MIN_SCALE = 0.12;
const MAX_SCALE = 0.42;
const HIT_RADIUS_MULTIPLIER = 1.6;
const LIFT = 0.015;
const UP = new THREE.Vector3(0, 0, 1);
const dummy = new THREE.Object3D();

function scaleFor(reviews: number, photos: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.sqrt(reviews + photos) * 0.08));
}

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
    const gaz = mapsPlaces.find((p) => p.slug === lp.slug); // never true today; kept for the guard
    const geo = gaz ?? undefined;
    if (!geo) continue;
    out.push({ slug: lp.slug, city: lp.city, country: lp.country, lat: geo.lat, lon: geo.lon, reviews: 0, photos: 0, photoViews: 0, years: [], isLifePlace: true, lifeLine: lp.line });
  }
  return out;
}

const GUIDE_PLACES = buildGuidePlaces();

export default function GuideLayer(_props: { tier: 1 | 2 | 3 }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const hitRef = useRef<THREE.InstancedMesh>(null);
  const lifeRef = useRef<THREE.InstancedMesh>(null);
  const select = useGlobe((s) => s.select);
  const setView = useGlobe((s) => s.setView);
  const probe = useMemo(() => readColor("--color-probe", "#5ee6ff"), []);
  const accent = useMemo(() => readColor("--color-accent", "#f2a13d"), []);

  const lifeIndices = useMemo(() => GUIDE_PLACES.map((p, i) => (p.isLifePlace ? i : -1)).filter((i) => i >= 0), []);

  useEffect(() => {
    const mesh = meshRef.current;
    const hit = hitRef.current;
    if (!mesh || !hit) return;
    for (let i = 0; i < GUIDE_PLACES.length; i++) {
      const p = GUIDE_PLACES[i];
      const xyz = latLonToXyz(p.lat, p.lon);
      const normal = new THREE.Vector3(xyz.x, xyz.y, xyz.z);
      dummy.position.copy(normal).multiplyScalar(GLOBE_RADIUS + LIFT);
      dummy.quaternion.setFromUnitVectors(UP, normal);
      const scale = scaleFor(p.reviews, p.photos);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, probe);
      dummy.scale.setScalar(scale * HIT_RADIUS_MULTIPLIER);
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

    useGlobe.getState().setStatus("guide", { state: "snapshot", detail: `${mapsTotals.reviews} reviews, ${mapsTotals.photos} photos, Maps export ${mapsExport}` });
    return () => useGlobe.getState().setStatus("guide", undefined);
  }, [probe, accent, lifeIndices]);

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const i = e.instanceId;
    if (i === undefined || !GUIDE_PLACES[i]) return;
    const p = GUIDE_PLACES[i];
    const photos = mapsPhotos.filter((ph) => ph.slug === p.slug);
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
        ...(p.isLifePlace && p.lifeLine ? [{ label: "Life", value: p.lifeLine, swatch: readToken("--color-accent", "#f2a13d") }] : []),
      ],
      source: `Google Maps Takeout, exported ${mapsExport} · city level, years only`,
      live: false,
      focus: { kind: "latlon" as const, lat: p.lat, lon: p.lon, distance: 14 },
      media: photos.length > 0 ? photos.map((ph) => ({ src: ph.src, alt: ph.caption ?? `Photo in ${ph.city}, ${ph.year}`, caption: ph.caption ? `${ph.year} · ${ph.views.toLocaleString("en-IN")} views` : String(ph.year) })) : undefined,
    });
  };
  const setCursor = (hover: boolean) => {
    document.body.style.cursor = hover ? "pointer" : "auto";
  };

  if (GUIDE_PLACES.length === 0) return null;

  return (
    <group>
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
    </group>
  );
}
