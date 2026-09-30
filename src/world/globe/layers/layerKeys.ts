// Shared renderer colours and explanations. No three or browser imports.
import type { Legend } from "./gibsCatalog.ts";

export const ECLIPSE_CORE = "#c499ff";
export const ECLIPSE_HALO = "#9564f4";
export const ECLIPSE_SHADOW = "#e4d2ff";
export const ECLIPSE_CORE_RADIUS = 0.07;
export const ECLIPSE_HALO_RADIUS = 0.14;
export const ECLIPSE_GSFC_NOTE = "computed with astronomy-engine (MIT); greatest-eclipse point checked against NASA GSFC to within 0.5 deg";
export const EMBER = "#ff7a3d";
export const VOLCANO = "#b3452e";
export const STORM = "#8ecbff";
export const ALERT_WARN = "#f0883e";
export const ALERT_DANGER = "#ff5c5c";
export const LAUNCH = "#c9d4d0";
export const LAUNCH_BEAM = "#5ee6ff";
export const AURORA_GREEN_RGB = [0.25, 0.95, 0.55] as const;
export const AURORA_VIOLET_RGB = [0.4, 0.55, 1.0] as const;
export const AURORA_RGB = AURORA_GREEN_RGB.map((v, i) => v * 0.55 + AURORA_VIOLET_RGB[i] * 0.45);
export const GOLDEN_RGB = [0.95, 0.62, 0.32] as const;
export const WAKE_RGB = [0.85, 0.86, 0.78] as const;
export function rgbHex(rgb: readonly number[]): string {
  return `#${rgb.map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("")}`;
}
export const ECLIPSE_LEGEND: Legend = { unit: "", stops: [
  { color: ECLIPSE_CORE, label: "Umbra / antumbra track (illustrative width)" },
  { color: ECLIPSE_SHADOW, label: "Live shadow point (during eclipse)" },
] };
export const DAYLIGHT_LEGEND: Legend = { unit: "", stops: [
  { color: rgbHex(GOLDEN_RGB), label: "Golden-hour band" },
  { color: rgbHex(WAKE_RGB), label: "Waking-cities band" },
] };
export const BLOOM_THRESHOLD = 1.0;
export const BLOOM_INTENSITY = 0.6;

export const DAYLIGHT_FRAG = `uniform vec3 uSun;uniform float uWakeCenter;varying vec3 vW;
const float PI=3.14159265;
void main(){
  float cosSun=dot(normalize(vW),uSun);
  float golden=smoothstep(-0.104528,-0.069756,cosSun)*(1.0-smoothstep(0.104528,0.139173,cosSun));
  float lon=atan(-vW.z,vW.x);
  float d=lon-uWakeCenter;
  d-=2.0*PI*floor((d+PI)/(2.0*PI));
  float wake=1.0-smoothstep(0.0,0.3927,abs(d));
  wake*=wake;
  vec3 goldC=vec3(${GOLDEN_RGB.join(",")});
  vec3 wakeC=vec3(${WAKE_RGB.join(",")});
  vec3 col=goldC*golden*.5+wakeC*wake*.32;
  gl_FragColor=vec4(col,1.0);
}`;

// Counts are published with the same drawn sets as HazardLayer's health.
export interface HazardKeys {
  quakes: number; fires: number; storms: number; volcanoes: number;
  alerts: number; launches: number; cones: number; aurora: boolean; kp: number | null;
}
const EMPTY_HAZARD_KEYS: HazardKeys = { quakes: 0, fires: 0, storms: 0, volcanoes: 0, alerts: 0, launches: 0, cones: 0, aurora: false, kp: null };
let hazardKeys = EMPTY_HAZARD_KEYS;
const listeners = new Set<() => void>();
export function getHazardKeys() { return hazardKeys; }
export function setHazardKeys(next: HazardKeys) {
  hazardKeys = next;
  for (const listener of listeners) listener();
}
export function resetHazardKeys() { setHazardKeys(EMPTY_HAZARD_KEYS); }
export function subscribeHazardKeys(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
