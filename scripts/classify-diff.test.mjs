import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Fixture-git-repo pattern from vercel-ignore.test.mjs / check-freshness.test.mjs.
// Runs the real script as a subprocess (never a reimplementation), in a
// throwaway repo, so the exit codes stay honest to what the refresh workflow
// actually runs. The script imports the REAL scripts/generators.mjs (a path
// relative to the script's own location, not the fixture cwd), so fixtures
// below use paths that are real declared outputs there.

const SCRIPT = new URL("./classify-diff.mjs", import.meta.url).pathname;

let dir;

function git(...args) {
  return execFileSync("git", args, { cwd: dir, encoding: "utf8" });
}

function commit(files, message) {
  for (const [path, content] of Object.entries(files)) {
    const full = join(dir, path);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content);
  }
  git("add", "-A");
  git("-c", "user.email=t@t.com", "-c", "user.name=t", "commit", "-m", message);
  return git("rev-parse", "HEAD").trim();
}

function run(base) {
  try {
    execFileSync("node", [SCRIPT, base], { cwd: dir, encoding: "utf8" });
    return 0;
  } catch (e) {
    return e.status;
  }
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "classify-diff-"));
  git("init", "-q");
  commit({ "README.md": "init" }, "init");
  git("branch", "origin/main"); // classify-diff diffs against this by default
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("classify-diff", () => {
  it("exits 0 for a data-only diff (a declared generator output, no collapse)", () => {
    commit({ "src/data/store.ts": "export const STORE = [{ id: 1 }, { id: 2 }];\n" }, "data");
    expect(run("origin/main")).toBe(0);
  });

  it("exits 1 for a diff touching a non-generated file", () => {
    commit({ "src/world/v2/Water.tsx": "export const Water = () => null;\n" }, "code");
    expect(run("origin/main")).toBe(1);
  });

  it("exits 1 when a declared output shrinks from 40KB to 2KB", () => {
    commit({ "src/data/store.ts": `export const STORE = "${"x".repeat(40 * 1024)}";\n` }, "big");
    git("branch", "-f", "origin/main");
    commit({ "src/data/store.ts": `export const STORE = "${"x".repeat(2 * 1024)}";\n` }, "shrunk");
    expect(run("origin/main")).toBe(1);
  });

  it("exits 0 for the declared generated src/labs/FanoutLab.tsx", () => {
    commit({ "src/labs/FanoutLab.tsx": "export default function FanoutLab() { return null; }\n" }, "lab");
    expect(run("origin/main")).toBe(0);
  });
});
