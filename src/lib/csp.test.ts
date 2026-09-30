import { expect, it } from "vitest";
import { createHash } from "node:crypto";
import { buildCspHeader, CSP_DIRECTIVES, inlineScriptBodies } from "./csp.ts";

it("allows NOAA tide fetches and both GIBS image and tile loading paths", () => {
  expect(CSP_DIRECTIVES["connect-src"]).toContain("https://api.tidesandcurrents.noaa.gov");
  for (const directive of ["connect-src", "img-src"]) {
    expect(CSP_DIRECTIVES[directive]).toContain("https://gibs.earthdata.nasa.gov");
  }
});

it("hashes the parser-normalized hydration text and preserves entity literals", () => {
  const html = '<script src="/app.js">external</script><script>const id="\0";\r\n// &amp;\r</script>';
  const [script] = inlineScriptBodies(html);
  expect(script).toBe('const id="\uFFFD";\n// &amp;\n');
  const digest = createHash("sha256").update(script).digest("base64");
  const policy = buildCspHeader([digest]).split(";").find((part) => part.trim().startsWith("script-src"));
  expect(policy).toContain(`'sha256-${digest}'`);
  expect(policy).not.toContain("unsafe-inline");
  expect(inlineScriptBodies(html)).toHaveLength(1);
});
