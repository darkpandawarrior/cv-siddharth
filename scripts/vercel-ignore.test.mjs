import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Fixture-git-repo pattern from check-old-names.test.mjs / check-freshness.test.mjs.
// Exercises the real script (a subprocess, not a reimplementation) against a
// throwaway repo so the exit codes stay honest to what Vercel actually runs.

const SCRIPT = new URL("./vercel-ignore.sh", import.meta.url).pathname;

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

function run(ref, prev) {
  const env = { ...process.env, VERCEL_GIT_COMMIT_REF: ref };
  if (prev === undefined) delete env.VERCEL_GIT_PREVIOUS_SHA;
  else env.VERCEL_GIT_PREVIOUS_SHA = prev;
  try {
    execFileSync("bash", [SCRIPT], { cwd: dir, env, encoding: "utf8" });
    return 0;
  } catch (e) {
    return e.status;
  }
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "vercel-ignore-"));
  git("init", "-q");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("vercel-ignore.sh", () => {
  it("exits 0 (skip) for a docs-only diff on main", () => {
    // Nested, not top-level: the pathspec `**/*.md` (no :(glob) magic, as
    // written in self-healing-spec.md#2.4 B) only matches a file under a
    // directory, not a bare README.md at repo root.
    const a = commit({ "notes/CHANGELOG.md": "v1" }, "init");
    const b = commit({ "notes/CHANGELOG.md": "v2" }, "docs");
    expect(run("main", a)).toBe(0);
    void b;
  });

  it("exits 1 (build) for a src/data diff on main", () => {
    const a = commit({ "src/data/store.ts": "v1" }, "init");
    const b = commit({ "src/data/store.ts": "v2" }, "data");
    expect(run("main", a)).toBe(1);
    void b;
  });

  it("exits 1 (build) when VERCEL_GIT_PREVIOUS_SHA is missing (shallow clone, fail open)", () => {
    commit({ "README.md": "v1" }, "init");
    expect(run("main", undefined)).toBe(1);
  });

  it("exits 0 (skip) for any ref other than main, even a src/data diff", () => {
    const a = commit({ "src/data/store.ts": "v1" }, "init");
    commit({ "src/data/store.ts": "v2" }, "data");
    expect(run("lane/SH-3", a)).toBe(0);
  });

  it("exits 1 (build) when PREV is not a reachable commit (shallow clone, fail open)", () => {
    commit({ "README.md": "v1" }, "init");
    expect(run("main", "0".repeat(40))).toBe(1);
  });
});
