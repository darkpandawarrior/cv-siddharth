/**
 * world-v2-spec.md §7 "Volumetrics (T1)": "a custom postprocessing `Pass`
 * does a half-res 26-step raymarch. It samples the sun shadow map as
 * `sampler2DShadow` and uses IGN dither plus a noise mist band 0-4 m over
 * the water (`vnoise(p.xz*0.03 + t*0.04)`) with HG g = 0.78. The result is
 * bilateral-blurred and added in the grade effect." Fills the slot
 * `Post.tsx` (P2-06a) already left open (its own `volumetric?: ReactNode`
 * prop and doc comment: "pass `<primitive object={volumetricPass} />` once
 * P3-01c exists").
 *
 * visual-catalogue.md#L1 "Shadow-sampled raymarched god rays": read
 * Ameobea/three-good-godrays (zlib licence, Casey Primozic 2022) for the
 * loop shape and the bilateral-upsample idea, and reimplemented from that
 * read below - nothing in this file is copied from the unlicensed
 * N8python/goodGodRays original three-good-godrays itself adapts from.
 * Two carry-overs from that reference, both already true of this scene
 * rather than something this file has to arrange: (1) the sun's shadow map
 * must use `PCFSoftShadowMap`, not `PCFShadowMap` — a hardware-compare
 * `sampler2DShadow` cannot be read back as a raw depth value the way this
 * pass needs, and `WorldV2.tsx`'s `<Canvas shadows={{ type:
 * PCFSoftShadowMap }}>` already sets that (P2-19 task 8, citing this
 * lane's own L1 spec_ref); (2) the ray's first sample is jittered by a
 * blue-noise-style hash to hide the banding a 26-step march would
 * otherwise show.
 *
 * T1 only (world-v2-spec §8's own tier table: T2/T3 keep the analytic fog
 * `atmosphere.ts` already provides). `tiers.ts` carries that gating cell;
 * `Post.tsx` already gates its `volumetric` slot to `tier === 1` on its
 * own, so this class itself does no tier check - constructing one only
 * makes sense on T1 in the first place.
 *
 * Ownership note (this lane's own flag, not a code change): `WorldV2.tsx`
 * (P2-19) is the one place that could mount this pass — `<Post tier={tier}
 * look="golden" volumetric={<primitive object={volumetricPass} />} />` in
 * place of its current `<Post tier={tier} look="golden" />` — but
 * `WorldV2.tsx` is outside this lane's `owns` list and no handoff (M22/M61)
 * grants a later phase-3 lane an edit there. Wiring it in is a one-line
 * change for whichever lane or reconcile commit is allowed to touch that
 * file; nothing here needs to change for that wiring to land.
 */
import { Pass } from "postprocessing";
import {
  BasicDepthPacking,
  DirectionalLight,
  Matrix4,
  PerspectiveCamera,
  ShaderMaterial,
  Texture,
  Vector2,
  Vector3,
  WebGLRenderTarget,
  type DepthPackingStrategies,
  type WebGLRenderer,
} from "three";
import { LIVE_CONTRACT } from "./liveContract.ts";

const volStrengthRow = LIVE_CONTRACT.find((r) => r.name === "uVolStrength");
if (!volStrengthRow) throw new Error("Volumetric.ts: liveContract has no uVolStrength row");
/** world-v2-spec §7's volumetrics are a fixed technique (liveContract:
 *  `drivenBy: "static"`) — 1 = unscaled, this pass's own honest pre-live
 *  strength multiplier. */
const VOL_STRENGTH_DESIGN = volStrengthRow.design[0];

/** "a half-res 26-step raymarch" — pinned so `tiers.ts`/`tiers.test.ts` can
 *  read the SAME numbers this pass actually renders at, rather than a
 *  second, separately-typed copy. */
export const VOLUMETRIC_STEPS = 26;
export const VOLUMETRIC_RESOLUTION_SCALE = 0.5;
/** Henyey-Greenstein anisotropy — world-v2-spec §7's literal `g = 0.78`
 *  (forward-scattering, as real mist/dust is). */
export const VOLUMETRIC_HG_G = 0.78;

