import { gitEnv } from "./git-env.mjs";
import { expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { readTwinStats } from "./twin-stats.mjs";

it("counts only owned source and preserves prerelease Gradle versions", () => {
  const dir = mkdtempSync(join(tmpdir(), "twin-stats-"));
  try {
    const write = (file, body) => {
      mkdirSync(join(dir, file, ".."), { recursive: true });
      writeFileSync(join(dir, file), body);
    };
    execFileSync("git", ["init", "-q", dir], { env: gitEnv() });
    write("src/Main.kt", "fun main() {}\n");
    write("src/data/generated/Data.kt", "generated\n");
    execFileSync("git", ["-C", dir, "add", "src"], { env: gitEnv() });
    write("external/toolkit/Other.kt", "not twin source\n");
    write("build/Generated.kt", "not source\n");
    write("gradle/libs.versions.toml", 'kotlin = "2.4.20"\ncompose-multiplatform = "1.13.0-alpha01"\nagp = "9.5.0-alpha06"\n');
    write("gradle/wrapper/gradle-wrapper.properties", "distributionUrl=https://services.gradle.org/distributions/gradle-9.8.0-rc-2-bin.zip\n");
    const root = pathToFileURL(dir + "/");
    expect(readTwinStats(root)).toMatchObject({ kotlinFiles: 1, kotlinLines: 2, gradle: "9.8.0-rc-2" });
    write("gradle/wrapper/gradle-wrapper.properties", "distributionUrl=unknown");
    expect(() => readTwinStats(root)).toThrow("Unrecognized twin Gradle");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
