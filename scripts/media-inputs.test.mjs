import { expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

it("preserves hosted-media registries when local source assets are absent", () => {
  const root = mkdtempSync(join(tmpdir(), "portfolio-media-"));
  try {
    for (const dir of ["scripts", "src/lib", "src/data"]) mkdirSync(join(root, dir), { recursive: true });
    writeFileSync(join(root, "src/lib/assetBase.ts"), 'export const HEAVY_ASSET_BASE = "https://example.test/cv";');
    for (const [script, output] of [["gen-galleries.mjs", "galleries.ts"], ["gen-compare-sets.mjs", "compareSets.ts"]]) {
      copyFileSync(new URL(script, import.meta.url), join(root, "scripts", script));
      expect(() => execFileSync(process.execPath, [join(root, "scripts", script)], { stdio: "pipe" })).toThrow();
      const file = join(root, "src/data", output);
      writeFileSync(file, "committed registry\n");
      execFileSync(process.execPath, [join(root, "scripts", script)], { stdio: "pipe" });
      expect(readFileSync(file, "utf8")).toBe("committed registry\n");
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
