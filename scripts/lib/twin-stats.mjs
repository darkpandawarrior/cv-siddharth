import { gitEnv } from "./git-env.mjs";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

export function readTwinStats(root) {
  if (!existsSync(root)) return null;
  // Git owns the source boundary: exclude submodules, caches and untracked files.
  const files = execFileSync("git", ["ls-files", "-z", "--", "*.kt"], {
    cwd: root, env: gitEnv(), encoding: "utf8",
  }).split("\0").filter((file) => file && !/(^|\/)(build|data\/generated)\//.test(file));
  const read = (file) => readFileSync(new URL(file, root), "utf8");
  const toml = read("gradle/libs.versions.toml");
  const version = (key) => {
    const value = toml.match(new RegExp(`^${key}\\s*=\\s*"([^"]+)"`, "m"))?.[1];
    if (!value) throw new Error(`[gen-repo-stats] Missing twin version: ${key}`);
    return value;
  };
  const gradle = read("gradle/wrapper/gradle-wrapper.properties")
    .match(/gradle-([0-9][^/\s]*?)-(?:bin|all)\.zip/)?.[1];
  if (!gradle) throw new Error("[gen-repo-stats] Unrecognized twin Gradle distribution");
  return {
    kotlinLines: files.reduce((count, file) => count + read(file).split("\n").length, 0),
    kotlinFiles: files.length,
    kotlin: version("kotlin"),
    compose: version("compose-multiplatform"),
    agp: version("agp"),
    gradle,
  };
}
