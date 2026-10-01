import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Html } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { EarthDots } from "../EarthDots.tsx";
import { GLOBE_RADIUS } from "../geoMath.ts";
import { useGlobe } from "../globeStore.ts";
import { Atmosphere } from "./Atmosphere.tsx";
import { dayImageryAttempts, gapFillUrl, gibsGetMapUrl, isoDateUTC, nightLightsUrl, reliefUrl, seaIceAttempts, shouldUpgradeHiDay, VIIRS_TRUE_COLOR, type ConnectionLike, type ImageryAttempt } from "./gibs.ts";
import { EARTH_IMAGERY_FRAG, INNER_HAZE_FRAG } from "./earthImageryShader.ts";
import { sunDirection, VERT } from "./sun.ts";
import { createGibsTimeline } from "../timeMachine/gibsDates.ts";
import { useCompare } from "../timeMachine/compareStore.ts";

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
  // WAVE 6 LANE X3: bumped once per time-lapse frame that finishes loading.
  // tlTexturesRef is a plain ref (deliberately: it never needs its own
  // re-render, dozens of frames may resolve independently), but a ref
  // mutation alone never re-triggers the effect below that reads it, so the
  // FIRST scrub into a new day always found the map still empty (the fetch
  // is async, the read was synchronous) and then never looked again — no
  // future offset change would have re-run that effect on its own. This
  // state exists only to be a dependency, forcing exactly that recheck.
  const [tlVersion, setTlVersion] = useState(0);

  const uniforms = useMemo(
    () => ({
      uSun: { value: new THREE.Vector3() },
      uDay: { value: PLACEHOLDER as THREE.Texture },
      uBase: { value: PLACEHOLDER as THREE.Texture },
      uNight: { value: PLACEHOLDER as THREE.Texture },
      uIce: { value: NO_ICE as THREE.Texture },
      uCloudReady: { value: 0 },
      uRelief: { value: PLACEHOLDER as THREE.Texture },
      uReliefReady: { value: 0 },
      // WAVE 7 LANE V2: night-lights gain feeding GlobePost.tsx's Bloom
      // threshold (>= 1.0) — see earthImageryShader.ts's own comment.
      uNightGain: { value: 1.6 },
      // WAVE 6 LANE X3: daily time-lapse (crossfade between two preloaded
      // VIIRS days) and swipe compare (a chosen past day vs literal today).
      // Both start inactive (0) so an ordinary visitor who never scrubs
      // pays nothing beyond four extra float/texture uniforms.
      uTLOlder: { value: PLACEHOLDER as THREE.Texture },
      uTLNewer: { value: PLACEHOLDER as THREE.Texture },
      uTLBlend: { value: 0 },
      uTLActive: { value: 0 },
      uComparePast: { value: PLACEHOLDER as THREE.Texture },
      uCompareActive: { value: 0 },
      uSplit: { value: 0.5 },
      uResolution: { value: new THREE.Vector2(1, 1) },
    }),
    [],
  );

  useEffect(() => {
    sunDirection(now, uniforms.uSun.value);
  }, [now, uniforms]);

  // WAVE 6 LANE X3: daily time-lapse. gl_FragCoord is in physical pixels,
  // so the shader's screen-space compare split needs the drawing buffer's
  // real size (CSS size * devicePixelRatio), not R3F's CSS-pixel `size`.
  // Selector form, not bare `useThree()`: that subscribes to the WHOLE R3F
  // store, re-rendering this component on every camera move — `size` alone
  // (stable except on an actual resize) is the only reactive input the
  // split needs.
  const size = useThree((s) => s.size);
  const gl = useThree((s) => s.gl); // a stable reference across the session, so this selector never itself triggers a re-render
  useEffect(() => {
    uniforms.uResolution.value.set(gl.domElement.width, gl.domElement.height);
  }, [size, gl, uniforms]);

  const offset = useGlobe((s) => s.timeOffsetMin);
  // ponytail: anchored once at mount/tier change, not rebuilt across a real
  // UTC midnight mid-session (gibsDates.test.ts's own guidance: "rebuild on
  // a day/tier change" — a session that happens to span midnight just keeps
  // showing the frame list it started with until a reload; low odds, low
  // stakes, not worth a clock-watching effect for a background layer).
  const timeline = useMemo(() => (tier === 3 ? null : createGibsTimeline(new Date(), tier)), [tier]);
  const tlTexturesRef = useRef<Map<string, THREE.Texture>>(new Map());
  const tlRequestedRef = useRef(false);
  const liveDetailRef = useRef("");

  // "Lazily preloaded once the visitor starts scrubbing" (spec item 3): not
  // fetched at page load, but the whole tier-sized window (T1 7 days, T2 3)
  // fetched together the first time the offset leaves 0, so continued
  // scrubbing or playback crossfades instantly instead of stalling on a
  // network round-trip at each day boundary.
  useEffect(() => {
    if (!timeline || offset === 0 || tlRequestedRef.current) return;
    tlRequestedRef.current = true;
    let alive = true;
    const textures = tlTexturesRef.current; // snapshot: the cleanup below must dispose this exact map even if the ref is reassigned before it runs
    for (const frame of timeline.frames) {
      loadTexture(frame.url)
        .then((tex) => {
          if (!alive) return tex.dispose();
          textures.set(frame.date, configureTexture(tex));
          setTlVersion((v) => v + 1); // wakes the status/uniform effect below, which otherwise never learns this arrived
        })
        .catch(() => {}); // that one day just stays unavailable; frameForTime's blend falls back to the live image below until it (or its neighbour) arrives
    }
    return () => {
      alive = false;
      for (const tex of textures.values()) tex.dispose();
      textures.clear();
    };
  }, [timeline, offset]);

  useEffect(() => {
    const isPastDay = timeline !== null && offset < 0 && isoDateUTC(now, 0) !== isoDateUTC(new Date(), 0);
    const frame = isPastDay ? timeline!.frameForTime(now.getTime()) : null;
    const olderTex = frame && tlTexturesRef.current.get(timeline!.frames[frame.older].date);
    const newerTex = frame && tlTexturesRef.current.get(timeline!.frames[frame.newer].date);
    if (!frame || !olderTex || !newerTex) {
      // Still loading, beyond the preloaded window, or not scrubbed into
      // the past at all: show the live image rather than a wrong or
      // half-loaded date (house rule — never fake data).
      // eslint-disable-next-line react-hooks/immutability -- same escape hatch as this file's own uDay.value assignment below: a live Texture into a useMemo'd uniforms object, not React state.
      uniforms.uTLActive.value = 0;
      if (isPastDay && liveDetailRef.current) useGlobe.getState().setStatus("earth", { state: "live", detail: liveDetailRef.current });
      return;
    }
    // Only the first mutation in this scope needs its own disable comment
    // (the linter reports one bail-out per reactive scope, not per line);
    // these three share it.
    uniforms.uTLOlder.value = olderTex;
    uniforms.uTLNewer.value = newerTex;
    uniforms.uTLBlend.value = frame.blend;
    uniforms.uTLActive.value = 1;
    const shownDate = timeline!.frames[frame.newer].date;
    useGlobe.getState().setStatus("earth", { state: "live", detail: `NASA GIBS VIIRS true colour (time machine), ${shownDate}` });
  }, [timeline, offset, now, uniforms, tlVersion]);

  // WAVE 6 LANE X3: swipe compare. Only the chosen past-date texture is
  // this layer's own concern — the split position and which two dates are
  // being compared live in compareStore.ts, shared with the divider UI
  // (ui/CompareDivider.tsx, mounted from TimeScrubber.tsx).
  const compareState = useCompare((s) => s.state);
  const comparePastKeyRef = useRef("");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability -- see the uDay.value comment below.
    uniforms.uCompareActive.value = compareState ? 1 : 0;
    if (compareState) uniforms.uSplit.value = compareState.split;
  }, [compareState, uniforms]);
  useEffect(() => {
    if (!compareState) return;
    const key = `${compareState.left.dateMs}`;
    if (comparePastKeyRef.current === key) return;
    comparePastKeyRef.current = key;
    let alive = true;
    // The exact chosen date, not dayImageryAttempts' "yesterday of" chain
    // (that would land one day earlier than the date compare.ts is showing
    // in its own left-side label). One direct GIBS request, no fallback
    // chain — this is a nice-to-have second view, not the primary earth
    // style; a failure just means the compare split shows the live image
    // on both sides rather than blocking the whole feature on a retry.
    loadTexture(gibsGetMapUrl(VIIRS_TRUE_COLOR, DAY_SIZE, isoDateUTC(new Date(compareState.left.dateMs), 0)))
      .then((tex) => {
        if (!alive) return tex.dispose();
        configureTexture(tex);
        const previous = uniforms.uComparePast.value;
        uniforms.uComparePast.value = tex;
        if (previous !== PLACEHOLDER) previous.dispose();
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [compareState, uniforms]);

  // Both materials below are CONSTRUCTED with this uniforms object (`args`),
  // so three binds this exact object and a texture swapped into `.value`
  // later reaches the GPU. Passed as a `uniforms` prop instead, R3F copies
  // each uniform once at mount into the material's own objects: a later
  // in-place Vector3 edit (uSun) still propagated, but a replaced Texture
  // never did, so the base, night lights, sea ice and the 4096 upgrade all
  // loaded and stayed invisible whenever they landed after the mesh mounted
  // (always, on a real network; never, against instant e2e fixtures).

  // Re-fetch only when the UTC calendar day (or the tier) actually changes,
  // never on every minute tick of `now` — a daily mosaic has one frame a
  // day. WAVE 6 LANE X3: anchored to REAL today, not the scrubbed `now`
  // prop — a visitor scrubbing into the past used to trigger a full GIBS
  // refetch (and a visible cut) on every day boundary crossed. Showing a
  // different past day while scrubbing is gibsDates' job now (the
  // time-lapse block below, a crossfade over preloaded frames), not a
  // network round-trip on the one "live" day texture every other layer in
  // this file (base, night, relief, ice) also depends on.
  //
  // ponytail: fetched once per tier (not re-checked against a real UTC-day
  // rollover mid-session, same simplification as the time-lapse timeline
  // above) — `new Date()` is read inside the effect body, never during
  // render, so this stays a pure component.

  useEffect(() => {
    if (tier === 3) return; // T3 never fetches (spec item 6): EarthDots only.
    let alive = true;
    const loaded: THREE.Texture[] = [];
    useGlobe.getState().setStatus("earth", { state: "loading", detail: "fetching NASA GIBS true-colour imagery" });

    (async () => {
      const day = await loadFirst(dayImageryAttempts(new Date(), DAY_SIZE));
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
      liveDetailRef.current = day.detail; // time-lapse's own status effect restores this once it steps back to "now"

      // Gap fill and night lights are best-effort: their own failure just
      // means gaps and the night side stay unpatched, not a total failure.
      loadTexture(gapFillUrl(DAY_SIZE))
        .then((tex) => {
          if (!alive) return tex.dispose();
          loaded.push(configureTexture(tex));
          uniforms.uBase.value = tex;
          uniforms.uCloudReady.value = 1;
        })
        .catch(() => {});
      // Relief is data, not colour: sample it raw (NoColorSpace) so the
      // shader's neutral 0.564 is the value it actually reads.
      loadTexture(reliefUrl(NIGHT_SIZE[tier]))
        .then((tex) => {
          if (!alive) return tex.dispose();
          loaded.push(configureTexture(tex));
          tex.colorSpace = THREE.NoColorSpace;
          uniforms.uRelief.value = tex;
          uniforms.uReliefReady.value = 1;
        })
        .catch(() => {});
      loadTexture(nightLightsUrl(NIGHT_SIZE[tier]))
        .then((tex) => {
          if (!alive) return tex.dispose();
          loaded.push(configureTexture(tex));
          uniforms.uNight.value = tex;
        })
        .catch(() => {});

      loadFirst(seaIceAttempts(new Date(), ICE_SIZE))
        .then((ice) => {
          if (!ice) return;
          if (!alive) return ice.tex.dispose();
          loaded.push(configureTexture(ice.tex));
          // render.md finding 2: MUR ice concentration is data, not colour —
          // earthImageryShader.ts reads ice.r/ice.a as a raw 0..1 fraction fed
          // straight into a linear mix(), same as uRelief two blocks above.
          // configureTexture() defaults every texture to SRGBColorSpace for
          // the common (real-photo) case, so this one has to be overridden
          // back, exactly like uRelief's own override.
          ice.tex.colorSpace = THREE.NoColorSpace;
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
          loadTexture(dayImageryAttempts(new Date(), HI_DAY_SIZE)[0].url)
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
      uniforms.uCloudReady.value = 0;
      uniforms.uReliefReady.value = 0;
      for (const tex of loaded) tex.dispose();
    };
    // `now` (the scrubbed instant) is genuinely unused here now — see the
    // comment above.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `uniforms` is the useMemo'd, stable object every mutation above targets; listing it (or its individual mutated properties, which the linter would otherwise ask for) would only make this effect look like it depends on values it merely writes.
  }, [tier]);

  const showDots = tier === 3 || failed || !dayTex;
  // WAVE 6 LANE X3: the status detail string (day-fetch/time-lapse/compare
  // effects above all write it via setStatus("earth", ...)) has nowhere else
  // to surface — "earth" is a StatusKey but not a LayerId, so LayerPanel's
  // own health rows (which map LAYER_IDS) never render it. Read live rather
  // than reconstructed locally, so this probe always names whatever date the
  // shader is actually showing, never a value this component guessed.
  const earthDetail = useGlobe((s) => s.status.earth?.detail);
  // e2e's own DOM-free-of-the-store seam (globe-lanes.md's ownership rule
  // forbids editing globeStore.ts/GlobeScene.tsx just to expose this): a
  // zero-footprint drei <Html> div carrying the facts a test can't read
  // off the canvas alone. Rendered in BOTH branches so a test can see the
  // dots fallback and the failed status too, not only the happy path.
  const probe = (
    <Html center style={{ pointerEvents: "none" }} wrapperClass="sr-only">
      <div
        data-earth-style={showDots ? "dots" : "imagery"}
        data-earth-status={failed ? "failed" : dayTex ? "live" : "loading"}
        data-earth-detail={earthDetail ?? ""}
        aria-hidden
      />
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
