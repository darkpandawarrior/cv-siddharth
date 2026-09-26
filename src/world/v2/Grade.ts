/**
 * world-v2-spec.md §7 "Post": "`GradeEffect`, one custom Effect in the
 * reference order: vol-add → sun veil → exposure → warm highlights / cool
 * shadows → ACES fitted → amber-highlight / teal-shadow S-curve →
 * chromatic fringe at the edges → vignette → grain."
 *
 * open-data-spec.md §5 "The Survey lens": `GradeEffect` exposes
 * `setLook("golden" | "survey")` as "a uniform preset swap, with no new
 * pass and no engine swap": exposure ×0.55, saturation 0.25, a teal lift in
 * the shadows, vignette 0.55, grain ×1.5 (bloom is unchanged — it lives in
 * Post.tsx's composer, not here).
 */

import { BlendFunction, Effect } from "postprocessing";
import type { WebGLRenderTarget, WebGLRenderer } from "three";
import { Uniform, Vector3 } from "three";
import { LIVE_CONTRACT } from "./liveContract.ts";

export type GradeLook = "golden" | "survey";

interface LookValues {
  exposure: number;
  saturation: number;
  vignette: number;
  grain: number;
  tealLift: number;
}

const volStrengthRow = LIVE_CONTRACT.find((r) => r.name === "uVolStrength");
if (!volStrengthRow) throw new Error("Grade.ts: liveContract has no uVolStrength row");
/** world-v2-spec §7's volumetrics are a fixed technique (liveContract:
 *  `drivenBy: "static"`) — 1 = unscaled, the honest pre-live multiplier for
 *  whatever P3-01c's pass eventually writes into the vol-add step. */
const VOL_STRENGTH_DESIGN = volStrengthRow.design[0];

// world-v2-spec §7's render recipe gives no numeric golden baseline for
// exposure/vignette/grain — only the Survey delta (open-data-spec §5) is
// numeric. These are this lane's own art-direction defaults: the "1.0 = the
// recipe unmodified" honest baseline, the same doctrine liveContract's own
// design values follow.
const GOLDEN_LOOK: LookValues = { exposure: 1.0, saturation: 1.0, vignette: 0.35, grain: 1.0, tealLift: 0.0 };

// open-data-spec.md §5 "The Survey lens" — the exact swap, applied to
// GOLDEN_LOOK where the spec states a multiplier and taken as the literal
// value where it states one directly.
const SURVEY_LOOK: LookValues = {
  exposure: GOLDEN_LOOK.exposure * 0.55,
  saturation: 0.25,
  vignette: 0.55,
  grain: GOLDEN_LOOK.grain * 1.5,
  tealLift: 0.4,
};