const SHADOW_BIAS = 2e-3;
/** The spec gives every raymarch constant (steps, resolution, g) but no
 *  exposure number for how bright the accumulated result should read —
 *  only Grade.ts's own GOLDEN_LOOK baseline is in that position for the
 *  rest of the recipe. This is this pass's own art-direction knob, tuned
 *  once by eye on the spawn frame; a live-binding lane can still scale the
 *  whole result via `setStrength()` without touching this constant. */
const EXPOSURE = 0.9;

const VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = position.xy * 0.5 + 0.5;
    gl_Position = vec4(position.xy, 1.0, 1.0);
  }
`;

const RAYMARCH_FRAGMENT = /* glsl */ `
  varying vec2 vUv;
  uniform sampler2D uDepthBuffer;
  uniform sampler2D uShadowMap;
  uniform mat4 uProjectionMatrixInverse;
  uniform mat4 uCameraWorldMatrix;
  uniform mat4 uLightShadowMatrix;
  uniform vec3 uSunDirection; // world-space, FROM the sun TOWARD the scene, normalized
  uniform vec3 uSunColor;
  uniform float uVolStrength;
  uniform float uTime;

  const int STEPS = ${VOLUMETRIC_STEPS};
  const float HG_G = ${VOLUMETRIC_HG_G};
  const float PI = 3.14159265;

  // Jimenez 2014 interleaved gradient noise — the spec's own "IGN dither",
  // used here to break up the mist band's per-pixel sample phase.
  float ign(vec2 p) {
    return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
  }

  // A second, differently-seeded hash for the RAY-START jitter (the
  // catalogue's other named technique, "blue-noise jittered ray start") —
  // deliberately not the same function as ign() above, so the two
  // banding-reduction passes don't reinforce one repeating pattern.
  float hash13(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }

  float hgPhase(float cosTheta, float g) {
    float g2 = g * g;
    return (1.0 - g2) / (4.0 * PI * pow(1.0 + g2 - 2.0 * g * cosTheta, 1.5));
  }

  float vhash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  // world-v2-spec §7: "a noise mist band 0-4 m over the water
  // (vnoise(p.xz*0.03 + t*0.04))" — a cheap bilinear value-noise stand-in;
  // the spec names the call shape, not a specific noise family.
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(vhash(i), vhash(i + vec2(1.0, 0.0)), u.x), mix(vhash(i + vec2(0.0, 1.0)), vhash(i + vec2(1.0, 1.0)), u.x), u.y);
  }

  vec3 viewPositionFromDepth(vec2 uv, float depth) {
    vec4 ndc = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
    vec4 viewPos = uProjectionMatrixInverse * ndc;
    return viewPos.xyz / viewPos.w;
  }

  void main() {
    float depth = texture2D(uDepthBuffer, vUv).r;
    vec3 viewPos = viewPositionFromDepth(vUv, depth);
    vec3 worldPos = (uCameraWorldMatrix * vec4(viewPos, 1.0)).xyz;
    vec3 camPos = uCameraWorldMatrix[3].xyz;

    vec3 rayVec = worldPos - camPos;
    float rayLen = length(rayVec);
    vec3 rayDir = rayVec / max(rayLen, 1e-4);
    float stepLen = rayLen / float(STEPS);

    float jitter = hash13(vec3(gl_FragCoord.xy, uTime));
    float cosTheta = dot(rayDir, -uSunDirection);
    float phase = hgPhase(cosTheta, HG_G);

    float accum = 0.0;
    for (int i = 0; i < STEPS; i++) {
      float t = (float(i) + jitter) * stepLen;
      if (t >= rayLen) break;
      vec3 p = camPos + rayDir * t;

      // The same convention three's own built-in shadow sampling uses:
      // light.shadow.matrix already folds the [-1,1] -> [0,1] bias-scale
      // in, so this is a direct UV+depth lookup, not a second remap.
      vec4 shadowCoord = uLightShadowMatrix * vec4(p, 1.0);
      shadowCoord.xyz /= shadowCoord.w;
      bool inFrustum = all(greaterThanEqual(shadowCoord.xyz, vec3(0.0))) && all(lessThanEqual(shadowCoord.xyz, vec3(1.0)));
      float shadowDepth = texture2D(uShadowMap, shadowCoord.xy).r;
      bool lit = inFrustum && shadowDepth > shadowCoord.z - ${SHADOW_BIAS};

      if (lit) {
        float density = phase;
        if (p.y >= 0.0 && p.y <= 4.0) {
          density += vnoise(p.xz * 0.03 + uTime * 0.04) * 0.6 * (0.6 + 0.4 * ign(gl_FragCoord.xy + uTime));
        }
        accum += density * stepLen;
      }
    }

    vec3 color = uSunColor * accum * uVolStrength * ${EXPOSURE};
    gl_FragColor = vec4(color, 1.0);
  }
