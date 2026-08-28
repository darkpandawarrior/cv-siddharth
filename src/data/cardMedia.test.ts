import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { projects, cardMedia } from "./profile.ts";

/**
 * Every project card gets a banner, and every banner exists on disk.
 *
 * `cardMedia` was a hand-written map of six slugs while gen-project-heroes.mjs
 * rendered a banner for every project in the registry. The result was two
 * cards — `kmp-family` and `the-loopdown` — rendering with no banner at all,
 * visibly shorter than the six beside them, while their PNGs sat unused in
 * public/projects/_heroes/. It is derived now, and this proves the derivation
 * against the filesystem rather than against another copy of the same list.
 */
describe("project card banners", () => {
  const root = new URL("../../", import.meta.url).pathname;

  it("finds the projects it is meant to be checking", () => {
    expect(projects.length).toBeGreaterThanOrEqual(8);
  });

  it("gives every project a banner — no card is left short", () => {
    const missing = projects.filter((p) => !cardMedia[p.slug]).map((p) => p.slug);
    expect(missing, `these cards would render with no banner: ${missing.join(", ")}`).toEqual([]);
  });

  it("points every banner at a file that is actually there", () => {
    const dead = Object.entries(cardMedia)
      .filter(([, m]) => !existsSync(join(root, "public", m.src)))
      .map(([slug, m]) => `${slug} → ${m.src}`);
    expect(dead, `broken card banner src: ${dead.join(", ")}`).toEqual([]);
  });

  it("names a .png, so Picture can derive its .avif/.webp siblings", () => {
    for (const [slug, m] of Object.entries(cardMedia)) {
      expect(m.src.endsWith(".png"), `${slug} must point at the original raster`).toBe(true);
      for (const ext of [".avif", ".webp"]) {
        const sibling = m.src.replace(/\.png$/, ext);
        expect(existsSync(join(root, "public", sibling)), `${sibling} missing — run npm run gen:images`).toBe(true);
      }
    }
  });

  it("has no orphan hero left behind by a project that was removed", async () => {
    const { readdirSync } = await import("node:fs");
    const slugs = new Set(projects.map((p) => p.slug));
    const orphans = readdirSync(join(root, "public/projects/_heroes"))
      .filter((f) => f.endsWith(".png"))
      .map((f) => f.replace(/\.png$/, ""))
      .filter((s) => !slugs.has(s));
    expect(orphans, `heroes for projects that no longer exist: ${orphans.join(", ")}`).toEqual([]);
  });

  it("writes alt text that carries the project's own facts", () => {
    for (const p of projects) {
      expect(cardMedia[p.slug].alt).toContain(p.name);
      expect(cardMedia[p.slug].alt).toContain(p.status);
    }
  });
});
