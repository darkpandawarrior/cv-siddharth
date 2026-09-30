// WAVE 2 LANE W1 (deep zoom): the two tile fragment shaders. Both reuse
// sun.ts's shared VERT (vW world normal, vN view normal, vV view dir, vUv) —
// every earth-adjacent mesh in this scene compiles the same vertex stage, per
// that file's own comment. Uniforms are always passed via `args` at material
// construction (never as a `uniforms` prop) — shaderUniforms.test.ts guards
// this repo-wide; see gibs.test.ts's twin (this lane may not edit that file,
// but the same rule applies here).

/** The base-imagery tile shader: samples the tile's own texture and fades
 *  its alpha out across the terminator (the same `lit` falloff shape
 *  EARTH_IMAGERY_FRAG uses), so once a tile goes fully transparent on the
 *  night side, the whole-globe EarthImagery sphere's own night lights show
 *  through from underneath rather than this tile blotting them out with an
 *  unlit daytime photo. `uOpacity` is this tile's own crossfade/fade-in
 *  value (0..1), multiplied in on top of the day/night term. */
export const TILE_FRAG_DAY = `
uniform vec3 uSun;
uniform sampler2D uTex;
uniform float uOpacity;
varying vec3 vW;varying vec3 vN;varying vec3 vV;varying vec2 vUv;
void main(){
  vec4 tex = texture2D(uTex, vUv);
  float sun = dot(normalize(vW), normalize(uSun));
  float lit = smoothstep(-0.12, 0.08, sun);
  gl_FragColor = vec4(tex.rgb, tex.a * uOpacity * lit);
  #include <colorspace_fragment>
}`;

/** The overlay tile shader: no day/night modulation — a science overlay
 *  (precipitation, SST, snow, borders, labels) reads regardless of the
 *  terminator, the same way the real product itself is not a "daytime
 *  reflectance" measurement. Opacity is the layer panel's own per-overlay
 *  slider times this tile's own fade-in. */
export const TILE_FRAG_PLAIN = `
uniform sampler2D uTex;
uniform float uOpacity;
varying vec3 vW;varying vec3 vN;varying vec3 vV;varying vec2 vUv;
void main(){
  vec4 tex = texture2D(uTex, vUv);
  gl_FragColor = vec4(tex.rgb, tex.a * uOpacity);
  #include <colorspace_fragment>
}`;
