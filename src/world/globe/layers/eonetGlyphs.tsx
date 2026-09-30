import { EMBER, VOLCANO, STORM } from "./layerKeys.ts";
// LANE L7 (live earth events), task 2: NASA EONET's three categories this
// lane draws, one InstancedMesh per glyph kind (task 8) — wildfires as
// ember glyphs, volcanoes as small cones, severe storms as a ring standing
// at the storm's latest position plus its own fading track line. None of
// these move once fetched, so (like quakeGlyphs' resting ring) the instance
// buffers are rebuilt in a plain effect keyed on the data, never a useFrame
// loop — there is nothing here that needs a per-frame update.
import { useEffect, useMemo, useRef, type RefObject } from "react";
import { type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { latLonToXyz } from "../geoMath.ts";
import { GLOBE_RADIUS } from "../EarthDots.tsx";
import { useGlobe } from "../globeStore.ts";
import { formatTimeAgo } from "./quake.ts";
import { type EonetEvent, eonetFadeAlpha, trackAtTime } from "./eonet.ts";

const EMBER_GEOMETRY = new THREE.SphereGeometry(1, 6, 6);
const VOLCANO_GEOMETRY = new THREE.ConeGeometry(1, 2, 4);
const STORM_GEOMETRY = new THREE.TorusGeometry(1, 0.34, 6, 14);

const EMBER_RADIUS = 0.028;
const VOLCANO_RADIUS = 0.03;
const STORM_RADIUS = 0.05;
const MAX_PER_KIND = 80;

// Natural-phenomenon colours, not this app's brand tokens (globe-lanes.md's
// "ambient never in brand colours" — these are what the thing IS, same
// reasoning as EarthDots' literal hex).
const EMBER_COLOR = new THREE.Color(EMBER);
const VOLCANO_COLOR = new THREE.Color(VOLCANO);
const STORM_COLOR = new THREE.Color(STORM);
const BACKGROUND = new THREE.Color("#05070a"); // see quakeGlyphs.tsx's own note on this fade trick

const dummy = new THREE.Object3D();
const tmpColor = new THREE.Color();
// RingGeometry/TorusGeometry face +Z by default; ConeGeometry points +Y —
// each glyph rotates from its OWN geometry's resting axis onto the surface
// normal, not one shared axis (a cone aligned via +Z would lie on its side).
const AXIS_Z = new THREE.Vector3(0, 0, 1);
const AXIS_Y = new THREE.Vector3(0, 1, 0);

function surfacePosition(lat: number, lon: number, radius: number): THREE.Vector3 {
  const p = latLonToXyz(lat, lon);
  return new THREE.Vector3(p.x, p.y, p.z).multiplyScalar(radius);
}
function surfaceNormal(lat: number, lon: number): THREE.Vector3 {
  const p = latLonToXyz(lat, lon);
  return new THREE.Vector3(p.x, p.y, p.z);
}

const CATEGORY_LABEL: Record<EonetEvent["category"], string> = {
  wildfires: "Wildfire",
  volcanoes: "Volcano",
  severeStorms: "Severe Storm",
};

function useCategoryMesh(
  events: EonetEvent[],
  radius: number,
  baseColor: THREE.Color,
  restAxis: THREE.Vector3,
  simNowMs: number,
  ref: RefObject<THREE.InstancedMesh | null>,
) {
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const capped = events.slice(0, MAX_PER_KIND);
    for (let i = 0; i < capped.length; i++) {
      const e = capped[i];
      dummy.position.copy(surfacePosition(e.lat, e.lon, GLOBE_RADIUS + 0.02));
      dummy.quaternion.setFromUnitVectors(restAxis, surfaceNormal(e.lat, e.lon));
      dummy.scale.setScalar(radius);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      const fade = eonetFadeAlpha(simNowMs, e.dateMs);
      tmpColor.copy(baseColor).lerp(BACKGROUND, 1 - fade);
      mesh.setColorAt(i, tmpColor);
    }
    mesh.count = capped.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [events, radius, baseColor, restAxis, simNowMs, ref]);
}

function selectEvent(select: ReturnType<typeof useGlobe.getState>["select"], e: EonetEvent, simNowMs: number, extra?: { label: string; value: string }[]) {
  select({
    id: `eonet-${e.id}`,
    kind: "eonet",
    title: e.title,
    rows: [
      { label: "Category", value: CATEGORY_LABEL[e.category] },
      { label: "Date", value: formatTimeAgo(simNowMs, e.dateMs) },
      ...(extra ?? []),
      // The URL as a plain row value, never an <a> inside the canvas (task 2).
      { label: "Source", value: e.sourceUrl },
    ],
    source: `NASA EONET (${e.sourceId})`,
    live: true,
    focus: { kind: "latlon", lat: e.lat, lon: e.lon },
  });
}

