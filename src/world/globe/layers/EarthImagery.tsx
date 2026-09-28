import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { EarthDots } from "../EarthDots.tsx";
import { GLOBE_RADIUS } from "../geoMath.ts";
import { useGlobe } from "../globeStore.ts";
import { Atmosphere } from "./Atmosphere.tsx";
import { dayImageryAttempts, gapFillUrl, isoDateUTC, nightLightsUrl, seaIceAttempts, shouldUpgradeHiDay, type ConnectionLike, type ImageryAttempt } from "./gibs.ts";
import { EARTH_IMAGERY_FRAG, INNER_HAZE_FRAG } from "./earthImageryShader.ts";
import { sunDirection, VERT } from "./sun.ts";

export interface EarthLayerProps {
  count: number;
  now: Date;
  tier: 1 | 2 | 3;
  earthRef?: RefObject<THREE.Mesh>;
}

// Sphere segments per tier: enough that the limb reads round at the default
// zoom (living-earth spec item 6). T3 never reaches this module (see below).
const SEGMENTS: Record<1 | 2, readonly [number, number]> = { 1: [128, 96], 2: [96, 64] };
const DAY_SIZE = { width: 2048, height: 1024 };
const HI_DAY_SIZE = { width: 4096, height: 2048 };
const NIGHT_SIZE: Record<1 | 2, { width: number; height: number }> = { 1: DAY_SIZE, 2: { width: 1024, height: 512 } };
// Sea ice only fills the polar caps, so it needs far less resolution.
const ICE_SIZE = { width: 1024, height: 512 };

// A 1x1 black placeholder so the shader always has a bound sampler before the
// real textures land — never visible: the component renders EarthDots, not
// this mesh, until the day texture is ready (see the early return below).
const PLACEHOLDER = (() => {
  const tex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat);
  tex.needsUpdate = true;
  return tex;
})();
// Fully transparent: "no ice anywhere" until (or unless) the MUR map loads.
const NO_ICE = (() => {
  const tex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat);
  tex.needsUpdate = true;
  return tex;
})();

function configureTexture(tex: THREE.Texture): THREE.Texture {
  // sRGB in, linear out of the sampler; earthImageryShader.ts's own
  // `#include <colorspace_fragment>` converts back for display (living-earth
  // spec item 8 — without both halves the real photo comes out washed out
  // or over-dark, not merely off-colour).
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8; // three clamps to the GPU's real max; see WebGLTextures
  tex.needsUpdate = true;
  return tex;
}

function loadTexture(url: string): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous"); // GIBS answers with access-control-allow-origin: *
    loader.load(url, resolve, undefined, () => reject(new Error(`EarthImagery: failed to load ${url}`)));
  });
}

/** Tries each attempt in order, returning the first that loads. `null` only
 *  when every rung of the chain failed — total failure (spec item 7). */
async function loadFirst(attempts: ImageryAttempt[]): Promise<{ tex: THREE.Texture; detail: string } | null> {
  for (const attempt of attempts) {
    try {
      return { tex: await loadTexture(attempt.url), detail: attempt.detail };
    } catch {
      // fall through to the next rung
    }
  }
  return null;
}

function idle(cb: () => void): void {
  if (typeof requestIdleCallback === "function") requestIdleCallback(cb);
  else setTimeout(cb, 2000);
}

/**
 * LANE L1 (real earth): the default "imagery" earth style — NASA GIBS daily
 * true-colour day side, Blue Marble gap fill, Black Marble night lights, a
 * sun-glint ocean and a thinner inner-limb haze on top of the shared
 * Atmosphere. Tier 3 and any total fetch failure fall back to the dot-matrix
 * earth (EarthDots) with an honest status, never a stale or fabricated frame
 * (living-earth spec item 7, house rule "never fake data").
 *
 * Cuts cleanly rather than crossfading (item 7's explicit alternative): dots
 * render until the day texture is actually in hand, then this swaps to the
 * photoreal mesh in one React commit. A true WebGL crossfade would mean
 * compositing two near-coincident spheres (z-fighting risk) for a transition
 * that happens once per page load — not worth the shader complexity here.
 */