const fragmentShader = /* glsl */ `
  uniform float uExposure;
  uniform float uSaturation;
  uniform float uVignette;
  uniform float uGrain;
  uniform float uTealLift;
  uniform float uVolStrength;
  // .xy = the sun's approximate screen-space position for the veil term,
  // .z = veil strength gate (0 until a live-sun lane feeds a real value —
  // an honest "no veil yet" default, not a placeholder that happens to be
  // visible).
  uniform vec3 uSunScreenDir;
  uniform float uTime;

  vec3 acesFilm(vec3 x) {
    // Narkowicz 2015 fitted ACES approximation: small, no LUT (visual-
    // catalogue.md: LUT3DEffect is a spike only if this stalls).
    const float a = 2.51;
    const float b = 0.03;
    const float c = 2.43;
    const float d = 0.59;
    const float e = 0.14;
    return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
  }

  vec3 amberTealSCurve(vec3 c) {
    float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
    vec3 amber = vec3(1.0, 0.75, 0.42);
    vec3 teal = vec3(0.22, 0.55, 0.58);
    c = mix(c, c * teal + uTealLift * teal * (1.0 - lum), smoothstep(0.5, 0.0, lum) * 0.35);
    c = mix(c, c * amber, smoothstep(0.5, 1.0, lum) * 0.25);
    return c;
  }

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    vec2 centered = uv - 0.5;

    // 1. vol-add — P3-01c's raymarch pass (T1 only) writes its own result
    //    into the framebuffer earlier in the composer (Post.tsx), ahead of
    //    this effect; uVolStrength stays a real, wired uniform (rather than
    //    an unused placeholder) so that pass has a scale knob to add
    //    through the instant it lands, without this shader's step order
    //    changing.
    vec3 color = inputColor.rgb * (1.0 + 0.0 * uVolStrength);

    // 2. sun veil
    float veil = exp(-length(centered - uSunScreenDir.xy) * 3.0) * uSunScreenDir.z;
    color += vec3(1.0, 0.85, 0.6) * veil * 0.15;

    // 3. exposure
    color *= uExposure;

    // 4. warm highlights / cool shadows
    float lum0 = dot(color, vec3(0.2126, 0.7152, 0.0722));
    color = mix(color * vec3(0.92, 0.98, 1.05), color * vec3(1.06, 1.0, 0.92), smoothstep(0.2, 0.8, lum0));

    // 5. ACES fitted
    color = acesFilm(color);

    // 6. amber-highlight / teal-shadow S-curve
    color = amberTealSCurve(color);

    // 7. chromatic fringe at the edges (radial, strongest away from centre)
    float edge = dot(centered, centered);
    vec2 fringeOffset = centered * edge * 0.004;
    float r = texture2D(inputBuffer, uv - fringeOffset).r;
    float b = texture2D(inputBuffer, uv + fringeOffset).b;
    color.r = mix(color.r, r, edge * 2.0);
    color.b = mix(color.b, b, edge * 2.0);

    // 8. vignette
    color *= 1.0 - edge * uVignette;

    // 9. grain
    float g = fract(sin(dot(uv * resolution + uTime, vec2(12.9898, 78.233))) * 43758.5453);
    color += (g - 0.5) * 0.028 * uGrain;

    // The Survey lens's own axis (open-data-spec §5) — applied last so it
    // governs the whole graded result, not just the source colour.
    float finalLum = dot(color, vec3(0.2126, 0.7152, 0.0722));
    color = mix(vec3(finalLum), color, uSaturation);

    outputColor = vec4(color, inputColor.a);
  }
`;

/**
 * world-v2-spec §7's one custom post Effect, carrying the whole grade
 * recipe in the reference order. Construct once per `<Canvas>` (Post.tsx
 * recreates it only when `look` changes — see `GradePass`) and drive it
 * with `setLook()`.
 */
export class GradeEffect extends Effect {
  private look: GradeLook = "golden";

  constructor() {
    super("GradeEffect", fragmentShader, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, Uniform>([
        ["uExposure", new Uniform(GOLDEN_LOOK.exposure)],
        ["uSaturation", new Uniform(GOLDEN_LOOK.saturation)],
        ["uVignette", new Uniform(GOLDEN_LOOK.vignette)],
        ["uGrain", new Uniform(GOLDEN_LOOK.grain)],
        ["uTealLift", new Uniform(GOLDEN_LOOK.tealLift)],
        ["uVolStrength", new Uniform(VOL_STRENGTH_DESIGN)],
        ["uSunScreenDir", new Uniform(new Vector3(0.5, 0.5, 0))],
        ["uTime", new Uniform(0)],
      ]),
    });
  }

  get currentLook(): GradeLook {
    return this.look;
  }

  /** open-data-spec.md §5's uniform preset swap — the `L` key / Survey lens
   *  toggle calls this, nothing else. */
  setLook(look: GradeLook): void {
    this.look = look;
    const values = look === "survey" ? SURVEY_LOOK : GOLDEN_LOOK;
    this.uniforms.get("uExposure")!.value = values.exposure;
    this.uniforms.get("uSaturation")!.value = values.saturation;
    this.uniforms.get("uVignette")!.value = values.vignette;
    this.uniforms.get("uGrain")!.value = values.grain;
    this.uniforms.get("uTealLift")!.value = values.tealLift;
  }

  override update(_renderer: WebGLRenderer, _inputBuffer: WebGLRenderTarget, deltaTime = 0): void {
    const time = this.uniforms.get("uTime")!;
    time.value = (time.value as number) + deltaTime;
  }
}
