import { useEffect, type RefObject } from "react";
import { useThree } from "@react-three/fiber";
import type { DirectionalLight, Fog, HemisphereLight } from "three";
import type { SkyState } from "../lib/sky.ts";
import { setSkyStops } from "./Sky.tsx";
import { tierBudget, type DeviceTier } from "./deviceTier.ts";

/**
 * §4.1 — THE SKY BINDING. The one pure function that turns a `SkyState`
 * (real sun + live weather, P1/P2) into what the two scene lights, the
 * dome (Sky.tsx) and the fog actually get set to. Zero three.js imports
 * here on purpose: this stays a plain function of data so
 * skyBinding.test.ts can assert it without a renderer.
 *
 * AXIS CONVENTION (declared, not measured — reality-spec §4.1): +X is
 * east, -Z is north. The world is an abstract map, so the key light's
 * (x, z) swing across the day is this convention applied to the sun's
 * real compass azimuth, not a claim about true north.
 */

/** Night Survey's own fixed rig position (World.tsx's original literal,
 *  now the one place it lives). At or below the night keyframe's altitude
 *  break this is returned byte-for-byte — never a trig near-miss — so
 *  `worldLighting` at night deep-equals it (M48/M49). */
export const NIGHT_SUN_POS: readonly [number, number, number] = [-122, 28, 18];

/** sky.ts's own night breakpoint (`ALT_BREAKS[0]`) — restated here rather
 *  than imported, since sky.ts doesn't export its private breakpoint list.
 *  `keyframeAt` never extrapolates past it, so any altitude at or below
 *  this always carries the identical NIGHT_SURVEY keyframe by construction
 *  (sky.ts's own comment); pinning the position at the same threshold
 *  keeps the light and the colour changing together, never one before the
 *  other. */
const NIGHT_ALT_BREAK = -18;

/** The night rig's own throw — every other daypart's key light orbits at
 *  this same distance, so only the ANGLE moves across the day, never how
 *  far away the sun sits. */
const RIG_RADIUS = Math.hypot(...NIGHT_SUN_POS);
const RAD = Math.PI / 180;
/** How high the key light climbs at the sun's own zenith (~71deg over
 *  Pune) — a fixed ceiling rather than RIG_RADIUS*sin(alt) unclamped,
 *  which would swing the light almost straight overhead at local noon and
 *  flatten the 13deg raking relief the art-direction doc calls for
 *  (Terrain's relief reads from a LOW, raking key, day or night alike). */
const DAY_ELEVATION_DEG = 22;

export interface WorldLighting {
  sunPos: readonly [number, number, number];
  /** 0..1 RGB — Keyframe.sun's own units, handed straight to
   *  `Color.setRGB`, no hex round-trip. */
  sunColor: readonly [number, number, number];
  sunI: number;
  hemi: readonly [sky: string, ground: string, intensity: number];
  zenith: string;
  horizon: string;
  /** Combines the sky keyframe's own atmospheric range with the device
   *  tier's performance cap — whichever pulls fog IN wins, so a throttled
   *  device never renders further than its budget even at midday, and the
   *  night keyframe's own tight range still narrows a desktop. */
  fog: readonly [near: number, far: number];
}

/** The pure sky-state + device-tier -> light/fog mapping (reality-spec
 *  §4.1). `tier` only ever tightens the atmosphere's own near/far, never
 *  the colour or the light's position — a throttled phone still shows
 *  today's real sky, just a shorter slice of it. */
