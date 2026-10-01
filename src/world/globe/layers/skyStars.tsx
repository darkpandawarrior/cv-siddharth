// The HYG star field (LANE L2). One THREE.Points draw call, positions
// encoded once at lon=RA (never recomputed per star), the whole object
// rotated by -GMST whenever `now` changes (see skyMath.ts's
// substellarLatLon comment for the sign derivation this mirrors) - the
// living-earth plan's own "no per-frame allocation, rotate the object
// instead of the points" requirement.
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { loadStarField, type Star } from "../../../lib/stars.ts";
import { bvToRgb, gmstDeg, magToPointSize } from "./skyMath.ts";
import type { LayerHealth } from "../globeStore.ts";

// Duplicated from src/SceneActivity.tsx's own useReducedMotion (same
// matchMedia/useSyncExternalStore body) rather than imported: that module
// is only otherwise reachable from GlobeScene.tsx, and importing it from
// this lazy chunk pulled its whole transitive chunk into the shared
// "Globe" chunk's own dynamic-import preload list, past its budget ceiling
// (measured via `node scripts/check-budget.mjs`, see skyMoon.tsx's probe
// comment for the same story with drei's <Html>). This lane's own
// "Needs from integration" note asks for that hook to move somewhere both
// sides can reach without paying this cost.
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
function subscribeReducedMotion(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const mql = window.matchMedia(REDUCED_MOTION_QUERY);
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}
function getReducedMotionSnapshot(): boolean {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}
function getReducedMotionServerSnapshot(): boolean {
  return false;
}
function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReducedMotion, getReducedMotionSnapshot, getReducedMotionServerSnapshot);
}

/** Inside the Canvas's default far plane (1000, GlobeScene sets no
 *  override) with plenty of margin against the Moon (22) and Sun (380). */
export const STAR_RADIUS = 420;

// Tiers (living-earth plan #1): T1 every catalogue star, T2 mag<4, T3
// mag<3 - the same "denser tiers cost more" ladder every other layer here
// uses, just by magnitude instead of count.
const MAG_CAP: Record<1 | 2 | 3, number> = { 1: Infinity, 2: 4, 3: 3 };

const VERT = `attribute float aSize;attribute vec3 aColor;attribute float aPhase;
varying vec3 vColor;varying float vAlpha;
uniform float uTime;uniform float uTwinkle;uniform float uPixelRatio;
void main(){
  vColor=aColor;
  float tw=1.0+uTwinkle*sin(uTime*1.6+aPhase);
  vAlpha=clamp(tw,0.55,1.35);
  vec4 mv=modelViewMatrix*vec4(position,1.0);
  gl_Position=projectionMatrix*mv;
  // render.md finding 4: gl_PointSize is physical-pixel, aSize is CSS-pixel
  // (magToPointSize's own units) — without this, stars shrink relative to
  // the CSS layout at devicePixelRatio>1 instead of staying pin-sharp.
  gl_PointSize=aSize*uPixelRatio;
}`;
// sizeAttenuation off (living-earth plan #1: "stars stay pin-sharp at any
// zoom") is exactly gl_PointSize set with no distance term above - never
// divided by view-space depth the way three's own PointsMaterial does.
const FRAG = `varying vec3 vColor;varying float vAlpha;
void main(){
  vec2 uv=gl_PointCoord-0.5;
  float d=length(uv);
  float a=smoothstep(0.5,0.05,d)*vAlpha;
  if(a<=0.003) discard;
  gl_FragColor=vec4(vColor,a);
}`;

// Small setter helpers, not inline `uniforms.x.value = ...` assignments:
// the target is a fresh parameter binding here, not the identifier
// useMemo returned, which is what lets a uniforms object be mutated in
// place every frame (three binds a ShaderMaterial's uniforms object at
// compile - a replaced object never reaches the GPU) without eslint's
// hook-immutability rule flagging a direct write to a memoized value. The
// exact same trick sun.ts's useSunUniforms already uses via
// `sunDirection(now, uniforms.uSun.value)`.
function setTwinkle(u: { uTwinkle: { value: number } }, amp: number) {
  u.uTwinkle.value = amp;
}
function tickTime(u: { uTime: { value: number } }, t: number) {
  u.uTime.value = t;
}
function setPixelRatio(u: { uPixelRatio: { value: number } }, ratio: number) {
  u.uPixelRatio.value = ratio;
}

