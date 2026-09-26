import { gitEnv } from "./git-env.mjs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

// Status letters alone miss a generator rewriting an already modified file.
export function dirtyState(dir) {
  const changed = execFileSync("git", ["-C", dir, "diff", "HEAD", "--name-only", "-z"], { encoding: "utf8", env: gitEnv() });
  const untracked = execFileSync("git", ["-C", dir, "ls-files", "--others", "--exclude-standard", "-z"], { encoding: "utf8", env: gitEnv() });
  return new Map([...new Set((changed + untracked).split("\0").filter(Boolean))].map((path) => {
    const full = join(dir, path);
    if (!existsSync(full)) return [path, "deleted"];
    const bytes = statSync(full).isDirectory()
      ? execFileSync("git", ["-C", dir, "diff", "HEAD", "--submodule=diff", "--", path], { env: gitEnv() })
      : readFileSync(full);
    return [path, createHash("sha256").update(bytes).digest("hex")];
  }));
}
