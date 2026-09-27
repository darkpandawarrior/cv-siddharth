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
import { GLOBE_RADIUS } from "../geoMath.ts";

export const EARTH_IMAGERY_FRAG = `
uniform vec3 uSun;
uniform sampler2D uDay;
uniform sampler2D uBase;
uniform sampler2D uNight;
varying vec3 vW;varying vec3 vN;varying vec3 vV;varying vec2 vUv;

void main(){
  vec3 dayColor = texture2D(uDay, vUv).rgb;
  vec3 baseColor = texture2D(uBase, vUv).rgb;

  // Swath gaps and polar night in the daily VIIRS mosaic read as near-black;
  // patch them from the static Blue Marble base rather than draw a hole
  // (living-earth spec item 2).
  float dayLuma = dot(dayColor, vec3(0.299, 0.587, 0.114));
  float gap = 1.0 - smoothstep(0.02, 0.06, dayLuma);
  vec3 land = mix(dayColor, baseColor, gap);

  // City lights (item 3): brighten only — a cheap stand-in for bloom that
  // needs no extra postprocessing pass.
  vec3 nightLights = texture2D(uNight, vUv).rgb * 1.6;

  float sun = dot(normalize(vW), normalize(uSun));
  float lit = smoothstep(-0.12, 0.08, sun); // soft terminator band
  vec3 color = mix(nightLights, land, lit);

  // Warm twilight band straddling the terminator itself.
  float twilight = (1.0 - smoothstep(0.0, 0.22, abs(sun))) * step(-0.3, sun);
  color += vec3(1.0, 0.55, 0.22) * twilight * 0.22;

  // Ocean specular glint (item 4), masked to ocean by the base texture's own
  // blue dominance — Blue Marble already separates land from ocean by
  // colour, so no separate land-mask fetch earns its cost here.
  float oceanness = smoothstep(0.03, 0.14, baseColor.b - max(baseColor.r, baseColor.g));
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
