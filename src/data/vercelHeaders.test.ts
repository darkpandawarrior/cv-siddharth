import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The four KMP demo apps + Stutter's Godot/Wasm export moved off Vercel onto
 * GitHub Pages (see src/lib/assetBase.ts) — the deployment-size budget this
 * lane exists to fix. Their per-app immutable-wasm-cache rules and their
 * `/(.*)-app/index.html` no-store rule went with them: GitHub Pages sets its
 * own cache headers for whatever it serves, and this repo's vercel.json has
 * no more say over it.
 *
 * This used to be a positive assertion ("every -app directory gets a cache
 * rule"). It is now the opposite: nothing under `public/` ends in `-app`
 * anymore, and vercel.json should carry no rule for a path that is never
 * served from here again — a dead rule nobody notices is exactly how this
 * repo's cache-header drift has bitten before (see the docstring this
 * replaced, and serviceWorker.test.ts's BYPASS history).
 */
describe("vercel.json carries no rule for a path GitHub Pages now serves", () => {
  const root = new URL("../../", import.meta.url).pathname;
  const config = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8")) as {
    headers: { source: string; headers: { key: string; value: string }[] }[];
  };

  it("has no per-app wasm/pck cache rule left over from the Vercel-served builds", () => {
    const stale = config.headers
      .map((h) => h.source)
      .filter((s) => /-app\//.test(s) || /-app\/index\.html/.test(s));
    expect(stale, `dead rule(s) for a path GitHub Pages now serves: ${stale.join(", ")}`).toEqual([]);
  });
});

/**
 * X-Frame-Options: DENY refuses framing from EVERY origin, this site included
 * — it sat on `/(.*)` for months and broke every live embed while working
 * fine in dev (no such header there). The live builds now come from GitHub
 * Pages, a genuinely different origin, so this header no longer has any say
 * over whether THEY can be framed either way; it still matters for this
 * site's own pages, which is the clickjacking protection SAMEORIGIN is for.
 */
describe("vercel.json framing", () => {
  const root = new URL("../../", import.meta.url).pathname;
  const config = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8")) as {
    headers: { source: string; headers: { key: string; value: string }[] }[];
  };

  const xfo = config.headers
    .flatMap((h) => h.headers.map((x) => ({ source: h.source, ...x })))
    .filter((h) => h.key.toLowerCase() === "x-frame-options");

  it("never sends DENY", () => {
    const denies = xfo.filter((h) => h.value.toUpperCase() === "DENY");
    expect(denies.map((d) => d.source), "X-Frame-Options: DENY blocks same-origin framing too").toEqual([]);
  });

  it("still refuses cross-origin framing", () => {
    expect(xfo.length, "X-Frame-Options disappeared entirely").toBeGreaterThan(0);
    for (const h of xfo) expect(h.value.toUpperCase()).toBe("SAMEORIGIN");
  });
});

/**
 * CSP allowlist drift (arch-L15). src/lib/csp.ts is the one module the
 * header generator (scripts/gen-csp.mjs), the preview plugin (vite.config.ts)
 * and this test all read — so an origin used somewhere in this codebase that
 * the allowlist does not declare is a test failure, not a runtime surprise
 * the next visitor discovers as a broken map tile or missing album art.
 *
 * Scoped to the two ACTUAL sources of a new external origin this repo has —
 * not a generic "grep every https:// literal" scan, which would flag dozens
 * of ordinary <a href> links (LinkedIn, GitHub, the Play Store…) that CSP
 * never governs in the first place, since a browser navigating off this
 * site by a click is not a resource load this policy restricts.
 */
describe("the CSP allowlist tracks the code that actually reaches these origins", () => {
  it("covers every subdomain SignalLab's tile URL round-robins across", async () => {
    const { CSP_DIRECTIVES } = await import("../lib/csp.ts");
    const signalLab = readFileSync(new URL("../labs/SignalLab.tsx", import.meta.url), "utf8");
    const m = signalLab.match(/const TILE_URL = "https:\/\/\{s\}\.([a-z0-9.-]+)\//);
    expect(m, "SignalLab.tsx's TILE_URL shape changed — update this test's pattern too").toBeTruthy();
    const host = m![1];
    const missing = ["a", "b", "c"]
      .map((sub) => `https://${sub}.${host}`)
      .filter((origin) => !CSP_DIRECTIVES["img-src"].includes(origin));
    expect(missing, `src/lib/csp.ts's img-src is missing: ${missing.join(", ")}`).toEqual([]);
  });

  it("declares the Spotify album-art CDN (a runtime value, not a source literal)", async () => {
    const { CSP_DIRECTIVES } = await import("../lib/csp.ts");
    expect(CSP_DIRECTIVES["img-src"]).toContain("https://i.scdn.co");
  });

  it("declares the GitHub Pages origin the heavy Wasm/screenshot/video builds serve from", async () => {
    const { CSP_DIRECTIVES } = await import("../lib/csp.ts");
    const { HEAVY_ASSET_BASE } = await import("../lib/assetBase.ts");
    if (HEAVY_ASSET_BASE.startsWith("/")) return; // same-origin in this dev config — nothing to allowlist
    const origin = new URL(HEAVY_ASSET_BASE).origin;
    for (const directive of ["img-src", "media-src", "frame-src"] as const) {
      expect(CSP_DIRECTIVES[directive], `${directive} is missing ${origin}`).toContain(origin);
    }
  });
});
