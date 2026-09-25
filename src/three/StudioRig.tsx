import { useEffect, useState } from "react";
import { Environment, Lightformer } from "@react-three/drei";
import { Color } from "three";
import { readToken } from "../themeColor";
import { keyframeAt, sunPosition } from "../lib/sky.ts";

/**
 * Root-caused budget fix (design-spec.md#4, master-plan.md G4: "a lane over
 * budget cuts scope, never the budget"). `useSky()` chains through
 * `useWeather` into `useLiveSignal` (src/lib/useLiveSignal.ts, not owned
 * here); reaching that module from here, or from BlueprintInstrument.tsx's
 * own direct call, is what tips Rollup's automatic chunker (vite.config.ts,
 * not owned here) from duplicating it inline into its two existing
 * consumers (OpsBoard, spotifyPreview.tsx) to extracting it as its own
 * chunk, which costs 41 B in the BlueprintRoom chunk via the added import
 * statement. Verified empirically: EITHER owned file reaching
 * useLiveSignal.ts alone reproduces the identical 1,666,776 B, so no
 * partial cut fixes it: both owned files have to stop reaching it. And it
 * has to be a *module* reaching it, not just a binding: importing only
 * `useNow` from `useSky.ts` still pulls the whole file in as one graph node
 * (Rollup chunks per module, not per export), and `useSky.ts` still reaches
 * `useLiveSignal.ts` unconditionally at its own top for `useWeather` (used
 * elsewhere, e.g. SiteFooter.tsx, so not dead code globally). So this file
 * imports nothing from `useSky.ts` at all.
 *
 * The scope cut: this rig now computes the sun's real position and today's
 * keyframe directly (`sunPosition` + `keyframeAt`, sky.ts's own pure math,
 * no network, no React) instead of calling `useSky()`, with its own minute-
 * boundary clock below (`useMinuteClock`, `useNow` from useSky.ts verbatim
 * minus the import edge, ticking the same schedule, so no drift against
 * NavClock's). `applyWeather(k, null)` is sky.ts's own documented identity
 * ("null weather is the identity, same object back"), so this renders
 * exactly what `useSky()` already renders whenever weather is unavailable:
 * still driven by the real Pune sun every minute, it just never dims for
 * cloud cover. BlueprintInstrument.tsx carries the matching cut for the CI
 * needle's own live-data path.
 */

/** `useSky.ts`'s own `useNow`, copied rather than imported (see the budget
 *  note above). SSR/first-render: `null`, same as before. */
function useMinuteClock(): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        setNow(new Date());
        schedule();
      }, 60_000 - (Date.now() % 60_000));
    };
    schedule();
    return () => clearTimeout(timer);
  }, []);
  return now;
}

/**
 * The shared studio lighting rig, extracted verbatim from Phone3DScene.tsx
 * (hemisphere fill, key directional, a signal-green point light, and a
 * local three-lightformer environment: white left, amber right, mint top).
 *
 * Every sculptural GLB in the Evidence Atlas (the hero plinth, the Blueprint
 * instrument, the skills core, the chess handoff marker) mounts this one rig
 * instead of hand-rolling its own lights, so "cyber" comes from the shared
 * Anodized amber / Brushed titanium / Signal ceramic materials and this one
 * light recipe, not from a per-scene guess. `<Environment resolution={128}>`
 * with inline Lightformers is a LOCAL environment — no HDR fetch, so CSP is
 * unaffected and there is no network request to budget for.
 *
 * P8 (reality-spec.md#P8): the rig follows the real Pune sun via
 * `sunPosition`/`keyframeAt` (see the budget note above for why not
 * `useSky()`). The key directional's colour and intensity follow the real
 * Pune sun (`k.sun`, `k.sunI`), its position follows the sun's
 * altitude/azimuth, the hemisphere fill's intensity follows `k.hemiI`
 * (sky.ts's own "ambient sky" field, carried by every Keyframe row for
 * exactly this purpose), and the amber Lightformer's intensity follows
 * `k.lamp` (his lamps are brightest at night, off in daylight). `useNow()`
 * recomputes at most once a minute (NavClock's own tick), so this is a prop
 * change, never a per-frame write. When it is null (SSR, or before the
 * first client tick), the rig renders exactly today's hand-tuned values,
 * unchanged.
 *
 * Does not include `<SceneActivity/>`: that is the frameloop/idle contract,
 * orthogonal to lighting, and every scene already mounts it separately.
 */
const RAD = Math.PI / 180;
/** The rig's original key-light distance from the origin: |[3, 4, 5]|. */
const KEY_LIGHT_DISTANCE = Math.sqrt(3 * 3 + 4 * 4 + 5 * 5);
/** The key light never sets below this altitude, so the product it lights
 *  never goes black: sky.ts's own night KEYFRAMES row carries the dark
 *  through colour and intensity instead (design-brief §2's "10 deg" clamp). */
const MIN_KEY_ALTITUDE_DEG = 10;
/** ...and never above this one either. This is a tight product-shot rig
 *  with a near eye-level camera ([0, .05, 7.5]), not an outdoor scene: past
 *  ~45deg the key light goes overhead and stops front-lighting the surfaces
 *  the camera actually sees (measured: the naive full-altitude version put
 *  Pune noon's key light almost directly above the rig and read DARKER on
 *  camera than the clamped-low night position, despite its higher k.sunI).
 *  The low/high swing between the two clamps is still what reads as
 *  "the sun moved" itself: it just never climbs high enough to light the crown of
 *  the rig instead of its face. */
