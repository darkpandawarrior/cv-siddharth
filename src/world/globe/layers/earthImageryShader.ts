// LANE L1 (real earth): the fragment shader for the photoreal earth style.
// Vertex shader is sun.ts's shared VERT (vW world normal, vN view normal, vV
// view dir, vUv) — every earth style compiles the same varyings so the limb
// and terminator read the same whichever one is on.
//
// `viewMatrix` and `cameraPosition` are NOT declared here: three.js's
// WebGLProgram prepends both to every non-raw ShaderMaterial's fragment
// shader automatically (node_modules/three/src/renderers/webgl/
// WebGLProgram.js), so redeclaring either is a duplicate-symbol compile
// error, not a no-op.
import { CLOUD_HEIGHT, CLOUD_MASK_GLSL } from "./cloudMask.ts";
import { GLOBE_RADIUS } from "../geoMath.ts";
import { RELIEF_NEUTRAL } from "./gibs.ts";

export const EARTH_IMAGERY_FRAG = `
uniform vec3 uSun;
uniform sampler2D uDay;
uniform sampler2D uBase;
uniform sampler2D uNight;
uniform sampler2D uIce;
uniform float uCloudReady;
uniform sampler2D uRelief;
uniform float uReliefReady;
// WAVE 7 LANE V2 (city-light bloom): the multiplier that pushes ONLY the
// night-lights term above 1.0 so a plain (non-selective) Bloom pass with
// luminanceThreshold >= 1.0 picks out city clusters without touching the day
// side, which this shader otherwise keeps <= 1.0. A named uniform (not a
// literal) so GlobePost.tsx's threshold and this gain can be tuned together
// without a shader recompile.
uniform float uNightGain;
// WAVE 6 LANE X3 (time machine): daily time-lapse (uTL*) and swipe compare
// (uCompare*/uSplit) both only ever change what "the day photo" IS before
// the rest of the pipeline (gap fill, clouds, relief, terminator, night
// lights) runs on it unchanged — neither feature re-simulates lighting for
// a different date, they replay a different real photo under today's sun.
uniform sampler2D uTLOlder;
uniform sampler2D uTLNewer;
uniform float uTLBlend;
uniform float uTLActive;
uniform sampler2D uComparePast;
uniform float uCompareActive;
uniform float uSplit;
uniform vec2 uResolution;
varying vec3 vW;varying vec3 vN;varying vec3 vV;varying vec2 vUv;

${CLOUD_MASK_GLSL}
void main(){
  // Daily time-lapse: while scrubbed into a past UTC day and both of that
  // day's neighbouring frames are preloaded, crossfade between them
  // (uTLBlend, EarthImagery.tsx's own gibsDates.frameForTime) instead of
  // the live "yesterday" mosaic. uTLActive is 0 until a chosen day's
  // textures are actually in hand — falls back to the live image rather
  // than ever showing a placeholder dressed as a real date.
  vec3 liveDay = mix(texture2D(uDay, vUv).rgb, mix(texture2D(uTLOlder, vUv).rgb, texture2D(uTLNewer, vUv).rgb, uTLBlend), uTLActive);

  // Swipe compare: a hard SCREEN-SPACE split (not a UV split — a UV divider
  // would rotate and warp with the sphere instead of reading as a vertical
  // curtain over the viewport, the whole point of the swipe metaphor).
  // Right is always literal "today" (uDay), even mid-time-lapse-playback:
  // compare.ts's own CompareView is two fixed dates, independent of the
  // scrubber's live position.
  float screenX = gl_FragCoord.x / max(uResolution.x, 1.0);
  float compareSide = step(uSplit, screenX);
  vec3 comparePick = mix(texture2D(uComparePast, vUv).rgb, texture2D(uDay, vUv).rgb, compareSide);
  vec3 dayColor = mix(liveDay, comparePick, uCompareActive);
  vec3 baseColor = texture2D(uBase, vUv).rgb;

  // Swath gaps and polar night in the daily VIIRS mosaic read as near-black;
  // patch them from the static Blue Marble base rather than draw a hole
  // (living-earth spec item 2).
  // WAVE 6 LANE X3 FIX: this mask must read whichever frame is actually
  // drawn as dayColor above — the live uDay, a scrubbed time-lapse
  // crossfade, or a compare pick — never a hardcoded uDay sample. A past
  // day's real mosaic can have a swath/no-data gap that today's live uDay
  // does not share at the same texel; reading uDay unconditionally then
  // reports "no gap" from a texture that isn't even on screen, and the
  // scrubbed frame's actual black hole goes unpatched.
  // The mask reads a BLURRED mip (bias 5, ~32 texels) of every texture that
  // can feed dayColor, composited with the exact same mix() calls as
  // liveDay/dayColor above: VIIRS has no reflectance where the sun is
  // low, so the polar cap is a hard-edged no-data disc, and a per-texel mask
  // cut from bright sea ice straight to the base's dark polar ocean on a
  // visible rim. Averaging over the edge feathers it across a few degrees
  // instead.
  vec3 liveDayBlur = mix(texture2D(uDay, vUv, 5.0).rgb, mix(texture2D(uTLOlder, vUv, 5.0).rgb, texture2D(uTLNewer, vUv, 5.0).rgb, uTLBlend), uTLActive);
  vec3 comparePickBlur = mix(texture2D(uComparePast, vUv, 5.0).rgb, texture2D(uDay, vUv, 5.0).rgb, compareSide);
  vec3 dayColorBlur = mix(liveDayBlur, comparePickBlur, uCompareActive);
  float dayLuma = dot(dayColorBlur, vec3(0.299, 0.587, 0.114));
  float gap = 1.0 - smoothstep(0.02, 0.16, dayLuma);
  // Inside the gap, real sea ice (GHRSST MUR, alpha 0 off the ice) goes over
  // the Blue Marble base, whose polar ocean is open water: without it the
  // equinox pole read as a black hole. MUR's palette runs blue (low
  // concentration) to red (full), so red share scales the ice.
  vec4 ice = texture2D(uIce, vUv);
  float iceAmt = ice.a * mix(0.55, 1.0, ice.r);
  vec3 fill = mix(baseColor, vec3(0.86, 0.9, 0.94), iceAmt);
  float clouds = cloudMask(vUv) * uCloudReady;
  vec3 land = mix(mix(dayColor, baseColor, clouds), fill, gap);
  float oceanness = smoothstep(0.03, 0.14, baseColor.b - max(baseColor.r, baseColor.g));
  // The base carries actual bathymetry colours, not invented depth bands.
  land = mix(land, baseColor, oceanness * 0.22);

  // Relief on land only: the ASTER hillshade brightens and shades slopes
  // around its flat-land neutral, so mountain ranges read in 3D. It is lit
  // from a fixed cartographic direction, not the real sun, so it stays a
  // gentle modulation rather than the lighting itself.
  float h = texture2D(uRelief, vUv).r;
  land *= mix(1.0, 1.0 + (h - ${RELIEF_NEUTRAL}) * 1.1, (1.0 - oceanness) * uReliefReady);

  // Intersect the ray TOWARD the sun with the raised sphere. This stays
  // bounded at the terminator and wraps at the date line in sphere UVs.
  vec3 n = normalize(vW);
  vec3 lightDir = normalize(uSun);
  float mu = dot(n, lightDir);
  float ray = -mu + sqrt(mu*mu + ${((1 + CLOUD_HEIGHT) ** 2 - 1).toFixed(8)});
  vec3 hit = normalize(n + lightDir * ray);
  vec2 shadowUv = vec2(fract(0.5 + atan(-hit.z, hit.x)/6.28318530718),
                       0.5 + asin(clamp(hit.y,-1.0,1.0))/3.14159265359);
  float shadow = cloudMask(shadowUv) * uCloudReady * smoothstep(0.0,0.12,mu);
  land *= 1.0 - 0.24 * shadow;

  // City lights (item 3): brighten past 1.0 so GlobePost.tsx's Bloom pass
  // (luminanceThreshold >= 1.0) actually catches bright clusters — the HDR
  // glow, not just a flat multiply, is Lane 2's whole point.
  vec3 nightLights = texture2D(uNight, vUv).rgb * uNightGain;

  float sun = dot(normalize(vW), normalize(uSun));
  float lit = smoothstep(-0.12, 0.08, sun); // soft terminator band

  // Warm twilight band straddling the terminator, as a TINT of the lit
  // surface (low sun reddens what it lights). It was an additive glow, which
  // at the equinox painted the gap-filled dark polar ocean a flat tan disc:
  // light added to a surface the sun barely reaches.
  float twilight = (1.0 - smoothstep(0.0, 0.22, abs(sun))) * step(-0.3, sun);
  vec3 warm = mix(vec3(1.0), vec3(1.0, 0.72, 0.5), twilight * 0.55);
  // Lambert-ish falloff toward the terminator. VIIRS "corrected reflectance"
  // is normalised as if the sun were overhead, so drawn flat the day side
  // stayed full-bright right up to the terminator: unreal, and at the
  // equinox it put bright polar cloud hard against the no-data cap (VIIRS
  // has no reflectance where the sun is that low). Real low sun lights dimly.
  float diffuse = 0.12 + 0.88 * smoothstep(-0.05, 0.45, sun);
  vec3 color = mix(nightLights, land * warm * diffuse, lit);

  // Ocean specular glint (item 4), masked to ocean by the base texture's own
  // blue dominance — Blue Marble already separates land from ocean by
  // colour, so no separate land-mask fetch earns its cost here.
  vec3 worldPos = normalize(vW) * ${GLOBE_RADIUS.toFixed(1)};
  vec3 viewDirW = normalize(cameraPosition - worldPos);
  vec3 reflectDir = reflect(-normalize(uSun), normalize(vW));
  float spec = pow(max(dot(reflectDir, viewDirW), 0.0), 60.0);
  color += vec3(1.0, 0.97, 0.88) * spec * oceanness * lit;

  gl_FragColor = vec4(color, 1.0);
  #include <colorspace_fragment>
}`;

