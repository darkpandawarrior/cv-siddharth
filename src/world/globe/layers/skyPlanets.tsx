// Mercury, Venus, Mars, Jupiter, Saturn (LANE W4): real heliocentric-Keplerian
// positions (skyPlanetsMath.ts, Standish's public Table 1 elements) placed
// on the sky the same way skyMoon.tsx places the real Moon — geocentric
// RA/Dec -> substellarLatLon -> latLonToXyz, scaled to a fixed sky-sphere
// distance (a direction claim, never a distance one; see skyPlanetsMath.ts's
// own header for why no "not to scale" row is needed here the way an actual
// scene-space altitude would get one). Each is a small real sphereGeometry
// (always reads round from any angle, unlike a billboard — no per-frame
// camera-facing needed, same lazy choice SatelliteLayer.tsx's own station
// dots make) sized by true apparent magnitude, coloured a pale true-ish hue,
// clickable for its own inspector rows.
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { GLOBE_RADIUS, latLonToXyz } from "../geoMath.ts";
import { PUNE } from "../../../lib/sky.ts";
import { raDecToAltAz } from "../../../lib/stars.ts";
import { useGlobe } from "../globeStore.ts";
import { substellarLatLon } from "./skyMath.ts";
import { isBehindEarth } from "./skyConstellations.ts";
import {
  apparentMagnitude,
  formatDecDeg,
  formatRaHours,
  magToSphereRadius,
  planetGeometry,
  PLANET_COLOR,
  PLANET_IDS,
  PLANET_LABEL,
  type PlanetId,
} from "./skyPlanetsMath.ts";

/** Between the Moon (22) and the star/constellation sphere (400-420) —
 *  reads as a point among the stars at every zoom this globe allows. */
const PLANET_SKY_RADIUS = 410;

// One reused scratch vector for every planet's per-frame screen-projection
// probe below (no per-frame allocation) — same technique skyMoon.tsx's own
// module-level `scratch` uses.
const scratch = new THREE.Vector3();

export interface SkyPlanetsProps {
  now: Date;
  tier: 1 | 2 | 3;
}

export default function SkyPlanets({ now, tier }: SkyPlanetsProps) {
  if (tier === 3) return null;
  return (
    <>
      {PLANET_IDS.map((id) => (
        <Planet key={id} id={id} now={now} showLabel={tier === 1} />
      ))}
    </>
  );
}

function Planet({ id, now, showLabel }: { id: PlanetId; now: Date; showLabel: boolean }) {
  const [hovered, setHovered] = useState(false);
  const select = useGlobe((s) => s.select);
  const labelRef = useRef<HTMLSpanElement | null>(null);
  const probeRef = useRef<HTMLSpanElement | null>(null);

  // Test seam only (this lane's brief: "planet click selects"): a plain DOM
  // node written with this planet's own current screen projection every
  // frame, the exact same raw-DOM-node + `data-*-x/y` convention
  // skyMoon.tsx's own probe uses so e2e/globe-W4.spec.ts can click the
  // canvas at the right spot without a hand-maintained pixel offset.
  useEffect(() => {
    const el = document.createElement("span");
    el.setAttribute("aria-hidden", "true");
    Object.assign(el.style, { position: "fixed", width: "0", height: "0", overflow: "hidden", pointerEvents: "none" });
    document.body.appendChild(el);
    probeRef.current = el;
    return () => {
      el.remove();
      probeRef.current = null;
    };
  }, []);

  // Recomputed only when `now` changes — a planet's own position barely
  // moves minute to minute, so this is exactly the "static except on a time
  // tick" discipline every other sky object here (Moon, Sun, star field)
  // already follows, never a per-frame recomputation.
  const geom = useMemo(() => planetGeometry(id, now), [id, now]);
  const mag = useMemo(() => apparentMagnitude(id, geom.helioDistanceAu, geom.distanceAu, geom.phaseAngleDeg), [id, geom]);
  const radius = magToSphereRadius(mag);
  const position = useMemo((): [number, number, number] => {
    const { lat, lon } = substellarLatLon(geom.raHours, geom.decDeg, now);
    const p = latLonToXyz(lat, lon);
    return [p.x * PLANET_SKY_RADIUS, p.y * PLANET_SKY_RADIUS, p.z * PLANET_SKY_RADIUS];
  }, [geom, now]);
  const altAz = useMemo(() => raDecToAltAz(geom.raHours, geom.decDeg, now, PUNE.lat, PUNE.lon), [geom, now]);

  // Label occlusion only (the point mesh itself is real geometry: R3F's own
  // depth-tested raycasting and the earth mesh's own depth-write already
  // hide it — and block its click — behind the opaque earth exactly like
  // the Moon/Sun/stars, no extra code needed). An <Html> label is a DOM
  // overlay outside that depth buffer, so it needs the same manual gate
  // skyConstellations.tsx's own label loop uses: ground view hides below
  // the Pune horizon, every other view hides behind the earth.
  useFrame((state) => {
    const el = labelRef.current;
    if (el) {
      const view = useGlobe.getState().view;
      const visible =
        view === "ground"
          ? altAz.altitudeDeg > 0
          : !isBehindEarth(position[0], position[1], position[2], state.camera.position.x, state.camera.position.y, state.camera.position.z, GLOBE_RADIUS);
      el.style.display = visible ? "" : "none";
    }
    const probe = probeRef.current;
    if (probe) {
      probe.setAttribute("data-planet-probe", id);
      scratch.set(position[0], position[1], position[2]).project(state.camera);
      probe.setAttribute("data-planet-x", String(Math.round((scratch.x * 0.5 + 0.5) * state.size.width)));
      probe.setAttribute("data-planet-y", String(Math.round((-scratch.y * 0.5 + 0.5) * state.size.height)));
    }
  });

  function handleClick(e: { stopPropagation: () => void }) {
    e.stopPropagation();
    select({
      id: `planet:${id}`,
      kind: "planet",
      title: PLANET_LABEL[id],
      rows: [
        { label: "RA / Dec", value: `${formatRaHours(geom.raHours)} / ${formatDecDeg(geom.decDeg)}` },
        { label: "Altitude / Azimuth (Pune)", value: `${altAz.altitudeDeg.toFixed(1)}° / ${altAz.azimuthDeg.toFixed(1)}°` },
        { label: "Above horizon (Pune)", value: altAz.altitudeDeg > 0 ? "yes" : "no" },
        { label: "Magnitude", value: mag.toFixed(1) },
      ],
      // Verbatim per this lane's own brief: a computed (not fetched) reading,
      // "live: false" for the same reason skyMoon.tsx's own selection is —
      // never stale on a feed outage, but also not a live poll.
      source: "computed, Standish elements",
      live: false,
    });
  }

  return (
    <mesh
      position={position}
      scale={hovered ? 1.4 : 1}
      onClick={handleClick}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        setHovered(false);
        document.body.style.cursor = "auto";
      }}
    >
      <sphereGeometry args={[radius, 10, 8]} />
      <meshBasicMaterial color={PLANET_COLOR[id]} toneMapped={false} />
      {showLabel && (
        <Html center zIndexRange={[0, 0]} style={{ pointerEvents: "none" }}>
          <span
            ref={labelRef}
            data-planet-label={id}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: "#e8efe9",
              whiteSpace: "nowrap",
              textShadow: "0 0 3px rgba(0,0,0,0.7)",
              transform: "translateY(12px)",
              display: "none",
            }}
          >
            {PLANET_LABEL[id]}
          </span>
        </Html>
      )}
    </mesh>
  );
}
