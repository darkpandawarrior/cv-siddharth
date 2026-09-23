import { gitEnv } from "./git-env.mjs";
import { it, expect } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { dirtyState } from "./generated-state.mjs";

it("detects a second rewrite of an already dirty artifact", () => {
  const dir = mkdtempSync(join(tmpdir(), "generated-state-"));
  const git = (...args) => execFileSync("git", ["-C", dir, ...args], { stdio: "ignore", env: gitEnv() });
  try {
    git("init");
    writeFileSync(join(dir, "artifact.txt"), "committed");
    git("add", "artifact.txt");
    git("-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "fixture");
    writeFileSync(join(dir, "artifact.txt"), "dirty");
    const before = dirtyState(dir);
    writeFileSync(join(dir, "artifact.txt"), "regenerated");
    expect(dirtyState(dir).get("artifact.txt")).not.toBe(before.get("artifact.txt"));
    expect(dirtyState(dir)).toEqual(dirtyState(dir));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