`;

const COMPOSITE_FRAGMENT = /* glsl */ `
  varying vec2 vUv;
  uniform sampler2D inputBuffer;
  uniform sampler2D uHalfRes;
  uniform sampler2D uDepthBuffer;
  uniform vec2 uHalfTexelSize;

  void main() {
    vec4 base = texture2D(inputBuffer, vUv);
    float centerDepth = texture2D(uDepthBuffer, vUv).r;

    // A depth-weighted 2x2 tap around the half-res texel — the "bilateral
    // upsample" the spec asks for, at its cheapest useful size: reject
    // (weight toward 0) whichever of the four neighbours sits on the far
    // side of a depth edge from this full-res pixel, so a god ray behind a
    // pier doesn't bleed across the pier's own silhouette.
    // ponytail: a full bilateral kernel widens this to 3x3/5x5 with a
    // spatial gaussian on top of the depth weight; this ships the minimal
    // 2x2 case (the four texels an ordinary bilinear upsample already
    // blends) with depth rejection added, upgrade path if a hard edge
    // still shows visible bleed in the crawl.
    vec3 sum = vec3(0.0);
    float wsum = 0.0;
    for (int dy = 0; dy <= 1; dy++) {
      for (int dx = 0; dx <= 1; dx++) {
        vec2 offset = (vec2(float(dx), float(dy)) - 0.5) * uHalfTexelSize;
        vec2 uv = clamp(vUv + offset, 0.0, 1.0);
        vec3 c = texture2D(uHalfRes, uv).rgb;
        float d = texture2D(uDepthBuffer, uv).r;
        float w = 1.0 - clamp(abs(d - centerDepth) * 400.0, 0.0, 1.0);
        sum += c * w;
        wsum += w;
      }
    }
    vec3 volumetric = wsum > 1e-4 ? sum / wsum : texture2D(uHalfRes, vUv).rgb;

    // The "vol-add" step: added straight into the scene colour here, ahead
    // of Bloom/SMAA/Grade in Post.tsx's composer order (Grade.ts's own
    // uVolStrength uniform is this pass's forward-looking scale knob for
    // once it is wired in, not a second place this addition happens).
    gl_FragColor = vec4(base.rgb + volumetric, base.a);
  }
