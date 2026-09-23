import { gitEnv } from "./git-env.mjs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

/** Only a repository's tracked modules; nested worktrees and vendors are not consumers. */
export function ownedBuildFiles(dir) {
  try {
    return execFileSync("git", ["ls-files", "-z", "--", "*build.gradle.kts"], {
      cwd: dir, env: gitEnv(), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
    }).split("\0").filter(Boolean)
      .filter(file => file.split("/").at(-1) === "build.gradle.kts")
      .filter(file => !file.split("/").some(part => ["external", "build-logic", ".worktrees", "node_modules", "build", ".gradle"].includes(part)))
      .map(file => join(dir, file));
  } catch {
    return null; // An unavailable checkout cannot honestly report zero consumers.
  }
}