export function worldLighting(s: SkyState, tier: DeviceTier): WorldLighting {
  const { k, sun } = s;
  const budget = tierBudget(tier);

  let sunPos: readonly [number, number, number];
  if (sun.altitudeDeg <= NIGHT_ALT_BREAK) {
    sunPos = NIGHT_SUN_POS;
  } else {
    const azRad = sun.azimuthDeg * RAD;
    // altitude climbs the light from the horizon toward DAY_ELEVATION_DEG;
    // clamped at 0 so a below-horizon dawn/dusk altitude never drops the
    // key light beneath the ground plane.
    const elevDeg = Math.max(0, Math.min(DAY_ELEVATION_DEG, (sun.altitudeDeg / 90) * DAY_ELEVATION_DEG + DAY_ELEVATION_DEG * 0.3));
    const elevRad = elevDeg * RAD;
    const horizontal = RIG_RADIUS * Math.cos(elevRad);
    sunPos = [
      horizontal * Math.sin(azRad), // +X east
      RIG_RADIUS * Math.sin(elevRad),
      -horizontal * Math.cos(azRad), // -Z north
    ];
  }

  return {
    sunPos,
    sunColor: k.sun,
    sunI: k.sunI,
    hemi: [k.hemiSky, k.hemiGround, k.hemiI],
    zenith: k.zenith,
    horizon: k.horizon,
    fog: [Math.max(k.fogNear, budget.fogNearFar[0]), Math.min(k.fogFar, budget.fogNearFar[1])],
  };
}

/**
 * THE ZERO-RENDER BINDER — mounted once inside `<Canvas>`. Renders nothing
 * (returns `null`); every effect below is the only thing it does.
 *
 * Takes `sky` as a prop rather than calling `useSky()` itself.
 *
 * ponytail: reality-spec §4.1 asks for `useSky()` called INSIDE this leaf
 * so World.tsx's own render "never re-renders for the sky." World.tsx
 * calls it once instead and hands `sky` down (to this binder, to Ghosts'
 * `ghostFactor`, and to Hud's ledger, which needs the identical reading
 * anyway) — one subscription instead of three, at the cost of World.tsx
 * re-rendering once a minute when the clock ticks. Its own children are
 * already `memo`-wrapped (World.tsx's own doc comment), so that's a cheap
 * prop-equality pass, not a re-render storm. Split `sky` back out to a
 * store-based hook (`useSyncExternalStore`, same shape as
 * `useLiveSignal.ts`) if profiling ever shows this on a real device.
 *
 * Writes imperatively, in a `useEffect` keyed on the derived lighting —
 * once per `SkyState` change, never per frame: the two light refs
 * (World.tsx owns mounting `<directionalLight ref={sunRef}>` /
 * `<hemisphereLight ref={hemiRef}>` with today's exact Night Survey
 * literals as their JSX defaults, so the one frame before this effect's
 * first run — before `sky` has ticked once — still renders the
 * art-directed baseline), `Sky.tsx`'s module-scope uniforms via
 * `setSkyStops`, and the scene's own `Fog` object in place (mutating
 * `.color`/`.near`/`.far` rather than replacing it, so World.tsx's static
 * `<fog attach="fog">` JSX — still the correct pre-mount default — is
 * never fought over two owners).
 */
export function SkyBinding(props: {
  sunRef: RefObject<DirectionalLight | null>;
  hemiRef: RefObject<HemisphereLight | null>;
  sky: SkyState | null;
  tier: DeviceTier;
}): null {
  const { sunRef, hemiRef, sky, tier } = props;
  const scene = useThree((state) => state.scene);

  useEffect(() => {
    if (!sky) return;
    const lighting = worldLighting(sky, tier);

    const sun = sunRef.current;
    if (sun) {
      sun.position.set(...lighting.sunPos);
      sun.color.setRGB(...lighting.sunColor);
      sun.intensity = lighting.sunI;
    }
    const hemi = hemiRef.current;
    if (hemi) {
      hemi.color.set(lighting.hemi[0]);
      hemi.groundColor.set(lighting.hemi[1]);
      hemi.intensity = lighting.hemi[2];
    }
    setSkyStops(lighting.zenith, lighting.horizon);
    const fog = scene.fog as Fog | null;
    if (fog) {
      fog.color.set(lighting.horizon);
      fog.near = lighting.fog[0];
      fog.far = lighting.fog[1];
    }
    // sunRef/hemiRef are stable ref objects (World.tsx's own useRef) — not
    // listed, same reasoning World.tsx's own effects already use for a
    // stable-identity dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sky, tier, scene]);

  return null;
}
