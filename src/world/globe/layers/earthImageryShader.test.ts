import { describe, it, expect } from "vitest";
import { EARTH_IMAGERY_FRAG } from "./earthImageryShader.ts";

/**
 * WAVE 6 LANE X3 defect: the swath-gap/polar-night fill mask (`dayLuma`/
 * `gap`) used to sample `uDay` unconditionally, while the pixel actually
 * drawn (`dayColor`) can be the time-lapse crossfade (`uTLOlder`/`uTLNewer`)
 * or the compare pick (`uComparePast`). Scrubbed to a past day whose real
 * mosaic has a swath gap that today's live `uDay` doesn't share at the same
 * texel, the mask read "no gap" and the actual black hole went unpatched.
 * This guards that the mask is built from the SAME composited sources as
 * `dayColor`, not a plain `uDay` read — a source-string check (there is no
 * WebGL context in vitest to render against), same technique as this
 * directory's own shaderUniforms.test.ts.
 */
/** The mask-computation block, bounded by comments/statements present in
 *  both the fixed and the regressed source, so the same extractor covers
 *  the real shader and the break-it case below. Pure so both can share it. */
function gapMaskBlock(source: string): string {
  const start = source.indexOf("Swath gaps and polar night");
  const end = source.indexOf("float gap =", start);
  if (start === -1 || end === -1) throw new Error("gap-mask block not found");
  return source.slice(start, end);
}

/** Every uniform/variable a REAL fix must route through: dayColor's own
 *  three inputs (the live day, the time-lapse crossfade, the compare pick)
 *  and both feature-active flags — proof the mask depends on whichever
 *  frame is actually drawn, not a hardcoded uDay read. */
const COMPOSITE_TOKENS = ["uTLOlder", "uTLNewer", "uTLBlend", "uTLActive", "uComparePast", "uCompareActive"];

describe("earth imagery's gap-fill mask reads the composited day colour", () => {
  it("the dayLuma sample composites every source dayColor can draw from", () => {
    const gapBlock = gapMaskBlock(EARTH_IMAGERY_FRAG);
    for (const token of COMPOSITE_TOKENS) expect(gapBlock).toContain(token);
  });

  it("break-it: the old unconditional-uDay read fails this same guard", () => {
    const regressed = `Swath gaps and polar night, patched from the base.
    float dayLuma = dot(texture2D(uDay, vUv, 5.0).rgb, vec3(0.299, 0.587, 0.114));
    float gap = 1.0 - smoothstep(0.02, 0.16, dayLuma);`;
    const gapBlock = gapMaskBlock(regressed);
    const missing = COMPOSITE_TOKENS.filter((t) => !gapBlock.includes(t));
    expect(missing).toEqual(COMPOSITE_TOKENS); // none of them present — this is exactly what the real guard above would have caught
  });
});
