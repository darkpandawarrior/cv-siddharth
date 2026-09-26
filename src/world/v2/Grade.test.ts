import { describe, expect, it } from "vitest";
import { GradeEffect } from "./Grade.ts";

/**
 * open-data-spec.md §5 "The Survey lens": `setLook` is "a uniform preset
 * swap, with no new pass and no engine swap: exposure ×0.55, saturation
 * 0.25, a teal lift in the shadows, vignette 0.55, grain ×1.5 (bloom
 * unchanged)". This lane's acceptance item pins the four numeric ones.
 */
describe("GradeEffect.setLook", () => {
  it("constructs in the golden look", () => {
    const grade = new GradeEffect();
    expect(grade.currentLook).toBe("golden");
  });

  it("survey sets exposure x0.55, saturation 0.25, vignette 0.55, grain x1.5", () => {
    const grade = new GradeEffect();
    grade.setLook("survey");
    expect(grade.currentLook).toBe("survey");
    expect(grade.uniforms.get("uExposure")!.value).toBeCloseTo(0.55, 10);
    expect(grade.uniforms.get("uSaturation")!.value).toBe(0.25);
    expect(grade.uniforms.get("uVignette")!.value).toBe(0.55);
    expect(grade.uniforms.get("uGrain")!.value).toBeCloseTo(1.5, 10);
  });

  it("golden restores every value survey changed", () => {
    const grade = new GradeEffect();
    const golden = {
      exposure: grade.uniforms.get("uExposure")!.value,
      saturation: grade.uniforms.get("uSaturation")!.value,
      vignette: grade.uniforms.get("uVignette")!.value,
      grain: grade.uniforms.get("uGrain")!.value,
      tealLift: grade.uniforms.get("uTealLift")!.value,
    };

    grade.setLook("survey");
    grade.setLook("golden");

    expect(grade.currentLook).toBe("golden");
    expect(grade.uniforms.get("uExposure")!.value).toBe(golden.exposure);
    expect(grade.uniforms.get("uSaturation")!.value).toBe(golden.saturation);
    expect(grade.uniforms.get("uVignette")!.value).toBe(golden.vignette);
    expect(grade.uniforms.get("uGrain")!.value).toBe(golden.grain);
    expect(grade.uniforms.get("uTealLift")!.value).toBe(golden.tealLift);
  });
});