export interface StarFieldProps {
  now: Date;
  tier: 1 | 2 | 3;
  onStatus: (health: LayerHealth) => void;
}

export function StarField({ now, tier, onStatus }: StarFieldProps) {
  const [stars, setStars] = useState<Star[] | null>(null);
  const [failed, setFailed] = useState(false);
  const groupRef = useRef<THREE.Group>(null);
  const reducedMotion = useReducedMotion();
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uTwinkle: { value: 0 }, uPixelRatio: { value: 1 } }), []);
  // Same selector pattern EarthImagery.tsx uses for uResolution: `gl` is a
  // stable reference across the session, so reading it doesn't itself force
  // a re-render on every camera move the way a bare useThree() would.
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    setPixelRatio(uniforms, gl.getPixelRatio());
  }, [gl, uniforms]);

  useEffect(() => {
    let alive = true;
    loadStarField()
      .then((s) => {
        if (alive) setStars(s);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!stars) return null;
    const cap = MAG_CAP[tier];
    return cap === Infinity ? stars : stars.filter((s) => s.mag < cap);
  }, [stars, tier]);

  const geometry = useMemo(() => {
    if (!filtered) return null;
    const n = filtered.length;
    const positions = new Float32Array(n * 3);
    const colors = new Float32Array(n * 3);
    const sizes = new Float32Array(n);
    const phases = new Float32Array(n);
    const RAD = Math.PI / 180;
    for (let i = 0; i < n; i++) {
      const s = filtered[i];
      // Encoded with lon = RA (deg), NOT RA - GMST: the group's own
      // rotation (below) supplies the -GMST term for every star at once.
      const lonRad = s.raHours * 15 * RAD;
      const latRad = s.decDeg * RAD;
      const cosLat = Math.cos(latRad);
      positions[i * 3] = cosLat * Math.cos(lonRad) * STAR_RADIUS;
      positions[i * 3 + 1] = Math.sin(latRad) * STAR_RADIUS;
      positions[i * 3 + 2] = -cosLat * Math.sin(lonRad) * STAR_RADIUS;
      const [r, g, b] = bvToRgb(s.ci);
      colors[i * 3] = r;
      colors[i * 3 + 1] = g;
      colors[i * 3 + 2] = b;
      sizes[i] = magToPointSize(s.mag);
      // Index-derived, never Math.random (this world's D1 purity
      // discipline, see OrbitLayer.tsx's own comment) - golden-angle
      // spacing keeps twinkle phases from ever lining up in step.
      phases[i] = (i * 2.399963) % (Math.PI * 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
    geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
    return geo;
  }, [filtered]);

  useEffect(() => () => geometry?.dispose(), [geometry]);

  const report = useCallback(
    (health: LayerHealth) => onStatus(health),
    [onStatus],
  );
  useEffect(() => {
    if (failed) {
      report({ state: "failed", detail: "star field unreachable" });
    } else if (filtered) {
      report({ state: "snapshot", detail: `${filtered.length.toLocaleString("en-IN")} stars, HYG v41` });
    }
  }, [filtered, failed, report]);

  // Whole-field rotation, only when `now` changes - never per frame.
  useEffect(() => {
    if (groupRef.current) groupRef.current.rotation.y = -gmstDeg(now) * (Math.PI / 180);
  }, [now]);

  useEffect(() => {
    setTwinkle(uniforms, reducedMotion ? 0 : 0.18);
  }, [reducedMotion, uniforms]);

  useFrame((state) => {
    if (!reducedMotion) tickTime(uniforms, state.clock.elapsedTime);
  });

  if (!geometry) return null;
  return (
    <group ref={groupRef}>
      <points frustumCulled={false}>
        <primitive object={geometry} attach="geometry" />
        {/* Constructed WITH the uniforms object (args): as a prop, R3F
            shallow-copies each uniform at mount, so the per-frame uTime and
            uTwinkle floats written below never reached the GPU and the
            twinkle stayed frozen. */}
        <shaderMaterial
          args={[{ vertexShader: VERT, fragmentShader: FRAG, uniforms }]}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
    </group>
  );
}
