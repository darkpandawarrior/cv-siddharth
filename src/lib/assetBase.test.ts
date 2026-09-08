import { describe, it, expect } from "vitest";
import { heavy } from "./assetBase.ts";

describe("heavy()", () => {
  // Regression: HEAVY_ASSET_BASE="/" (the local-dev escape hatch this file's
  // own doc comment describes) plus every caller's leading-slash path used to
  // concatenate straight into "//gaddi-app/…" — a BROWSER parses a leading
  // "//" as protocol-relative (host "gaddi-app"), not a same-origin path, so
  // the request never reaches this server at all. Node/curl resolve "//" fine,
  // which is why this shipped unnoticed until a real browser exercised it.
  it("never produces a protocol-relative (leading //) URL", () => {
    expect(heavy("/gaddi-app/index.html")).not.toMatch(/^\/\//);
    expect(heavy("/projects/doori/screenshots/x.webp")).not.toMatch(/^\/\//);
  });

  it("still joins onto a non-slash base (the production case) untouched", () => {
    expect(heavy("/gaddi-app/index.html")).toContain("/gaddi-app/index.html");
  });
});
