import { CLOUD_MASK_GLSL } from "./cloudMask.ts";

export const CLOUD_FRAG = `
uniform sampler2D uDay;
uniform sampler2D uBase;
uniform vec3 uSun;
uniform float uReady;
varying vec3 vW;varying vec3 vN;varying vec3 vV;varying vec2 vUv;
${CLOUD_MASK_GLSL}
void main() {
  float sun = dot(normalize(vW), normalize(uSun));
  float day = smoothstep(-0.12, 0.12, sun);
  float rim = pow(1.0-max(dot(normalize(vN),normalize(vV)),0.0), 3.0);
  float twilight = 1.0-smoothstep(0.0,0.25,abs(sun));
  vec3 light = vec3(0.012,0.017,0.025) + vec3(0.92,0.95,1.0)
    * day * (0.24+0.76*smoothstep(0.0,0.6,sun));
  light += vec3(0.36,0.24,0.14)*rim*twilight*day;
  gl_FragColor = vec4(light, cloudMask(vUv)*uReady*0.94);
  #include <colorspace_fragment>
}`;