export default function EarthImagery({ count, now, tier, earthRef }: EarthLayerProps) {
  const localRef = useRef<THREE.Mesh>(null!);
  const meshRef = (earthRef ?? localRef) as RefObject<THREE.Mesh>;
  const [dayTex, setDayTex] = useState<THREE.Texture | null>(null);
  const [failed, setFailed] = useState(false);

  const uniforms = useMemo(
    () => ({
      uSun: { value: new THREE.Vector3() },
      uDay: { value: PLACEHOLDER as THREE.Texture },
      uBase: { value: PLACEHOLDER as THREE.Texture },
      uNight: { value: PLACEHOLDER as THREE.Texture },
      uIce: { value: NO_ICE as THREE.Texture },
    }),
    [],
  );

  useEffect(() => {
    sunDirection(now, uniforms.uSun.value);
  }, [now, uniforms]);

  // Both materials below are CONSTRUCTED with this uniforms object (`args`),
  // so three binds this exact object and a texture swapped into `.value`
  // later reaches the GPU. Passed as a `uniforms` prop instead, R3F copies
  // each uniform once at mount into the material's own objects: a later
  // in-place Vector3 edit (uSun) still propagated, but a replaced Texture
  // never did, so the base, night lights, sea ice and the 4096 upgrade all
  // loaded and stayed invisible whenever they landed after the mesh mounted
  // (always, on a real network; never, against instant e2e fixtures).

  // Re-fetch only when the UTC calendar day (or the tier) actually changes,
  // never on every minute tick of `now` — a daily mosaic has one frame a day.
  const yesterday = useMemo(() => isoDateUTC(now, 1), [now]);

  useEffect(() => {
    if (tier === 3) return; // T3 never fetches (spec item 6): EarthDots only.
    let alive = true;
    const loaded: THREE.Texture[] = [];
    useGlobe.getState().setStatus("earth", { state: "loading", detail: "fetching NASA GIBS true-colour imagery" });

    (async () => {
      const day = await loadFirst(dayImageryAttempts(now, DAY_SIZE));
      if (!alive) {
        day?.tex.dispose();
        return;
      }
      if (!day) {
        setFailed(true);
        useGlobe.getState().setStatus("earth", { state: "failed", detail: "NASA GIBS unreachable on every fallback rung" });
        return;
      }
      loaded.push(configureTexture(day.tex));
      // Mutating a uniforms object's `.value` in place is the documented R3F
      // pattern for feeding three a live texture/vector without forcing a
      // shader recompile (sun.ts's useSunUniforms does the same to uSun) —
      // not a React-owned value, same escape hatch as Env.tsx's
      // useSkyEnvironment.
      // eslint-disable-next-line react-hooks/immutability
      uniforms.uDay.value = day.tex;
      setDayTex(day.tex);
      useGlobe.getState().setStatus("earth", { state: "live", detail: day.detail });

      // Gap fill and night lights are best-effort: their own failure just
      // means gaps and the night side stay unpatched, not a total failure.
      loadTexture(gapFillUrl(DAY_SIZE))
        .then((tex) => {
          if (!alive) return tex.dispose();
          loaded.push(configureTexture(tex));
          uniforms.uBase.value = tex;
        })
        .catch(() => {});
      loadTexture(nightLightsUrl(NIGHT_SIZE[tier]))
        .then((tex) => {
          if (!alive) return tex.dispose();
          loaded.push(configureTexture(tex));
          uniforms.uNight.value = tex;
        })
        .catch(() => {});

      loadFirst(seaIceAttempts(now, ICE_SIZE))
        .then((ice) => {
          if (!ice) return;
          if (!alive) return ice.tex.dispose();
          loaded.push(configureTexture(ice.tex));
          uniforms.uIce.value = ice.tex;
        })
        .catch(() => {});

      // T1 progressive upgrade: swap in a 4096x2048 day texture once idle —
      // but only on a fast, unmetered connection (audit fix, 2026-09-28: this
      // ~2+ MB extra download used to fire unconditionally on every T1
      // session). `navigator.connection` isn't in `lib dom`, hence the cast.
      const connection = (navigator as Navigator & { connection?: ConnectionLike }).connection;
      if (shouldUpgradeHiDay(tier, connection)) {
        idle(() => {
          if (!alive) return;
          loadTexture(dayImageryAttempts(now, HI_DAY_SIZE)[0].url)
            .then((hi) => {
              if (!alive) return hi.dispose();
              loaded.push(configureTexture(hi));
              const previous = uniforms.uDay.value;
              uniforms.uDay.value = hi;
              setDayTex(hi);
              if (previous !== PLACEHOLDER) previous.dispose();
            })
            .catch(() => {}); // stay on the 2048 texture already showing
        });
      }
    })();

    return () => {
      alive = false;
      for (const tex of loaded) tex.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `yesterday` (not `now`) is the real dependency: see the comment above it.
  }, [tier, yesterday]);

  const showDots = tier === 3 || failed || !dayTex;
  // e2e's own DOM-free-of-the-store seam (globe-lanes.md's ownership rule
  // forbids editing globeStore.ts/GlobeScene.tsx just to expose this): a
  // zero-footprint drei <Html> div carrying the two facts a test can't read
  // off the canvas alone. Rendered in BOTH branches so a test can see the
  // dots fallback and the failed status too, not only the happy path.
  const probe = (
    <Html center style={{ pointerEvents: "none" }} wrapperClass="sr-only">
      <div data-earth-style={showDots ? "dots" : "imagery"} data-earth-status={failed ? "failed" : dayTex ? "live" : "loading"} aria-hidden />
    </Html>
  );

  if (showDots) {
    return (
      <>
        {probe}
        <EarthDots count={count} now={now} earthRef={meshRef} />
      </>
    );
  }

  const segments = SEGMENTS[tier];

  return (
    <>
      {probe}
      <group>
        <mesh ref={meshRef}>
          <sphereGeometry args={[GLOBE_RADIUS, segments[0], segments[1]]} />
          <shaderMaterial args={[{ vertexShader: VERT, fragmentShader: EARTH_IMAGERY_FRAG, uniforms }]} />
        </mesh>
        <Atmosphere uniforms={uniforms} />
        {/* Thinner inner-limb haze, this lane's own addition alongside the shared Atmosphere. */}
        <mesh scale={1.02}>
          <sphereGeometry args={[GLOBE_RADIUS, segments[0], segments[1]]} />
          <shaderMaterial args={[{ vertexShader: VERT, fragmentShader: INNER_HAZE_FRAG, uniforms }]} side={THREE.BackSide} blending={THREE.AdditiveBlending} transparent depthWrite={false} />
        </mesh>
      </group>
    </>
  );
}
