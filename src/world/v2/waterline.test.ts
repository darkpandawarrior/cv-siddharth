import { describe, expect, it } from "vitest";
import { WATERLINE_CHUNK } from "./waterline.glsl.ts";
import { WATER_FRAGMENT_CHUNK, WATER_WAVE_UNIFORM_NAMES, WATER_LIVE_UNIFORM_NAMES } from "./waterShader.glsl.ts";
import { CAUSTICS_TIERS } from "./Water.tsx";

describe("waterShader.glsl.ts", () => {
  it("declares uFlowSpeed, uFoam and uRainRings", () => {
    for (const name of WATER_LIVE_UNIFORM_NAMES) {
      expect(WATER_FRAGMENT_CHUNK).toContain(name);
    }
    // Pinned literally too, in case the liveContract row list ever grows
    // past exactly these three — the acceptance line names these by name.
    expect(WATER_FRAGMENT_CHUNK).toContain("uFlowSpeed");
    expect(WATER_FRAGMENT_CHUNK).toContain("uFoam");
    expect(WATER_FRAGMENT_CHUNK).toContain("uRainRings");
  });
});

describe("waterline.glsl.ts: W1 synced foam stripe", () => {
  it("reads uTime and the water's own wave uniforms (same names as waterShader.glsl.ts)", () => {
    expect(WATERLINE_CHUNK).toContain("uTime");
    for (const name of WATER_WAVE_UNIFORM_NAMES) {
      expect(WATERLINE_CHUNK).toContain(name);
    }
  });

  it("declares uFoamW", () => {
    expect(WATERLINE_CHUNK).toContain("uFoamW");
  });

  it("break-it: a renamed wave uniform would fail the shared-name check (G15)", () => {
    const drifted = WATERLINE_CHUNK.replaceAll("uWaveAmp", "uSwellAmp");
    expect(drifted).not.toContain("uWaveAmp");
    expect(WATER_WAVE_UNIFORM_NAMES).toContain("uWaveAmp");
  });
});

describe("Water.tsx: W2 caustics tier gate", () => {
  it("CAUSTICS_TIERS is exactly ['T1']", () => {
    expect(CAUSTICS_TIERS).toEqual(["T1"]);
  });
});