`;

/**
 * The Sangam sun's own half-res, 26-step raymarched god rays (T1 only).
 * Construct one per mounted `<Canvas>` and drop it into `Post.tsx`'s
 * `volumetric` slot: `<primitive object={volumetricPass} />`.
 */
export class VolumetricPass extends Pass {
  private readonly light: DirectionalLight;
  private readonly sceneCamera: PerspectiveCamera;
  private readonly raymarchMaterial: ShaderMaterial;
  private readonly compositeMaterial: ShaderMaterial;
  private raymarchTarget: WebGLRenderTarget;
  private time = 0;

  constructor(light: DirectionalLight, camera: PerspectiveCamera) {
    super("VolumetricPass");
    this.needsDepthTexture = true;
    this.needsSwap = true;
    this.light = light;
    this.sceneCamera = camera;

    this.raymarchTarget = new WebGLRenderTarget(1, 1, { depthBuffer: false, stencilBuffer: false });
    this.raymarchTarget.texture.name = "VolumetricPass.HalfRes";

    this.raymarchMaterial = new ShaderMaterial({
      name: "VolumetricRaymarchMaterial",
      vertexShader: VERTEX_SHADER,
      fragmentShader: RAYMARCH_FRAGMENT,
      depthWrite: false,
      depthTest: false,
      uniforms: {
        uDepthBuffer: { value: null as Texture | null },
        uShadowMap: { value: null as Texture | null },
        uProjectionMatrixInverse: { value: new Matrix4() },
        uCameraWorldMatrix: { value: new Matrix4() },
        uLightShadowMatrix: { value: new Matrix4() },
        uSunDirection: { value: new Vector3(0, -1, 0) },
        uSunColor: { value: new Vector3(1, 0.74, 0.46) },
        uVolStrength: { value: VOL_STRENGTH_DESIGN },
        uTime: { value: 0 },
      },
    });

    this.compositeMaterial = new ShaderMaterial({
      name: "VolumetricCompositeMaterial",
      vertexShader: VERTEX_SHADER,
      fragmentShader: COMPOSITE_FRAGMENT,
      depthWrite: false,
      depthTest: false,
      uniforms: {
        inputBuffer: { value: null as Texture | null },
        uHalfRes: { value: this.raymarchTarget.texture },
        uDepthBuffer: { value: null as Texture | null },
        uHalfTexelSize: { value: new Vector2(1, 1) },
      },
    });
  }

  /** A live-binding lane's own future scale knob (liveContract's
   *  `uVolStrength`, `drivenBy: "static"` today) — never touched by this
   *  file itself. */
  setStrength(strength: number): void {
    this.raymarchMaterial.uniforms.uVolStrength.value = strength;
  }

  override setSize(width: number, height: number): void {
    const w = Math.max(1, Math.round(width * VOLUMETRIC_RESOLUTION_SCALE));
    const h = Math.max(1, Math.round(height * VOLUMETRIC_RESOLUTION_SCALE));
    this.raymarchTarget.setSize(w, h);
    (this.compositeMaterial.uniforms.uHalfTexelSize.value as Vector2).set(1 / w, 1 / h);
  }

  override setDepthTexture(depthTexture: Texture, _depthPacking: DepthPackingStrategies = BasicDepthPacking): void {
    this.raymarchMaterial.uniforms.uDepthBuffer.value = depthTexture;
    this.compositeMaterial.uniforms.uDepthBuffer.value = depthTexture;
  }

  private updateCameraAndLightUniforms(): void {
    const camera = this.sceneCamera;
    const raymarchUniforms = this.raymarchMaterial.uniforms;
    (raymarchUniforms.uProjectionMatrixInverse.value as Matrix4).copy(camera.projectionMatrixInverse);
    (raymarchUniforms.uCameraWorldMatrix.value as Matrix4).copy(camera.matrixWorld);

    const light = this.light;
    light.shadow.updateMatrices(light);
    (raymarchUniforms.uLightShadowMatrix.value as Matrix4).copy(light.shadow.matrix);
    const sunDirection = raymarchUniforms.uSunDirection.value as Vector3;
    sunDirection.copy(light.target.position).sub(light.position).normalize();
    raymarchUniforms.uShadowMap.value = light.shadow.map ? light.shadow.map.texture : null;
  }

  override render(renderer: WebGLRenderer, inputBuffer: WebGLRenderTarget | null, outputBuffer: WebGLRenderTarget | null, deltaTime = 0): void {
    this.time += deltaTime;
    this.updateCameraAndLightUniforms();
    this.raymarchMaterial.uniforms.uTime.value = this.time;

    // Stage A — the half-res raymarch, written into its own small target.
    this.fullscreenMaterial = this.raymarchMaterial;
    renderer.setRenderTarget(this.raymarchTarget);
    renderer.render(this.scene, this.camera);

    // Stage B — bilateral upsample, added onto the scene colour so far.
    if (inputBuffer !== null) this.compositeMaterial.uniforms.inputBuffer.value = inputBuffer.texture;
    this.fullscreenMaterial = this.compositeMaterial;
    renderer.setRenderTarget(this.renderToScreen ? null : outputBuffer);
    renderer.render(this.scene, this.camera);
  }
}
