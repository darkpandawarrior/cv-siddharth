import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { rasterSources } from "./rasterSources.ts";
import { projects } from "../data/profile.ts";

/**
 * A <picture> picks its <source> on `type`/`media` alone. It does NOT fall
 * back to the <img> when the chosen source 404s — so pointing a source at a
 * derivative that no generator writes does not degrade, it breaks the image.
 *
 * rasterSources excluded `gif` and let everything else through, so DEADLOCK's
 * echo-stutter.svg was handed an `.avif` sibling that has never existed and
 * rendered as four broken images on its case study. The allow-list now
 * mirrors gen-images.mjs exactly.
 */
describe("rasterSources only claims derivatives that get generated", () => {
  it("derives for the formats gen-images actually walks", () => {
    for (const ext of ["png", "jpg", "jpeg"]) {
      expect(rasterSources(`/a/b.${ext}`), ext).toEqual({ avif: "/a/b.avif", webp: "/a/b.webp" });
    }
    // A .webp IS the webp; only the avif sibling is derived from it.
    expect(rasterSources("/a/b.webp")).toEqual({ avif: "/a/b.avif", webp: null });
  });

  it("claims nothing for vectors and animations", () => {
    for (const ext of ["svg", "gif", "mp4", "pdf", "SVG", "GIF"]) {
      expect(rasterSources(`/a/b.${ext}`), `${ext} must not get derivatives`).toBeNull();
    }
    expect(rasterSources("/a/no-extension")).toBeNull();
  });

  /**
   * Checks the SOURCE is committed, not that its derivatives are on disk.
   *
   * This asserted `existsSync(sources.avif)` and was red in CI on every run:
   * `.gitignore` ignores `public/**` + `*.avif` / `*.webp` because
   * gen-images.mjs derives them at build time, and the CI job runs
   * `tsc -> lint -> test -> check:generated` and never `npm run build`. So the
   * derivatives are absent there by design, and the assertion only ever passed
   * on a machine where an earlier build had left them lying around — it was
   * reading contaminated local state, and it reported that as a 404.
   *
   * The protection is not lost, because it never lived here: a `<source>`
   * pointing at a derivative no generator writes is caught by the two tests
   * above, which pin rasterSources' allow-list against gen-images.mjs's own
   * list exhaustively. That is what actually caught DEADLOCK's .svg.
   *
   * What is left is the half that is real and was never covered: a screen
   * naming a file nobody committed. gen-images walks all of public/ and emits
   * a sibling for every source it finds, so a committed source implies its
   * derivatives and an absent one is the only way to get a broken image.
   */
  it("never points a gallery image at a source nobody committed", () => {
    const root = new URL("../../", import.meta.url).pathname;
    const dead: string[] = [];
    for (const p of projects) {
      for (const s of (p.screens ?? []) as { file?: string }[]) {
        if (!s.file) continue;
        const src = `/projects/${p.slug}/screenshots/${s.file}`;
        if (!rasterSources(src)) continue; // correctly claims nothing
        if (!existsSync(join(root, "public", src))) dead.push(src);
      }
    }
    expect(dead, `these gallery sources are not committed, so nothing can derive from them: ${dead.join(", ")}`).toEqual([]);
  });
});
