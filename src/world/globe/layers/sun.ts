import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { subsolarPoint } from "../../../lib/sky.ts";
import { latLonToXyz } from "../geoMath.ts";

// Shared by every earth style (dots, imagery) so the limb and the terminator
// read the same whichever one is on.

// One vertex shader for the earth spheres and the atmosphere shell: the
// object-space normal for the sun term (the globe is never rotated, so it IS
// the world normal), the view-space normal and view direction for the limb
// terms, and the uv for textured styles.
export const VERT = `varying vec3 vW;varying vec3 vN;varying vec3 vV;varying vec2 vUv;
void main(){vW=normal;vUv=uv;vN=normalize(normalMatrix*normal);vec4 m=modelViewMatrix*vec4(position,1.);vV=normalize(-m.xyz);gl_Position=projectionMatrix*m;}`;

// Ocean (dots style): night to day across a soft terminator, plus a Fresnel
// rim that is brighter on the lit limb.
export const OCEAN_FRAG = `uniform vec3 uSun;varying vec3 vW;varying vec3 vN;varying vec3 vV;
void main(){float d=smoothstep(-.2,.4,dot(normalize(vW),uSun));vec3 c=mix(vec3(.03,.045,.07),vec3(.06,.11,.18),d);
float r=pow(1.-max(dot(normalize(vN),normalize(vV)),0.),3.);gl_FragColor=vec4(c+vec3(.3,.5,.9)*r*(.25+.75*d),1.);}`;

// Atmosphere: the back faces of a 1.1x shell, additive. -dot(n, v) runs from
// ~0.42 at the earth's limb to 0 at the shell's own edge (sqrt(1 - 1/1.1^2)),
// so the halo fades out instead of ending on a hard circle.
//
// Wave-7 Lane 3 step A: the flat blue used to be the whole story (`d` only
// dimmed it toward night, never changed its hue). Real limb reddening comes
// from Rayleigh scattering along the sun's slant path -- as cosSun (the sun's
// angle above THIS point's own local horizon) nears 0 at the terminator, that
// path's airmass grows, and blue's much larger scattering coefficient empties
// out of it first (Beer-Lambert per channel), leaving red. `p` below floors
// the airmass instead of letting it blow up at the exact horizon (a real
// Chapman-function airmass is step B's precomputed-scattering spike, not this
// ~15-line fix). RAYLEIGH_BETA_PER_M / RAYLEIGH_SCALE_HEIGHT_M below hold the
// same three numbers in testable TS form; this GLSL copy exists only because
// a fragment shader can't import them.
// render.md finding 6 (P1, 2026-09-30): additive gradient shells (this halo,
// EarthImagery.tsx's inner haze) risk visible 8-bit banding at their smooth
// falloff. `dither()` reproduces three.js's own built-in dithering chunks
// (`common`/`dithering_pars_fragment`, MIT) inline, since a raw ShaderMaterial
// doesn't get them auto-injected the way a ShaderLib material does.
const DITHER_GLSL = `
float rand(vec2 uv){const float a=12.9898,b=78.233,c=43758.5453;float dt=dot(uv,vec2(a,b)),sn=mod(dt,3.14159265359);return fract(sin(sn)*c);}
vec3 dither(vec3 color){float g=rand(gl_FragCoord.xy);vec3 shift=mix(vec3(0.5/255.0,-0.5/255.0,0.5/255.0),vec3(-0.5/255.0,0.5/255.0,-0.5/255.0),g);return color+shift;}`;

export const ATMO_FRAG = `uniform vec3 uSun;varying vec3 vW;varying vec3 vN;varying vec3 vV;
${DITHER_GLSL}
void main(){float t=clamp(-dot(normalize(vN),normalize(vV))/.42,0.,1.);float cs=dot(normalize(vW),uSun);float d=.3+.7*smoothstep(-.3,.5,cs);
float p=8000./max(abs(cs),.04);vec3 tr=exp(-vec3(5.802e-6,13.558e-6,33.1e-6)*p);
gl_FragColor=vec4(dither(vec3(.3,.55,1.)*tr*t*t*d*.9),1.);}`;

// Rayleigh scattering coefficients (beta, per metre, at 680/550/440nm) and
// the atmosphere's Rayleigh scale height (metres) -- both read verbatim off
// github.com/ebruneton/precomputed_atmospheric_scattering
// atmosphere/demo/demo.cc:228-229 (`kRayleigh = 1.24062e-6`,
// `kRayleighScaleHeight = 8000.0`) and reproduced at line 269
// (`rayleigh_scattering.push_back(kRayleigh * pow(lambda, -4))`, lambda in
// micrometres) for lambda = 0.68/0.55/0.44 -- verified today (2026-09-29)
// against a fresh checkout: kRayleigh * lambda^-4 gives 5.80234e-6,
// 1.35578e-5, 3.31000e-5, matching this plan's given constants to the
// precision it quoted them at. BSD-3-Clause (repo LICENSE). Blue scatters
// ~5.7x more than red, which is the whole reason sunsets redden.
export const RAYLEIGH_BETA_PER_M = { r: 5.802e-6, g: 13.558e-6, b: 33.1e-6 };
export const RAYLEIGH_SCALE_HEIGHT_M = 8000;

/** Beer-Lambert transmittance of the limb's slant path, as a function of
 *  cosSun = dot(surfaceNormal, sunDir): 0 exactly at the terminator, +-1 at
 *  local noon/midnight. Mirrors ATMO_FRAG's `p`/`tr` above exactly, in
 *  testable form (a fragment shader can't be unit-tested directly). */
export function rayleighTransmittance(cosSun: number): { r: number; g: number; b: number } {
  const path = RAYLEIGH_SCALE_HEIGHT_M / Math.max(Math.abs(cosSun), 0.04);
  return {
    r: Math.exp(-RAYLEIGH_BETA_PER_M.r * path),
    g: Math.exp(-RAYLEIGH_BETA_PER_M.g * path),
    b: Math.exp(-RAYLEIGH_BETA_PER_M.b * path),
  };
}

/** Unit vector toward the real subsolar point at `now`, in globe space. */
export function sunDirection(now: Date, out = new THREE.Vector3()): THREE.Vector3 {
  const sub = subsolarPoint(now);
  const p = latLonToXyz(sub.lat, sub.lon);
  return out.set(p.x, p.y, p.z);
}

/** One `{ uSun }` uniforms object, mutated in place when `now` changes:
 *  three binds a ShaderMaterial's uniforms at compile, so a replaced object
 *  would never reach the GPU. Spread extra uniforms onto it at creation
 *  time only. */
export function useSunUniforms(now: Date) {
  const uniforms = useMemo(() => ({ uSun: { value: new THREE.Vector3() } }), []);
  useEffect(() => {
    sunDirection(now, uniforms.uSun.value);
  }, [now, uniforms]);
  return uniforms;
}
