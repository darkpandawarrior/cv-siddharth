import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * The whole point of this lane: nothing heavy rides along in the Vercel
 * deployment anymore. Vercel's free tier caps deployment storage at 10 GB —
 * hit 100% on 2026-09-07 — and this site redeploys on every merge to main, so
 * a single oversized file re-lands on every one of those deploys.
 *
 * Runs only when `dist/client` exists: this suite runs in the tsc → lint →
 * test → check:generated CI job, which never runs `npm run build` (see
 * surfaces.test.ts's "committed preview capture" docstring for the same
 * contract) — a test that required the build here would just be red on every
 * CI run. `npm run build && npm test` locally is what actually proves this.
 *
 * The hashed JS/CSS bundles under assets/ are the one exemption: Vite already
 * content-hashes and code-splits them, and they are the ~12 MB this lane's
 * own brief says stays.
 */
describe("dist/client stays under the Vercel deployment-size budget", () => {
  const root = new URL("../../", import.meta.url).pathname;
  const distClient = join(root, "dist", "client");
  const MAX = 2 * 1024 * 1024;

  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = join(dir, e.name);
      return e.isDirectory() ? walk(p) : [p];
    });

  it.skipIf(!existsSync(distClient))("has no file over 2 MB outside the hashed assets/ bundles", () => {
    const oversized = walk(distClient)
      .filter((f) => !f.startsWith(join(distClient, "assets") + "/"))
      .filter((f) => statSync(f).size > MAX)
      .map((f) => `${f.slice(root.length)} (${(statSync(f).size / 1048576).toFixed(1)} MB)`);
    expect(oversized, `these should have moved to heavy/ (see src/lib/assetBase.ts):\n  ${oversized.join("\n  ")}`).toEqual([]);
  });

  it.skipIf(!existsSync(distClient))("stays under 60 MB total", () => {
    const totalMB = walk(distClient).reduce((n, f) => n + statSync(f).size, 0) / 1048576;
    expect(totalMB, `dist/client is ${totalMB.toFixed(1)} MB`).toBeLessThan(60);
  });

  it.skipIf(!existsSync(distClient))("never ships one of the four moved heavy-asset app builds", () => {
    // "excelsior" dropped from this list (arch-L8): prerendering now writes a
    // real, tiny dist/client/excelsior/index.html for the /excelsior ROUTE,
    // which shares a name with the old heavy/excelsior/ PDF-scan payload but
    // is not it — the oversized-file check above already guards against that
    // payload actually leaking, wherever it would land.
    const heavy = ["kursi-app", "mileway-app", "paymentslab-app", "portfolio-app", "deadlock-app"];
    const shipped = existsSync(distClient) ? readdirSync(distClient) : [];
    const leaked = heavy.filter((d) => shipped.includes(d));
    expect(leaked, `these were meant to move to heavy/ and be served from GitHub Pages: ${leaked.join(", ")}`).toEqual([]);
  });
});
