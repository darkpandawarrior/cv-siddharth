/**
 * The night sky (live-data-spec.md §2.2 binding table rows 12-14;
 * master-plan.md#M10/#M12/#M56): one `Points` draw for the HYG star field,
 * a phase-lit moon disc, and an ISS marker — all positioned on the SAME
 * true-compass shell `skyFrame.ts`'s `worldDir` already gives every other
 * real-sky layer (`reality/Aircraft.tsx`, `reality/Satellites.tsx`), so a
 * star, the moon and the ISS all line up against the one real horizon.
 *
 * Reads the SAME `useNowModel()` bus every other v2 layer does (M53) for
 * the sun/moon/air terms; calls `useSatellites()` itself for the ISS,
 * because `useNowModel` deliberately carries only the `/api/tle` object
 * COUNT, never the SGP4 propagation (M56 — see that hook's own doc
 * comment). `useSatellites()` still costs no second `/api/tle` fetch
 * (`useLiveSignal`'s own URL-keyed bus), and its `import("./satellites.ts")`
 * stays a dynamic import inside that hook, so satellite.js never lands in
 * this (eagerly-glob'd) layer's own static chunk.
 *
 * Never touches `valley.ts`'s counts, widths or any data mesh — every node
 * here is its own group, mounted alongside, never inside, a landmark's own
 * scene graph (living-ledger-spec §5's invariant, `valley.test.ts`
 * unchanged).
 */
import { useEffect, useMemo, useState, type JSX } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Billboard } from "@react-three/drei";
import { useNowModel } from "../useNowModel.ts";
import { useSatellites } from "../../../lib/useSatellites.ts";
import { deviceTier } from "../../deviceTier.ts";
import { worldPalette } from "../../palette.ts";
import { worldDir, DOWNSTREAM_BEARING_DEG } from "../skyFrame.ts";
import { loadStarField, lst, type Star } from "../../../lib/stars.ts";
import { PUNE } from "../../../lib/sky.ts";
import {
  starMagLimit,
  effectiveStarMagLimit,
  starFieldAlpha,
  moonDiscVisible,
  issMarkerState,
  ISS_NOT_VISIBLE_LABEL,
} from "../live/nightSky.ts";

export const layer = { id: "night-sky", order: 7 };

/** Just inside `SkyDome.tsx`'s own `DOME_RADIUS` (900) — stars, the moon and
 *  the ISS all read as "on the dome", never poking through it. */
const SKY_RADIUS = 850;
const LAT_RAD = (PUNE.lat * Math.PI) / 180;
const BEARING_RAD = (DOWNSTREAM_BEARING_DEG * Math.PI) / 180;

/** `field -> string`, mirrored onto the `<canvas>` DOM element — the same
 *  idiom `LiveBinding.tsx`/`LandmarksApps.tsx` already use per-file, so e2e
 *  reads every row off one DOM node with no second copy shared here. */
function useCanvasDataAttrs(attrs: Readonly<Record<string, string>>): void {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const el = gl.domElement;
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(`data-${k}`, v);
  }, [gl, attrs]);
}

