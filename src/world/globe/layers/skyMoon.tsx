// The real Moon (LANE L2): true direction from src/lib/moon.ts's own
// RA/Dec, lit from the real sun direction (layers/sun.ts) so its phase is
// physically right, at a distance compressed from reality (comment below)
// so it reads as the Moon instead of vanishing as a point.
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { moonPhase, moonPosition, moonTimes } from "../../../lib/moon.ts";
import { latLonToXyz } from "../geoMath.ts";
import { useGlobe } from "../globeStore.ts";
import { useMarkerClick } from "../useMarkerClick.ts";
import { substellarLatLon } from "./skyMath.ts";
import { moonDistanceKm } from "./skyMoonMath.ts";
import { moonPhaseLabel } from "./skyMoonText.ts";
import { sunDirection, VERT } from "./sun.ts";

// Real distance is 60 Earth radii = 360 world units (GLOBE_RADIUS=6) - at
// that distance the Moon is a sub-pixel point, not a body. Compressed to a
// distance/size pair that reads as "the Moon in the sky" across this
// globe's whole zoom range (camera 9-42 units out, GlobeScene.tsx): still
// well outside the atmosphere shell, never dwarfing the 6-unit earth.
export const MOON_DISTANCE = 22;
export const MOON_RADIUS = 1.1;
const TEXTURE_URL = "/sky/moon-512x256.jpg";

// Reuses sun.ts's VERT (object-space normal in vW, correct here too since
// this mesh is only ever translated, never rotated/scaled). uHasMap covers
// the "never fake data" rule for a texture that fails to load: a flat grey
// sphere still phases correctly, it just isn't textured.
const FRAG = `uniform vec3 uSun;uniform sampler2D uMap;uniform float uHasMap;varying vec3 vW;varying vec2 vUv;
void main(){
  float lit=clamp(dot(normalize(vW),uSun)*1.5+0.12,0.02,1.0);
  vec3 base=uHasMap>0.5?texture2D(uMap,vUv).rgb:vec3(0.62,0.60,0.58);
  gl_FragColor=vec4(base*lit,1.0);
}`;

// Fresh parameter binding, not the memoized `uniforms` identifier itself -
// see skyStars.tsx's setTwinkle/tickTime comment for why.
function setMoonTexture(u: { uMap: { value: THREE.Texture | null }; uHasMap: { value: number } }, tex: THREE.Texture | null) {
  u.uMap.value = tex;
  u.uHasMap.value = tex ? 1 : 0;
}

function istClock(d: Date | null): string {
  return d ? d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }) : "—";
}

// One reused scratch vector for the probe's per-frame screen projection
// below (no per-frame allocation), the same technique GlobeScene.tsx's own
// SceneRig already uses for its subsolar-point probe.
const scratch = new THREE.Vector3();

