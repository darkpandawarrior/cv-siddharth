import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";

/**
 * No served asset is a Git LFS pointer.
 *
 * scripts/sync-project-media.mjs pulls each project's media over
 * raw.githubusercontent, and raw.githubusercontent serves the POINTER — about
 * 130 bytes of text — for anything the source repo tracks in Git LFS. DEADLOCK's
 * .gitattributes puts every binary asset through LFS, so six of its files came
 * back as pointers and the sync wrote them straight over the real committed
 * images: title.webp went from 13 KB of WEBP to a text file, and gen-images.mjs
 * then died on "Input file contains unsupported image format".
 *
 * It never reached production only because the refresh job was already red
 * earlier in the chain. The moment that was fixed, the next scheduled run would
 * have committed the pointers and shipped six broken images to a live case
 * study. The sync now refuses to write a pointer; this proves none is present.
 */
describe("no served asset is a Git LFS pointer", () => {
  const root = new URL("../../", import.meta.url).pathname;
  const BINARY = new Set([".png", ".jpg", ".jpeg", ".webp", ".avif", ".gif", ".mp4", ".ttf", ".woff2", ".pdf"]);

  const files: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (BINARY.has(extname(p).toLowerCase())) files.push(p);
    }
  };
  walk(join(root, "public"));

  it("finds the assets it is meant to be checking", () => {
    expect(files.length).toBeGreaterThan(200);
  });

  it("has no pointer file standing in for a real binary", () => {
    const pointers = files
      // A pointer is tiny; reading only the small files keeps this cheap over
      // ~1,500 assets.
      .filter((f) => statSync(f).size < 1024)
      .filter((f) => readFileSync(f).subarray(0, 40).toString("utf8").startsWith("version https://git-lfs"))
      .map((f) => f.slice(root.length));
    expect(pointers, `these are LFS pointers, not images: ${pointers.join(", ")}`).toEqual([]);
  });

  it("keeps the sync's own guard in place", () => {
    const sync = readFileSync(join(root, "scripts", "sync-project-media.mjs"), "utf8");
    expect(sync, "the LFS-pointer guard was removed from sync-project-media.mjs").toMatch(/git-lfs/);
  });
});