function useStarField(): Star[] {
  const [stars, setStars] = useState<Star[]>([]);
  useEffect(() => {
    let cancelled = false;
    loadStarField()
      .then((s) => {
        if (!cancelled) setStars(s);
      })
      .catch(() => {
        /* bin fetch fails -> no stars (row 13's own fallback) */
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return stars;
}

// ── Stars: alt/az from ra/dec + LST computed in the vertex shader, on the
// SAME true-compass rotation `skyFrame.ts`'s `worldDir` uses in JS — the
// spherical-trig transform `stars.ts`'s own `raDecToAltAz` documents,
// restated in GLSL because it runs once per star per frame on the GPU
// rather than being recomputed on the CPU every LST tick. ───────────────────
const STAR_VERTEX = /* glsl */ `
  uniform float uLstDeg;
  uniform float uSunAltDeg;
  uniform float uCloudPct;
  uniform float uMagLimit;
  attribute float aRaHours;
  attribute float aDecDeg;
  attribute float aMag;
  varying float vAlpha;

  const float PI = 3.14159265359;
  const float LAT_RAD = ${LAT_RAD.toFixed(8)};
  const float BEARING_RAD = ${BEARING_RAD.toFixed(8)};
  const float SKY_RADIUS = ${SKY_RADIUS.toFixed(1)};

  float sat(float x) { return clamp(x, 0.0, 1.0); }
  float ssramp(float e0, float e1, float x) {
    float t = sat((x - e0) / (e1 - e0));
    return t * t * (3.0 - 2.0 * t);
  }

  void main() {
    float haDeg = mod(uLstDeg - aRaHours * 15.0, 360.0);
    if (haDeg < 0.0) haDeg += 360.0;
    float ha = radians(haDeg);
    float dec = radians(aDecDeg);
    float sinAlt = clamp(sin(dec) * sin(LAT_RAD) + cos(dec) * cos(LAT_RAD) * cos(ha), -1.0, 1.0);
    float alt = asin(sinAlt);
    float cosAz = clamp((sin(dec) - sin(LAT_RAD) * sinAlt) / (cos(LAT_RAD) * cos(alt)), -1.0, 1.0);
    float az = acos(cosAz);
    if (sin(ha) > 0.0) az = 2.0 * PI - az;

    // skyFrame.ts's own worldDir(azDeg, elDeg), restated in radians.
    float rel = az - BEARING_RAD;
    vec3 dir = vec3(-sin(rel) * cos(alt), sin(alt), cos(rel) * cos(alt));
    vec3 pos = dir * SKY_RADIUS;

    // nightSky.ts's starFieldAlpha, restated per-star for the GPU (the pure
    // TS version is the one nightSky.test.ts pins at fixture values).
    float nightFactor = ssramp(-6.0, -12.0, uSunAltDeg);
    float cloudFactor = 1.0 - ssramp(0.7, 0.9, uCloudPct / 100.0);
    float magFactor = ssramp(uMagLimit + 0.5, uMagLimit - 0.5, aMag);
    vAlpha = nightFactor * cloudFactor * magFactor;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    gl_PointSize = mix(3.2, 1.0, clamp((aMag + 1.5) / 6.5, 0.0, 1.0));
  }
`;

const STAR_FRAGMENT = /* glsl */ `
  varying float vAlpha;
  void main() {
    if (vAlpha <= 0.0) discard;
    vec2 c = gl_PointCoord - 0.5;
    if (length(c) > 0.5) discard;
    gl_FragColor = vec4(1.0, 1.0, 1.0, vAlpha);
  }
`;

function buildStarGeometry(stars: Star[]): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  // `position` is unused by the vertex shader (world position is derived
  // from ra/dec + LST instead) but three's Points draw call still wants a
  // bound position attribute to size the draw.
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(stars.length * 3), 3));
  const ra = new Float32Array(stars.length);
  const dec = new Float32Array(stars.length);
  const mag = new Float32Array(stars.length);
  stars.forEach((s, i) => {
    ra[i] = s.raHours;
    dec[i] = s.decDeg;
    mag[i] = s.mag;
  });
  geo.setAttribute("aRaHours", new THREE.BufferAttribute(ra, 1));
  geo.setAttribute("aDecDeg", new THREE.BufferAttribute(dec, 1));
  geo.setAttribute("aMag", new THREE.BufferAttribute(mag, 1));
  return geo;
}

function StarField({ stars, uniforms }: { stars: Star[]; uniforms: Record<string, THREE.IUniform> }): JSX.Element | null {
  const geometry = useMemo(() => (stars.length > 0 ? buildStarGeometry(stars) : null), [stars]);
  if (!geometry) return null;
  return (
    <points geometry={geometry} frustumCulled={false} renderOrder={0}>
      <shaderMaterial
        vertexShader={STAR_VERTEX}
        fragmentShader={STAR_FRAGMENT}
        transparent
        depthWrite={false}
        fog={false}
        uniforms={uniforms}
      />
    </points>
  );
}

// ── Moon: a phase-lit disc, the standard two-circle crescent construction
// (the terminator is an ellipse whose semi-minor axis shrinks to 0 at half-
// moon and grows to the full disc radius at new/full). Look-dev only — no
// acceptance item asserts its pixels (G11), the owner judges it from the
// crawl frames. ───────────────────────────────────────────────────────────
const MOON_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const MOON_FRAGMENT = /* glsl */ `
  uniform float uFraction;
  uniform float uWaxSign;
  varying vec2 vUv;
  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float r = length(p);
    if (r > 1.0) discard;
    float b = abs(1.0 - 2.0 * uFraction);
    float ellipseX = b * sqrt(max(0.0, 1.0 - p.y * p.y));
    bool moreThanHalf = uFraction > 0.5;
    bool lit = moreThanHalf ? (p.x * uWaxSign > -ellipseX) : (p.x * uWaxSign > ellipseX);
    vec3 litCol = vec3(0.92, 0.93, 0.9);
    vec3 darkCol = vec3(0.1, 0.11, 0.13);
    gl_FragColor = vec4(lit ? litCol : darkCol, 1.0);
  }
`;

const MOON_DISC_RADIUS = 22;

function MoonDisc({ azDeg, altDeg, fraction, waxing }: { azDeg: number; altDeg: number; fraction: number; waxing: boolean }): JSX.Element | null {
  const uniforms = useMemo(() => ({ uFraction: { value: fraction }, uWaxSign: { value: waxing ? 1 : -1 } }), [fraction, waxing]);
  if (!moonDiscVisible(altDeg)) return null;
  const [x, y, z] = worldDir(azDeg, altDeg).map((v) => v * SKY_RADIUS) as [number, number, number];
  return (
    <Billboard position={[x, y, z]}>
      <mesh renderOrder={1}>
        <circleGeometry args={[MOON_DISC_RADIUS, 32]} />
        <shaderMaterial vertexShader={MOON_VERTEX} fragmentShader={MOON_FRAGMENT} uniforms={uniforms} fog={false} />
      </mesh>
    </Billboard>
  );
}

// ── ISS marker: moon-white (none of the four semantic colours, row 14's own
// words) — `palette.text` is this world's neutral, non-semantic ink. A
// solid dot for "visible" (bright streak, simplified to a bigger solid
// point since M56 drops the pass-arc trail from this always-on marker —
// `reality/Satellites.tsx`'s Survey lens already draws the full pass arc on
// demand), a faint hollow ring otherwise. ──────────────────────────────────
function IssMarker({ azDeg, elDeg, visible }: { azDeg: number; elDeg: number; visible: boolean }): JSX.Element {
  const palette = worldPalette();
  const [x, y, z] = worldDir(azDeg, elDeg).map((v) => v * SKY_RADIUS) as [number, number, number];
  const label = visible ? "International Space Station, visible now" : ISS_NOT_VISIBLE_LABEL;
  return (
    <Billboard position={[x, y, z]}>
      <mesh renderOrder={1}>
        {visible ? <circleGeometry args={[4, 16]} /> : <ringGeometry args={[3, 4, 16]} />}
        <meshBasicMaterial color={palette.text} transparent opacity={visible ? 1 : 0.5} fog={false} />
      </mesh>
      <group visible={false} aria-hidden="true">
        {/* Hidden a11y label — the same "screen reader gets the fact too"
            posture Garlands.tsx/Fireflies.tsx already ship. */}
        <primitive object={new THREE.Object3D()} name={label} />
      </group>
    </Billboard>
  );
}

export default function NightSky(): JSX.Element | null {
  const nowModel = useNowModel(null);
  const tier = deviceTier();
  const stars = useStarField();
  const satellites = useSatellites();

  const sky = nowModel?.raw.sky ?? null;
  const air = nowModel?.raw.air ?? null;
  const moonPhase = nowModel?.raw.moonPhase ?? null;
  const moonPosition = nowModel?.raw.moonPosition ?? null;

  const starUniforms = useMemo<Record<string, THREE.IUniform>>(
    () => ({
      uLstDeg: { value: 0 },
      uSunAltDeg: { value: -90 },
      uCloudPct: { value: 0 },
      uMagLimit: { value: 5.0 },
    }),
    [],
  );

  const rawLimit = starMagLimit(air?.pm25 ?? null, moonPhase?.fraction ?? 0, moonPosition?.altitudeDeg ?? -90);
  const magLimit = effectiveStarMagLimit(rawLimit, tier);

  useEffect(() => {
    if (!sky) return;
    starUniforms.uLstDeg.value = lst(sky.now, PUNE.lon);
    starUniforms.uSunAltDeg.value = sky.sun.altitudeDeg;
    starUniforms.uCloudPct.value = sky.weather?.cloudPct ?? 0;
    starUniforms.uMagLimit.value = magLimit;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sky?.now.getTime(), sky?.sun.altitudeDeg, sky?.weather?.cloudPct, magLimit]);

  const issState = issMarkerState(satellites.iss);
  const issDrawn = issState !== "below";

  // The brightest loaded star's own alpha (row 13's per-star formula,
  // `nightSky.test.ts`'s own pure function) — a DOM summary of otherwise
  // GPU-only shader state, the same "data-* attribute stands in for a
  // WebGL pixel" posture G11 states, and the same idiom row 17's kite
  // min/max altitude summary already uses in `LiveBinding.tsx`.
  // A manual reduce, not `Math.min(...stars.map(...))` — the HYG mag<=5 bin
  // is a few thousand rows, comfortably past where spreading them as call
  // arguments risks the engine's argument-count ceiling.
  const brightestMag = useMemo(
    () => (stars.length > 0 ? stars.reduce((min, s) => Math.min(min, s.mag), Infinity) : null),
    [stars],
  );
  const starAlpha = brightestMag == null ? 0 : starFieldAlpha(sky?.sun.altitudeDeg ?? -90, sky?.weather?.cloudPct ?? null, magLimit, brightestMag);

  useCanvasDataAttrs(
    useMemo(
      () => ({
        "live-star-limit": magLimit.toFixed(2),
        "live-star-alpha": starAlpha.toFixed(3),
        "live-iss": issState,
      }),
      [magLimit, starAlpha, issState],
    ),
  );

  return (
    <group name="night-sky">
      <StarField stars={stars} uniforms={starUniforms} />
      {moonPhase && moonPosition && (
        <MoonDisc azDeg={moonPosition.azimuthDeg} altDeg={moonPosition.altitudeDeg} fraction={moonPhase.fraction} waxing={moonPhase.waxing} />
      )}
      {issDrawn && satellites.iss && (
        <IssMarker azDeg={satellites.iss.look.azDeg} elDeg={satellites.iss.look.elDeg} visible={issState === "visible"} />
      )}
    </group>
  );
}