// A second, thinner inner-limb haze layered just outside the real earth
// sphere (living-earth spec item 5 — the shared <Atmosphere> stays as the
// outer halo; this is EarthImagery's own addition). Same falloff shape as
// sun.ts's ATMO_FRAG, tighter and dimmer so it reads as the thin inner edge
// of the same atmosphere rather than a second halo.
// render.md finding 6: an additive exponential-falloff gradient over near-
// black is the textbook 8-bit banding case. `dither()` mirrors three's own
// built-in `dithering_fragment`/`dithering_pars_fragment` chunks (three.js's
// `common`/`dithering_pars_fragment` GLSL, MIT) — a per-pixel ordered offset
// from a deterministic hash of gl_FragCoord, +-0.25/255 per channel, cheap
// enough to run unconditionally on a shell that already renders every frame.
// Inlined rather than `material.dithering=true` because that three.js flag
// only auto-injects the chunk for ShaderLib-built materials; a raw
// ShaderMaterial's fragment source is used verbatim, so a custom shader has
// to carry the same logic itself to get the same effect.
const DITHER_GLSL = `
float rand(vec2 uv){const float a=12.9898,b=78.233,c=43758.5453;float dt=dot(uv,vec2(a,b)),sn=mod(dt,3.14159265359);return fract(sin(sn)*c);}
vec3 dither(vec3 color){float g=rand(gl_FragCoord.xy);vec3 shift=mix(vec3(0.5/255.0,-0.5/255.0,0.5/255.0),vec3(-0.5/255.0,0.5/255.0,-0.5/255.0),g);return color+shift;}`;

export const INNER_HAZE_FRAG = `
uniform vec3 uSun;varying vec3 vW;varying vec3 vN;varying vec3 vV;
${DITHER_GLSL}
void main(){
  float t=clamp(-dot(normalize(vN),normalize(vV))/.2,0.,1.);
  float d=.3+.7*smoothstep(-.3,.5,dot(normalize(vW),normalize(uSun)));
  gl_FragColor=vec4(dither(vec3(.4,.65,1.)*t*t*d*.5),1.);
}`;
