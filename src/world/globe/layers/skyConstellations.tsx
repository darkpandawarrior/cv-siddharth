// The 88 IAU constellation stick figures (LANE W4), drawn on the same
// celestial sphere as skyStars.tsx's own star field (RA/Dec encoded once,
// the whole figure set rotated by -GMST when `now` changes — never per
// frame), plus small always-legible name labels at each figure's centroid.
// Faint, never a brand colour: this is ambient sky furniture, not a
// live/claim marker. Licence for the shipped data is recorded beside it at
// public/sky/CONSTELLATIONS-LICENSE.txt (d3-celestial, BSD-3-Clause).
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { GLOBE_RADIUS } from "../geoMath.ts";
import { PUNE } from "../../../lib/sky.ts";
import { raDecToAltAz } from "../../../lib/stars.ts";
import { useGlobe } from "../globeStore.ts";
import { gmstDeg } from "./skyMath.ts";
import { isBehindEarth, loadConstellations, raDecToXyz, rotateY, toSegmentPairs, type ConstellationRaw } from "./skyConstellations.ts";

/** A touch inside skyStars.tsx's own STAR_RADIUS (420): never a z-fight risk
 *  either way (LineSegments vs Points are never coplanar triangles), just
 *  keeps the figures reading as sitting just in front of the star field. */
const CONST_RADIUS = 400;

const LINE_COLOR = new THREE.Color("#4c6570"); // faint desaturated blue-grey — ambient, never a brand token
const LABEL_OPACITY_GROUND = 0.82; // "shown by default" in ground view
const LABEL_OPACITY_ORBIT = 0.32; // "optional (subtle)" everywhere else

export interface SkyConstellationsProps {
  now: Date;
  tier: 1 | 2 | 3;
}

