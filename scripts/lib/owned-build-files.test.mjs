import { gitEnv } from "./git-env.mjs";
import { it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { execFileSync } from "node:child_process";
import { ownedBuildFiles } from "./owned-build-files.mjs";

it("counts tracked modules once while excluding nested worktrees, vendors and build-logic declarations", () => {
  const root = mkdtempSync(join(tmpdir(), "owned-build-files-"));
  try {
    execFileSync("git", ["init", "-q", root], { env: gitEnv() });
    for (const file of ["build.gradle.kts", "feature/a/build.gradle.kts", "external/toolkit/build.gradle.kts", "build-logic/convention/build.gradle.kts"]) {
      mkdirSync(join(root, file, ".."), { recursive: true });
      writeFileSync(join(root, file), 'plugins { id("shared.cmp.feature") }');
      execFileSync("git", ["-C", root, "add", file], { env: gitEnv() });
    }
    const nested = join(root, ".worktrees/local-baseline/feature/a/build.gradle.kts");
    mkdirSync(join(nested, ".."), { recursive: true });
    writeFileSync(nested, 'plugins { id("shared.cmp.feature") }');
    expect(ownedBuildFiles(root).map(file => relative(root, file))).toEqual(["build.gradle.kts", "feature/a/build.gradle.kts"]);
    expect(ownedBuildFiles(join(root, "missing"))).toBeNull();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
