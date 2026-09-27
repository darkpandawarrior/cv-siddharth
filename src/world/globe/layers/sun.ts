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
export const ATMO_FRAG = `uniform vec3 uSun;varying vec3 vW;varying vec3 vN;varying vec3 vV;
void main(){float t=clamp(-dot(normalize(vN),normalize(vV))/.42,0.,1.);float d=.3+.7*smoothstep(-.3,.5,dot(normalize(vW),uSun));
gl_FragColor=vec4(vec3(.3,.55,1.)*t*t*d*.9,1.);}`;

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
