import { expect, test } from "vitest";
import type { SkyState } from "../../lib/sky.ts";
import { PlaneGeometry, type ShaderMaterial } from "three";
import { Reflector } from "three/addons/objects/Reflector.js";
import { createWaterShader } from "./waterShader.glsl.ts";
import { skyLighting, shareSkyUniforms } from "./skyLighting.ts";
import { createSkyDomeMaterial } from "./SkyDome.tsx";
import { SANGAM_NIGHT_ROW, SANGAM_DAY_ROW } from "./live/sangamSky.ts";

function reading(altitudeDeg: number): SkyState {
  return { sun: { altitudeDeg, azimuthDeg: 180 }, weather: { cloudPct: 95, code: 3 } } as SkyState;
}

test("night and noon environment materials use the live dome's exact uniforms", () => {
  for (const [altitude, row] of [[-30, SANGAM_NIGHT_ROW], [70, SANGAM_DAY_ROW]] as const) {
    const lighting = skyLighting(reading(altitude));
    const dome = createSkyDomeMaterial(lighting.uniforms);
    const environment = createSkyDomeMaterial(lighting.uniforms);
    expect(environment.uniforms).toBe(dome.uniforms);
    expect(environment.uniforms.uSkyZen.value.toArray()).toEqual(row.uSkyZen);
    expect(environment.uniforms.uCloudCover.value).toBe(0.95);
    const geometry = new PlaneGeometry(1, 1);
    const water = new Reflector(geometry, { shader: createWaterShader({ hullLength: 4, hullMaxHalfBeam: 1 }), textureWidth: 2, textureHeight: 2 });
    shareSkyUniforms(water.material as ShaderMaterial, lighting.uniforms);
    expect((water.material as ShaderMaterial).uniforms.uSkyZen).toBe(dome.uniforms.uSkyZen);
    expect((water.material as ShaderMaterial).uniforms.uSunDir).toBe(dome.uniforms.uSunDir);
    water.dispose();
    geometry.dispose();
    expect(lighting.intensity).toBeCloseTo(row.sunI * (1 - 0.6 * 0.95));
    dome.dispose();
    environment.dispose();
  }
});