export default function SkyConstellations({ now, tier }: SkyConstellationsProps) {
  const [constellations, setConstellations] = useState<ConstellationRaw[] | null>(null);
  const groupRef = useRef<THREE.Group>(null);
  const probeRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    let alive = true;
    loadConstellations()
      .then((c) => {
        if (alive) setConstellations(c);
      })
      .catch(() => {
        /* "never fake data": a 404/network failure just leaves constellations
           null, and the component below draws nothing at all. */
      });
    return () => {
      alive = false;
    };
  }, []);

  // Test seam only (this lane's brief: "constellation lines exist via a seam
  // in your own files"), same raw-DOM-node technique SkyLayer.tsx and
  // skyMoon.tsx already use for their own probes rather than a portal (a
  // component mounted inside <Canvas> is reconciled by R3F's own renderer,
  // which has no bridge back to react-dom for a plain "span").
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

  const geometry = useMemo(() => {
    if (!constellations) return null;
    const positions: number[] = [];
    for (const c of constellations) {
      const pairs = toSegmentPairs(c);
      for (let i = 0; i < pairs.length; i += 4) {
        const [x0, y0, z0] = raDecToXyz(pairs[i], pairs[i + 1], CONST_RADIUS);
        const [x1, y1, z1] = raDecToXyz(pairs[i + 2], pairs[i + 3], CONST_RADIUS);
        positions.push(x0, y0, z0, x1, y1, z1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
    return geo;
  }, [constellations]);

  useEffect(() => () => geometry?.dispose(), [geometry]);

  useEffect(() => {
    const el = probeRef.current;
    if (!el || !geometry) return;
    el.setAttribute("data-constellation-vertices", String(geometry.getAttribute("position").count));
    el.setAttribute("data-constellation-count", String(constellations?.length ?? 0));
  }, [geometry, constellations]);

  // Whole-figure rotation, only when `now` changes — never per frame, the
  // same discipline skyStars.tsx's own star field group uses (see its
  // header comment for the sign derivation this mirrors).
  useEffect(() => {
    if (groupRef.current) groupRef.current.rotation.y = -gmstDeg(now) * (Math.PI / 180);
  }, [now]);

  if (tier === 3 || !geometry) return null;

  return (
    <>
      <group ref={groupRef}>
        <lineSegments frustumCulled={false}>
          <primitive object={geometry} attach="geometry" />
          <lineBasicMaterial color={LINE_COLOR} transparent opacity={0.38} depthWrite={false} />
        </lineSegments>
      </group>
      {/* T2 (living-earth tiers): figures without names. T1 only gets the
          per-constellation label overlay below. */}
      {tier === 1 && constellations && <ConstellationLabels constellations={constellations} now={now} />}
    </>
  );
}

/** One shared per-frame loop over every label's DOM node (never 89 separate
 *  useFrame subscriptions, never React state written per frame — style
 *  writes only, same discipline as skyMoon.tsx's own per-frame probe). Each
 *  label's screen position comes from drei's <Html>, which already resolves
 *  the canvas's real page offset; this component only adds the "hide when
 *  behind the earth / below the Pune horizon" gate on top of that, and the
 *  ground-view/orbit-view opacity split. */
function ConstellationLabels({ constellations, now }: { constellations: ConstellationRaw[]; now: Date }) {
  const spansRef = useRef<(HTMLSpanElement | null)[]>([]);
  const aboveHorizonRef = useRef<Uint8Array>(new Uint8Array(0));
  const positionsRef = useRef<Float32Array>(new Float32Array(0));
  const view = useGlobe((s) => s.view);

  // Rotated world position + the ground-view horizon flag, recomputed only
  // when `now` changes (never per frame) — mirrors the parent's own
  // group-rotation discipline, restated in plain numbers (rotateY) rather
  // than read back off a THREE.Object3D's world matrix, since these labels
  // are NOT nested inside the rotated <group> above (an <Html> needs its
  // own `position` prop to project correctly; nesting it under a rotating
  // parent and reading matrixWorld per label costs more than precomputing
  // the same rotation directly).
  const rotated = useMemo(() => {
    const gmstRad = -gmstDeg(now) * (Math.PI / 180);
    const flat = new Float32Array(constellations.length * 3);
    const above = new Uint8Array(constellations.length);
    for (let i = 0; i < constellations.length; i++) {
      const c = constellations[i];
      const [x, y, z] = raDecToXyz(c.ra, c.dec, CONST_RADIUS);
      const [rx, ry, rz] = rotateY(x, y, z, gmstRad);
      flat[i * 3] = rx;
      flat[i * 3 + 1] = ry;
      flat[i * 3 + 2] = rz;
      above[i] = raDecToAltAz(c.ra / 15, c.dec, now, PUNE.lat, PUNE.lon).altitudeDeg > 0 ? 1 : 0;
    }
    return { flat, above };
  }, [constellations, now]);
  const positions = rotated.flat;

  // Refs are read every frame by the useFrame loop below but must never be
  // written during render (react-hooks/refs) — this effect is the one place
  // that copies the latest memoized rotation/horizon data into them.
  useEffect(() => {
    positionsRef.current = rotated.flat;
    aboveHorizonRef.current = rotated.above;
  }, [rotated]);

  useEffect(() => {
    const opacity = view === "ground" ? LABEL_OPACITY_GROUND : LABEL_OPACITY_ORBIT;
    for (const el of spansRef.current) if (el) el.style.opacity = String(opacity);
  }, [view]);

  useFrame((state) => {
    const above = aboveHorizonRef.current;
    const pos = positionsRef.current;
    const spans = spansRef.current;
    const cam = state.camera.position;
    for (let i = 0; i < spans.length; i++) {
      const el = spans[i];
      if (!el) continue;
      const visible =
        view === "ground" ? above[i] === 1 : !isBehindEarth(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2], cam.x, cam.y, cam.z, GLOBE_RADIUS);
      el.style.display = visible ? "" : "none";
    }
  });

  return (
    <>
      {constellations.map((c, i) => (
        // Serpens is the one IAU figure split into two entries sharing id
        // "Ser" (Caput/Cauda) - `i` keeps the key unique without assuming
        // every other id is (it is, for the other 87).
        <Html key={`${c.id}-${i}`} position={[positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]]} center zIndexRange={[0, 0]} style={{ pointerEvents: "none" }}>
          <span
            ref={(el) => {
              spansRef.current[i] = el;
            }}
            data-constellation-label={c.id}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: "#9fb3ba",
              whiteSpace: "nowrap",
              textShadow: "0 0 3px rgba(0,0,0,0.7)",
              display: "none",
            }}
          >
            {c.name}
          </span>
        </Html>
      ))}
    </>
  );
}
