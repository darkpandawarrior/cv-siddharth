import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";
import { allRoutes } from "../src/data/routes.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://cv-siddharth.vercel.app";

/** Every `.../index.html` under `dir`, as the URL path it prerenders — "" for
 *  the root index, "project/doori" for a nested one — never descending into
 *  `assets/` (hashed JS/CSS, guaranteed to hold no index.html of its own). */
function prerenderedPaths(dir: string, base = ""): string[] {
  const paths: string[] = [];
  for (const entry of readdirSync(join(dir, base), { withFileTypes: true })) {
    if (entry.name === "assets") continue;
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) paths.push(...prerenderedPaths(dir, rel));
    else if (entry.name === "index.html") paths.push(rel === "index.html" ? "/" : `/${rel.slice(0, -"/index.html".length)}`);
  }
  return paths;
}

/**
 * The acceptance gate for this lane: dist/client's prerendered page set and
 * public/sitemap.xml's <loc> set must be exactly the same set, because both
 * are supposed to be `allRoutes` (src/data/routes.ts) and nothing else. This
 * is the one place that would notice if either side stopped being that —
 * vite.config.ts's `pages` list or scripts/gen-sitemap.mjs quietly drifting
 * from routes.ts, or routes.ts itself losing a corpus.
 *
 * Needs a real build first (`npm run build`), same as every other e2e spec —
 * playwright.config.ts's webServer already runs one before any spec starts.
 */
test("dist/client's prerendered pages equal the sitemap's URLs, both derived from allRoutes", () => {
  const distClient = join(root, "dist", "client");
  expect(existsSync(distClient), "dist/client is missing — run `npm run build` first").toBe(true);

  const prerendered = new Set(prerenderedPaths(distClient));
  expect(prerendered).toEqual(new Set(allRoutes));

  const sitemapXml = readFileSync(join(root, "public", "sitemap.xml"), "utf8");
  const sitemapped = new Set(
    [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(SITE, "")),
  );
  expect(sitemapped).toEqual(new Set(allRoutes));
});