function setCursor(hover: boolean): void {
  document.body.style.cursor = hover ? "pointer" : "auto";
}

export function EonetGlyphs({ events, simNowMs }: { events: EonetEvent[]; simNowMs: number }) {
  const select = useGlobe((s) => s.select);
  const fires = useMemo(() => events.filter((e) => e.category === "wildfires"), [events]);
  const volcanoes = useMemo(() => events.filter((e) => e.category === "volcanoes"), [events]);
  const storms = useMemo(() => events.filter((e) => e.category === "severeStorms"), [events]);

  const fireRef = useRef<THREE.InstancedMesh>(null);
  const volcanoRef = useRef<THREE.InstancedMesh>(null);
  const stormRef = useRef<THREE.InstancedMesh>(null);

  useCategoryMesh(fires, EMBER_RADIUS, EMBER_COLOR, AXIS_Z, simNowMs, fireRef);
  useCategoryMesh(volcanoes, VOLCANO_RADIUS, VOLCANO_COLOR, AXIS_Y, simNowMs, volcanoRef);
  useCategoryMesh(storms, STORM_RADIUS, STORM_COLOR, AXIS_Z, simNowMs, stormRef);

  const onClickIn = (list: EonetEvent[]) => (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const i = e.instanceId;
    if (i === undefined || !list[i]) return;
    const ev = list[i];
    const trackRows =
      ev.track && ev.track.length > 1 ? [{ label: "Track points", value: String(trackAtTime(ev.track, simNowMs).length) }] : undefined;
    selectEvent(select, ev, simNowMs, trackRows);
  };

  return (
    <group>
      {fires.length > 0 && (
        <instancedMesh
          ref={fireRef}
          args={[EMBER_GEOMETRY, undefined, MAX_PER_KIND]}
          frustumCulled={false}
          onClick={onClickIn(fires)}
          onPointerOver={() => setCursor(true)}
          onPointerOut={() => setCursor(false)}
        >
          <meshBasicMaterial toneMapped={false} />
        </instancedMesh>
      )}
      {volcanoes.length > 0 && (
        <instancedMesh
          ref={volcanoRef}
          args={[VOLCANO_GEOMETRY, undefined, MAX_PER_KIND]}
          frustumCulled={false}
          onClick={onClickIn(volcanoes)}
          onPointerOver={() => setCursor(true)}
          onPointerOut={() => setCursor(false)}
        >
          <meshBasicMaterial toneMapped={false} />
        </instancedMesh>
      )}
      {storms.length > 0 && (
        <instancedMesh
          ref={stormRef}
          args={[STORM_GEOMETRY, undefined, MAX_PER_KIND]}
          frustumCulled={false}
          onClick={onClickIn(storms)}
          onPointerOver={() => setCursor(true)}
          onPointerOut={() => setCursor(false)}
        >
          <meshBasicMaterial toneMapped={false} />
        </instancedMesh>
      )}
      {storms.map((s) => (s.track ? <StormTrack key={s.id} track={trackAtTime(s.track, simNowMs)} /> : null))}
    </group>
  );
}

/** The storm's dated points as a fading polyline (task 2). LineBasicMaterial
 *  has no per-vertex alpha, so (same trick as the rings) each vertex's
 *  colour is pre-lerped toward the background — older points fade rather
 *  than a hard-edged line of uniform brightness. Built once per track
 *  (useMemo, not useFrame) and disposed on the next rebuild or unmount
 *  (task 8: "dispose GPU resources") — a `<primitive object={new
 *  THREE.Line(...)}>` inline would allocate a fresh geometry+material every
 *  render and leak the old one. */
function StormTrack({ track }: { track: { lat: number; lon: number; dateMs: number }[] }) {
  const line = useMemo(() => {
    if (track.length < 2) return null;
    const positions = new Float32Array(track.length * 3);
    const colors = new Float32Array(track.length * 3);
    const newestMs = track[track.length - 1].dateMs;
    const oldestMs = track[0].dateMs;
    const span = Math.max(1, newestMs - oldestMs);
    for (let i = 0; i < track.length; i++) {
      const p = surfacePosition(track[i].lat, track[i].lon, GLOBE_RADIUS + 0.018);
      positions.set([p.x, p.y, p.z], i * 3);
      const age = (newestMs - track[i].dateMs) / span; // 0 newest, 1 oldest
      tmpColor.copy(STORM_COLOR).lerp(BACKGROUND, age * 0.85);
      colors.set([tmpColor.r, tmpColor.g, tmpColor.b], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return new THREE.Line(geo, new THREE.LineBasicMaterial({ vertexColors: true, toneMapped: false, transparent: true, opacity: 0.85 }));
  }, [track]);

  useEffect(() => {
    return () => {
      line?.geometry.dispose();
      (line?.material as THREE.Material | undefined)?.dispose();
    };
  }, [line]);

  return line ? <primitive object={line} /> : null;
}