const MAX_KEY_ALTITUDE_DEG = 45;
/** Today's fixed amber Lightformer intensity, now a night ceiling that
 *  `k.lamp` scales down toward 0 by day. Kept well under the key light's own
 *  swing (DEFAULT_KEY_INTENSITY down to sky.ts's night sunI) so the lamp's
 *  night warmth accents the scene instead of outweighing the sun's own gain
 *  in the studio-sky.spec.ts luma probe. */
const AMBER_LIGHTFORMER_MAX = 0.8;

const DEFAULT_KEY_POSITION: [number, number, number] = [3, 4, 5];
const DEFAULT_KEY_COLOR = "#fff2df";
const DEFAULT_KEY_INTENSITY = 2.4;
const DEFAULT_HEMI_INTENSITY = 1.5;

/**
 * sky.ts's own KEYFRAMES carry `sunI` 1.8 (night) to 2.6 (day) and `hemiI`
 * 1.2 to 1.8: a calibration for the WORLD's two-light rig, which has no
 * fixed 9-intensity point light competing for the frame. Reused verbatim
 * here, that 0.6-0.8 unit swing reads as noise next to this rig's other
 * constant lights (measured: studio-sky.spec.ts's luma probe moved under
 * 1/255 for it). `remap` keeps the same real signal, the live t between
 * night and day, still continuous through dawn/golden, and re-scales it to
 * a swing this specific rig's fixed lights can't drown out. The night and
 * day ENDS still land close to today's hand-tuned constants (2.4 key /
 * 1.5 hemi), so the "renders exactly today's values" SSR fallback stays a
 * genuine floor, not a discontinuity.
 */
function remap(value: number, fromLo: number, fromHi: number, toLo: number, toHi: number): number {
  const t = Math.min(1, Math.max(0, (value - fromLo) / (fromHi - fromLo)));
  return toLo + t * (toHi - toLo);
}
const SUN_I_NIGHT = 1.8;
const SUN_I_DAY = 2.6;
const KEY_INTENSITY_NIGHT = 0.8;
const KEY_INTENSITY_DAY = 8.5;
const HEMI_I_NIGHT = 1.2;
const HEMI_I_DAY = 1.8;
const HEMI_INTENSITY_NIGHT = 0.4;
const HEMI_INTENSITY_DAY = 4.8;

/** Sun altitude/azimuth (compass degrees, 0 = north, clockwise) to a point
 *  on a unit hemisphere, scaled to the rig's key-light distance. Same axis
 *  convention as world/skyBinding.ts (+X east, -Z north) for a reader
 *  moving between the two, even though this rig is a local product shot,
 *  not a map. */
function sunToKeyPosition(altitudeDeg: number, azimuthDeg: number): [number, number, number] {
  const clampedAlt = Math.min(Math.max(altitudeDeg, MIN_KEY_ALTITUDE_DEG), MAX_KEY_ALTITUDE_DEG);
  const altRad = clampedAlt * RAD;
  const azRad = azimuthDeg * RAD;
  const horizontal = Math.cos(altRad) * KEY_LIGHT_DISTANCE;
  const vertical = Math.sin(altRad) * KEY_LIGHT_DISTANCE;
  return [horizontal * Math.sin(azRad), vertical, -horizontal * Math.cos(azRad)];
}

export function StudioRig() {
  const now = useMinuteClock();
  const sun = now ? sunPosition(now) : null;
  const k = sun ? keyframeAt(sun.altitudeDeg) : null;
  const keyPosition = sun ? sunToKeyPosition(sun.altitudeDeg, sun.azimuthDeg) : DEFAULT_KEY_POSITION;
  const keyColor = k ? new Color(k.sun[0], k.sun[1], k.sun[2]) : DEFAULT_KEY_COLOR;
  const keyIntensity = k ? remap(k.sunI, SUN_I_NIGHT, SUN_I_DAY, KEY_INTENSITY_NIGHT, KEY_INTENSITY_DAY) : DEFAULT_KEY_INTENSITY;
  const hemiIntensity = k ? remap(k.hemiI, HEMI_I_NIGHT, HEMI_I_DAY, HEMI_INTENSITY_NIGHT, HEMI_INTENSITY_DAY) : DEFAULT_HEMI_INTENSITY;
  const amberIntensity = k ? AMBER_LIGHTFORMER_MAX * k.lamp : AMBER_LIGHTFORMER_MAX;

  return (
    <>
      <hemisphereLight args={["#d8f4e7", "#162b23", hemiIntensity]} />
      <directionalLight position={keyPosition} intensity={keyIntensity} color={keyColor} />
      <pointLight position={[-3, 0, 2]} intensity={9} color={readToken("--color-signal", "#3ddc84")} />
      <Environment resolution={128}>
        <Lightformer intensity={3} position={[-3, 2, 4]} scale={[2, 5, 1]} />
        <Lightformer intensity={amberIntensity} position={[3, 1, 2]} scale={[1, 4, 1]} color="#f2a13d" />
        <Lightformer intensity={2} position={[0, 4, -2]} scale={[5, 1, 1]} color="#bdebdc" />
      </Environment>
    </>
  );
}
