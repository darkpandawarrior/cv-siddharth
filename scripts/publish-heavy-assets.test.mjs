import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { destSizeBytes } from "./publish-heavy-assets.mjs";

// destSizeBytes is the pre-publish size gate's core: audit fix (2026-09-28),
// heavy/ was ~422 MB going into a GitHub Pages site with a ~1 GB soft cap
// shared with the fdroid/ repo it also serves. Importing this module must
// not run the actual publish (rsync/git/process.exit) — see the
// `import.meta.url === file://process.argv[1]` guard at the bottom of
// publish-heavy-assets.mjs — which is exactly what this import exercises.

describe("destSizeBytes", () => {
  it("returns 0 for a directory that doesn't exist yet", () => {
    expect(destSizeBytes(join(tmpdir(), "publish-heavy-assets-does-not-exist"))).toBe(0);
  });

  it("sums file bytes recursively across nested directories", () => {
    const dir = mkdtempSync(join(tmpdir(), "publish-heavy-assets-"));
    try {
      writeFileSync(join(dir, "a.txt"), "12345"); // 5 bytes
      mkdirSync(join(dir, "nested"));
      writeFileSync(join(dir, "nested", "b.txt"), "1234567890"); // 10 bytes
      mkdirSync(join(dir, "nested", "deeper"));
      writeFileSync(join(dir, "nested", "deeper", "c.txt"), "123"); // 3 bytes
      expect(destSizeBytes(dir)).toBe(18);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("counts a symlinked file's real target size once, not as a separate entry", () => {
    const dir = mkdtempSync(join(tmpdir(), "publish-heavy-assets-"));
    try {
      writeFileSync(join(dir, "real.txt"), "1234567890"); // 10 bytes
      symlinkSync(join(dir, "real.txt"), join(dir, "link.txt"));
      // statSync follows the symlink: 10 (real.txt) + 10 (link.txt's target) = 20.
      expect(destSizeBytes(dir)).toBe(20);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