export function SkyMoon({ now }: { now: Date }) {
  const [map, setMap] = useState<THREE.Texture | null>(null);
  const [hovered, setHovered] = useState(false);
  const select = useGlobe((s) => s.select);
  const markerClick = useMarkerClick(true);
  const probeRef = useRef<HTMLSpanElement | null>(null);

  // Test seam only (this lane's brief): a plain DOM node, created and
  // appended imperatively - NOT React's `createPortal`. A component
  // mounted inside <Canvas> is reconciled by @react-three/fiber's own
  // renderer, which processes a `createPortal`'s target purely through
  // ITS OWN host config (it has no built-in bridge back to react-dom); the
  // result is R3F trying to instantiate a "span" as a THREE class and
  // throwing "Span is not part of the THREE namespace" (reproduced, not
  // guessed - see this lane's report). drei's own <Html> sidesteps this
  // the same way: `ReactDOM.createRoot(el)` on a manually-made element
  // (node_modules/@react-three/drei/web/Html.js), never createPortal.
  // This probe needs no React tree of its own, just a DOM node to write a
  // dataset onto, so it skips even that and uses the raw DOM API.
  useEffect(() => {
    const el = document.createElement("span");
    el.dataset.moonProbe = "";
    el.setAttribute("aria-hidden", "true");
    Object.assign(el.style, { position: "fixed", width: "0", height: "0", overflow: "hidden", pointerEvents: "none" });
    document.body.appendChild(el);
    probeRef.current = el;
    return () => {
      el.remove();
      probeRef.current = null;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    const loader = new THREE.TextureLoader();
    const tex = loader.load(
      TEXTURE_URL,
      () => {
        if (!alive) return;
        tex.colorSpace = THREE.SRGBColorSpace;
        setMap(tex);
      },
      undefined,
      () => {
        /* texture 404/network failure: uHasMap stays 0, flat-shaded sphere still draws */
      },
    );
    return () => {
      alive = false;
      tex.dispose();
    };
  }, []);

  const position = useMemo((): [number, number, number] => {
    const { raHours, decDeg } = moonPosition(now);
    const { lat, lon } = substellarLatLon(raHours, decDeg, now);
    const p = latLonToXyz(lat, lon);
    return [p.x * MOON_DISTANCE, p.y * MOON_DISTANCE, p.z * MOON_DISTANCE];
  }, [now]);

  const uniforms = useMemo(
    () => ({ uSun: { value: new THREE.Vector3() }, uMap: { value: null as THREE.Texture | null }, uHasMap: { value: 0 } }),
    [],
  );
  useEffect(() => {
    sunDirection(now, uniforms.uSun.value);
  }, [now, uniforms]);
  useEffect(() => {
    setMoonTexture(uniforms, map);
  }, [map, uniforms]);

  // The Moon's own current screen projection, written into that DOM
  // node's dataset every frame - never React state - so
  // e2e/globe-L2.spec.ts can find where to click without a hand-maintained
  // pixel offset. Same (canvas-relative, not page-relative) coordinate
  // convention as GlobeScene.tsx's own data-subsolar-probe.
  useFrame((state) => {
    const el = probeRef.current;
    if (!el) return;
    scratch.set(position[0], position[1], position[2]).project(state.camera);
    el.dataset.moonX = String(Math.round((scratch.x * 0.5 + 0.5) * state.size.width));
    el.dataset.moonY = String(Math.round((-scratch.y * 0.5 + 0.5) * state.size.height));
  });

  function handleClick(e: ThreeEvent<MouseEvent>) {
    e.stopPropagation();
    markerClick(e.nativeEvent, () => {
      const phase = moonPhase(now);
      const times = moonTimes(now);
      select({
        id: "moon",
        kind: "moon",
        title: "The Moon",
        rows: [
          { label: "Phase", value: moonPhaseLabel(phase) },
          { label: "Illumination", value: `${Math.round(phase.fraction * 100)}%` },
          { label: "True distance", value: `${Math.round(moonDistanceKm(now)).toLocaleString("en-IN")} km` },
          { label: "Rises / sets (Pune)", value: `${istClock(times.rise)} / ${istClock(times.set)}` },
        ],
        // Computed for the shown instant (Meeus series, not a fetch) -
        // `live: false` because it never goes stale on a feed outage the way
        // a fetched reading could, but it also isn't a live poll: it is
        // whatever `now` (the real clock, or the time scrubber) currently is.
        source: "computed (Meeus series via src/lib/moon.ts)",
        live: false,
      });
    });
  }

  return (
    <mesh
      position={position}
      scale={hovered ? 1.06 : 1}
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
      <sphereGeometry args={[MOON_RADIUS, 48, 32]} />
      {/* Constructed WITH the uniforms object (args), not given it as a prop:
          R3F copies prop uniforms once at mount, so the texture and uHasMap
          set after the map loads would never reach the GPU. */}
      <shaderMaterial args={[{ vertexShader: VERT, fragmentShader: FRAG, uniforms }]} />
    </mesh>
  );
}
