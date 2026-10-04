import { Vector3, type ShaderMaterial } from "three";
import type { SkyState } from "../../lib/sky.ts";
import { createSkyUniforms } from "./skyChunk.glsl.ts";
import { sunBinding, cloudCoverUniform, cloudShadeMultiplier } from "./live/liveBinding.ts";

/** The dome and environment bake read the same sky before their first frame. */
export function skyLighting(sky: SkyState | null) {
  const uniforms = createSkyUniforms();
  if (!sky) return { uniforms, intensity: 1.1, color: new Vector3(1, 1, 1) };
  const binding = sunBinding(sky.sun.altitudeDeg, sky.sun.azimuthDeg, sky.weather?.cloudPct ?? null);
  for (const [name, value] of Object.entries(binding.sky)) {
    if (name in uniforms && Array.isArray(value)) uniforms[name as keyof typeof uniforms].value = new Vector3(value[0], value[1], value[2]);
  }
  uniforms.uSunDir.value = new Vector3(...binding.uSunDir);
  uniforms.uCloudCover.value = cloudCoverUniform(sky.weather?.cloudPct ?? null);
  uniforms.uCloudShade.value.multiplyScalar(cloudShadeMultiplier(sky.weather?.code ?? null));
  return { uniforms, intensity: binding.sunI, color: new Vector3(...binding.sky.uSunCol) };
}

/** Reflector clones its input uniforms; bind the live objects after creation. */
export function shareSkyUniforms(material: ShaderMaterial, uniforms: ReturnType<typeof createSkyUniforms>): void {
  Object.assign(material.uniforms, uniforms);
}
