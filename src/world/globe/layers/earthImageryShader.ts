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
varying vec3 vW;varying vec3 vN;varying vec3 vV;varying vec2 vUv;

${CLOUD_MASK_GLSL}
void main(){
  vec3 dayColor = texture2D(uDay, vUv).rgb;
  vec3 baseColor = texture2D(uBase, vUv).rgb;

  // Swath gaps and polar night in the daily VIIRS mosaic read as near-black;
  // patch them from the static Blue Marble base rather than draw a hole
  // (living-earth spec item 2).
  // The mask reads a BLURRED mip (bias 5, ~32 texels): VIIRS has no
  // reflectance where the sun is low, so the polar cap is a hard-edged
  // no-data disc, and a per-texel mask cut from bright sea ice straight to
  // the base's dark polar ocean on a visible rim. Averaging over the edge
  // feathers it across a few degrees instead.
  float dayLuma = dot(texture2D(uDay, vUv, 5.0).rgb, vec3(0.299, 0.587, 0.114));
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

  // City lights (item 3): brighten only — a cheap stand-in for bloom that
  // needs no extra postprocessing pass.
  vec3 nightLights = texture2D(uNight, vUv).rgb * 1.6;

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
export const INNER_HAZE_FRAG = `
uniform vec3 uSun;varying vec3 vW;varying vec3 vN;varying vec3 vV;
void main(){
  float t=clamp(-dot(normalize(vN),normalize(vV))/.2,0.,1.);
  float d=.3+.7*smoothstep(-.3,.5,dot(normalize(vW),normalize(uSun)));
  gl_FragColor=vec4(vec3(.4,.65,1.)*t*t*d*.5,1.);
}`;
