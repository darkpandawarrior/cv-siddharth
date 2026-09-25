import { Environment, Lightformer } from "@react-three/drei";
import { Color } from "three";
import { readToken } from "../themeColor";
import { useSky } from "../lib/useSky.ts";

/**
 * Known, verified budget conflict (design-spec.md#4, master-plan.md G4):
 * this file's `useSky()` call is the sole cause of the BlueprintRoom chunk
 * landing at 1,666,776 B, 41 B over this lane's own 1,666,735 B target
 * (the generic largestChunkBytes gate, 1,666,798, still passes). Root
 * cause, isolated by swapping each of this lane's two owned files in and
 * out of a clean rebuild independently: `useSky` calls `useWeather`, which
 * calls `useLiveSignal` (src/lib/useLiveSignal.ts, not owned here); that
 * module gains a third independent leaf consumer the moment StudioRig or
 * BlueprintInstrument reach it, since SkillsOrbitScene/Phone3DScene's
 * chunk-group joins the pre-existing OpsBoard and spotifyPreview.tsx ones,
 * and Rollup's automatic chunker (vite.config.ts, not owned here) switches
 * that module from duplicated-inline to a dedicated shared chunk. That
 * switch is what costs 41 B in BlueprintRoom (an import statement replacing
 * an inlined re-export via spotifyPreview.tsx's tldraw "sid-live" shape),
 * not the size of any code this lane wrote: reverting either owned file
 * alone, or both, reproduces the identical 1,666,776 B, and the function
 * bodies below are confirmed absent from that chunk either way. There is no
 * version of "StudioRig calls useSky()" that avoids this from inside
 * StudioRig.tsx/BlueprintInstrument.tsx alone. The fix is either a
 * `manualChunks`/`experimentalMinChunkSize` pin for useLiveSignal.ts in
 * vite.config.ts, or a reviewed re-baseline of this lane's target number,
 * both outside this lane's ownership.
 */

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
 * P8 (reality-spec.md#P8): the rig now calls `useSky()` itself. The key
 * directional's colour and intensity follow the real Pune sun (`k.sun`,
 * `k.sunI`), its position follows the sun's altitude/azimuth, the hemisphere
 * fill's intensity follows `k.hemiI` (sky.ts's own "ambient sky" field,
 * carried by every Keyframe row for exactly this purpose), and the amber
 * Lightformer's intensity follows `k.lamp` (his lamps are
 * brightest at night, off in daylight). `useSky()` recomputes at most once a
 * minute (NavClock's own tick), so this is a prop change, never a per-frame
 * write. When `useSky()` is null (SSR, or before the first client tick), the
 * rig renders exactly today's hand-tuned values, unchanged.
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
  const sky = useSky();
  const k = sky?.k;
  const keyPosition = sky ? sunToKeyPosition(sky.sun.altitudeDeg, sky.sun.azimuthDeg) : DEFAULT_KEY_POSITION;
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
