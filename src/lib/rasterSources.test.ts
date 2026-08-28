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

  it("never points a real gallery image at a derivative that is not on disk", () => {
    const root = new URL("../../", import.meta.url).pathname;
    const dead: string[] = [];
    for (const p of projects) {
      for (const s of (p.screens ?? []) as { file?: string }[]) {
        if (!s.file) continue;
        const src = `/projects/${p.slug}/screenshots/${s.file}`;
        const sources = rasterSources(src);
        if (!sources) continue; // correctly claims nothing
        // The .avif is the one a browser will choose first and fail hard on.
        if (!existsSync(join(root, "public", sources.avif))) dead.push(sources.avif);
      }
    }
    expect(dead, `these <source> paths 404 and will break their image: ${dead.join(", ")}`).toEqual([]);
  });
});
