import { test, type Page } from "@playwright/test";
import { isSoftwareRenderer } from "../../src/world/deviceTier.ts";

/** Skip only confirmed software rendering; hardware keeps the full test. */
export async function skipSoftwareRenderer(page: Page): Promise<void> {
  const renderer = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (!gl) return null;
    try {
      const debug = gl.getExtension("WEBGL_debug_renderer_info");
      const value = gl.getParameter(debug?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER);
      return typeof value === "string" ? value : null;
    } finally {
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    }
  });
  if (!renderer || !isSoftwareRenderer(renderer)) return;
  const reason = `@gpu requires a hardware GPU; SwiftShader/software WebGL detected: ${renderer}`;
  console.log(reason);
  test.skip(true, reason);
}
