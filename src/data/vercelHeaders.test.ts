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
