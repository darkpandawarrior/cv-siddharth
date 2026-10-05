/**
 * Perlin transition adapted from Rich Harris, gl-transitions, MIT.
 * https://github.com/gl-transitions/gl-transitions/blob/master/transitions/perlin.glsl
 * Noise interpolation credits Morgan McGuire, https://www.shadertoy.com/view/4dS3Wd.
 * Copyright (c) 2017-present gl-transitions contributors
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
export const dissolveVertex = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

export const dissolveFragment = /* glsl */ `
uniform sampler2D frame;
uniform float progress;
uniform vec3 ink;
uniform vec3 rimColor;
varying vec2 vUv;
float random(vec2 co) {
  return fract(sin(mod(dot(co, vec2(12.9898, 78.233)), 3.14)) * 43758.5453);
}
float noise(vec2 st) {
  vec2 i = floor(st), f = fract(st);
  float a = random(i), b = random(i + vec2(1.0, 0.0));
  float c = random(i + vec2(0.0, 1.0)), d = random(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}
void main() {
  float n = noise(vUv * 4.0);
  float p = mix(-0.01, 1.01, progress);
  float keep = smoothstep(p - 0.01, p + 0.01, n);
  float rim = (1.0 - smoothstep(0.01, 0.05, abs(n - p))) * sin(progress * 3.14159265);
  vec3 color = mix(ink, texture2D(frame, vUv).rgb, keep);
  gl_FragColor = vec4(color + rim * rimColor, 1.0);
}
`;

// A single cross-root request, like the tour and walk stores. No window event bus.
export interface LandmarkEnter { navigate: () => Promise<void> }
let enter: LandmarkEnter | null = null;
const listeners = new Set<() => void>();
export function getLandmarkEnter(): LandmarkEnter | null { return enter; }
export function subscribeLandmarkEnter(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function setLandmarkEnter(value: LandmarkEnter | null): boolean {
  if (value && listeners.size === 0) return false;
  if (value && enter) return true;
  enter = value;
  for (const listener of listeners) listener();
  return true;
}
