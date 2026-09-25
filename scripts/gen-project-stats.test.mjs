import { describe, it, expect, afterEach } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { scanConsumer, firstMonths, scanToolkitModules, adoptionFor, graphUsedBy, readPreviousStats } from "./gen-project-stats.mjs";

const dirs = [];
function tmp(prefix) {
  const d = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop(), { recursive: true, force: true });
});

const SETTINGS_GADDI = `
includeBuild("external/kmp-toolkit") {
    dependencySubstitution {
        substitute(module("com.siddharth.kmp:mvi-core")).using(project(":mvi-core"))
        substitute(module("com.siddharth.kmp:common")).using(project(":common"))
        substitute(module("com.siddharth.kmp:network")).using(project(":network"))
    }
}
`;

describe("scanConsumer", () => {
  it("returns null when no candidate dir has a settings.gradle.kts", () => {
    expect(scanConsumer([join(tmp("gps-"), "nope")])).toBeNull();
  });

  it("extracts substitutedModules and composedModules from settings.gradle.kts", () => {
    const dir = tmp("gps-gaddi-");
    writeFileSync(join(dir, "settings.gradle.kts"), SETTINGS_GADDI);
    const result = scanConsumer([dir]);
    expect(result.substitutedModules).toEqual(["mvi-core", "common", "network"]);
    expect(result.composedModules).toBe(3);
  });

  it("dedupes a module substituted more than once", () => {
    const dir = tmp("gps-dupe-");
    writeFileSync(join(dir, "settings.gradle.kts"), SETTINGS_GADDI + `substitute(module("com.siddharth.kmp:network")).using(project(":network"))\n`);
    expect(scanConsumer([dir]).substitutedModules).toEqual(["mvi-core", "common", "network"]);
  });

  it("picks the first candidate dir that exists (current name before old name)", () => {
    const oldDir = tmp("gps-old-");
    writeFileSync(join(oldDir, "settings.gradle.kts"), SETTINGS_GADDI);
    const missingCurrent = join(tmp("gps-parent-"), "current-name-not-checked-out");
    expect(scanConsumer([missingCurrent, oldDir]).composedModules).toBe(3);
  });
});

describe("firstMonths", () => {
  it("reads the month each substitution was first added, oldest commit wins", () => {
    const dir = tmp("gps-git-");
    const git = (...args) => execFileSync("git", args, { cwd: dir, encoding: "utf8" });
    git("init", "-q", "-b", "main");
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "test");

    writeFileSync(join(dir, "settings.gradle.kts"), `substitute(module("com.siddharth.kmp:common")).using(project(":common"))\n`);
    git("add", "settings.gradle.kts");
    execFileSync("git", ["commit", "-q", "-m", "add common", "--date", "2026-01-15T00:00:00"], {
      cwd: dir,
      env: { ...process.env, GIT_AUTHOR_DATE: "2026-01-15T00:00:00", GIT_COMMITTER_DATE: "2026-01-15T00:00:00" },
    });

    writeFileSync(
      join(dir, "settings.gradle.kts"),
      `substitute(module("com.siddharth.kmp:common")).using(project(":common"))\n` +
        `substitute(module("com.siddharth.kmp:network")).using(project(":network"))\n`,
    );
    git("add", "settings.gradle.kts");
    execFileSync("git", ["commit", "-q", "-m", "add network"], {
      cwd: dir,
      env: { ...process.env, GIT_AUTHOR_DATE: "2026-03-20T00:00:00", GIT_COMMITTER_DATE: "2026-03-20T00:00:00" },
    });

    expect(firstMonths(dir)).toEqual({ common: "2026-01", network: "2026-03" });
  });

  it("returns {} (unmeasured) when the dir has no git history", () => {
    const dir = tmp("gps-nogit-");
    writeFileSync(join(dir, "settings.gradle.kts"), SETTINGS_GADDI);
    expect(firstMonths(dir)).toEqual({});
  });
});

describe("scanToolkitModules", () => {
  it("returns null when kmp-toolkit isn't checked out", () => {
    expect(scanToolkitModules(join(tmp("gps-tk-"), "nope"))).toBeNull();
  });

  it("reads leaf module names, including provider:* ones, deduped", () => {
    const dir = tmp("gps-tk2-");
    writeFileSync(
      join(dir, "settings.gradle.kts"),
      `include(":common")\ninclude(":network")\ninclude(":provider:stripe")\ninclude(":common")\n`,
    );
    expect(scanToolkitModules(dir)).toEqual(["common", "network", "stripe"]);
  });
});

describe("adoptionFor", () => {
  it("prefers this run's local scan over anything committed", () => {
    const localScan = { gaddi: { composedModules: 3, substitutedModules: ["a", "b", "c"] } };
    expect(adoptionFor("gaddi", localScan, {})).toEqual({ composedModules: 3, substitutedModules: ["a", "b", "c"] });
  });

  it("falls back to the committed value when the sibling is absent this run", () => {
    const previousStats = { candidai: { composedModules: 9, substitutedModules: ["x"] } };
    expect(adoptionFor("candidai", {}, previousStats)).toEqual({ composedModules: 9, substitutedModules: ["x"] });
  });

  it("defaults to empty when neither this run nor anything committed has data", () => {
    expect(adoptionFor("candidai", {}, {})).toEqual({ composedModules: 0, substitutedModules: [] });
  });
});

describe("graphUsedBy", () => {
  it("lists every consumer whose local scan substitutes the module, with its first month", () => {
    const localScan = {
      doori: { substitutedModules: ["network"], firstMonth: { network: "2026-01" } },
      gaddi: { substitutedModules: [], firstMonth: {} },
    };
    expect(graphUsedBy("network", ["doori", "gaddi"], localScan, null)).toEqual([{ app: "doori", firstMonth: "2026-01" }]);
  });

  it("falls back to the previous graph's entry for a consumer missing this run", () => {
    const previousGraph = { modules: [{ id: "network", usedBy: [{ app: "gaddi", firstMonth: "2026-02" }] }] };
    expect(graphUsedBy("network", ["gaddi"], {}, previousGraph)).toEqual([{ app: "gaddi", firstMonth: "2026-02" }]);
  });
});

/**
 * End-to-end (spawned, sandboxed the way gen-oss-stats.test.mjs's "gh
 * unavailable" case is): the acceptance line in full — fixture settings
 * files yield the composed counts and substitution lists, and a run with
 * every sibling AND the network absent leaves both output files
 * byte-identical, exit 0.
 */
function scratchRepo() {
  const root = tmp("gen-project-stats-e2e-");
  mkdirSync(join(root, "scripts", "lib"), { recursive: true });
  mkdirSync(join(root, "src", "data"), { recursive: true });
  copyFileSync(new URL("gen-project-stats.mjs", import.meta.url), join(root, "scripts/gen-project-stats.mjs"));
  copyFileSync(new URL("lib/net.mjs", import.meta.url), join(root, "scripts/lib/net.mjs"));
  copyFileSync(new URL("lib/git-env.mjs", import.meta.url), join(root, "scripts/lib/git-env.mjs"));
  return root;
}

const STATS_FIXTURE =
  `export const projectStats = {\n` +
  `  "foundation": { "modules": 43, "providerModules": 20, "conventionPlugins": 18 },\n` +
  `  "doori": { "modules": 36, "composedModules": 13, "features": 13, "cores": 12, "dbVersion": 48, "schemaVersion": 48, "screenshots": 372, "substitutedModules": ["location", "common"] },\n` +
  `  "paymentslab-kmp": { "modules": 17, "composedModules": 29, "providers": 0, "features": 4, "cores": 9, "gatewaysNative": 15, "gatewaysInternal": 1, "gatewaysHosted": 44, "gatewaysMobileMoney": 7, "gatewaysStub": 3, "screenshots": 26, "substitutedModules": ["common"] },\n` +
  `  "gaddi": { "modules": 15, "screenshots": 61, "composedModules": 10, "substitutedModules": ["mvi-core", "common", "network"] },\n` +
  `  "candidai": { "composedModules": 9, "substitutedModules": ["common", "network"] },\n` +
  `  "portfolio": { "composedModules": 3, "substitutedModules": ["network", "result", "llm-chat"] }\n` +
  `} as const;\n` +
  `export const projectStatsGeneratedAt = "2026-09-20";\n`;

describe("gen-project-stats.mjs (spawned, sandboxed)", () => {
  it("network and every local sibling absent: leaves projectStats.ts byte-identical, exit 0", () => {
    const root = scratchRepo();
    const statsPath = join(root, "src/data/projectStats.ts");
    writeFileSync(statsPath, STATS_FIXTURE);

    const result = spawnSync(process.execPath, [join(root, "scripts/gen-project-stats.mjs")], {
      env: {
        ...process.env,
        GEN_PROJECT_STATS_FAIL: "1",
        CV_REPOS_ROOT: join(root, "no-such-repos-root"),
        CV_SIDDHARTH_KMP_ROOT: join(root, "no-such-twin"),
        CV_KMP_TOOLKIT_ROOT: join(root, "no-such-toolkit"),
      },
      encoding: "utf8",
      timeout: 15000,
    });

    expect(result.status).toBe(0);
    expect(readFileSync(statsPath, "utf8")).toBe(STATS_FIXTURE);
  }, 20000);

  it("fixture settings files (network absent): yields composed counts and substitution lists", () => {
    const root = scratchRepo();
    writeFileSync(join(root, "src/data/projectStats.ts"), STATS_FIXTURE);

    const android = join(root, "repos-root", "Android");
    mkdirSync(join(android, "Gaddi"), { recursive: true });
    mkdirSync(join(android, "HireSignal"), { recursive: true });
    writeFileSync(join(android, "Gaddi", "settings.gradle.kts"), SETTINGS_GADDI);
    writeFileSync(
      join(android, "HireSignal", "settings.gradle.kts"),
      `substitute(module("com.siddharth.kmp:common")).using(project(":common"))\n` +
        `substitute(module("com.siddharth.kmp:security")).using(project(":security"))\n`,
    );
    const twin = join(root, "twin");
    mkdirSync(twin, { recursive: true });
    writeFileSync(twin + "/settings.gradle.kts", `substitute(module("com.siddharth.kmp:network")).using(project(":network"))\n`);

    const result = spawnSync(process.execPath, [join(root, "scripts/gen-project-stats.mjs")], {
      env: {
        ...process.env,
        GEN_PROJECT_STATS_FAIL: "1",
        CV_REPOS_ROOT: join(root, "repos-root"),
        CV_SIDDHARTH_KMP_ROOT: twin,
        CV_KMP_TOOLKIT_ROOT: join(root, "no-such-toolkit"),
      },
      encoding: "utf8",
      timeout: 15000,
    });

    expect(result.status).toBe(0);
    const written = readPreviousStats(join(root, "src/data/projectStats.ts"));
    expect(written.gaddi.composedModules).toBe(3);
    expect(written.gaddi.substitutedModules).toEqual(["mvi-core", "common", "network"]);
    expect(written.candidai.composedModules).toBe(2);
    expect(written.candidai.substitutedModules).toEqual(["common", "security"]);
    expect(written.portfolio.substitutedModules).toEqual(["network"]);
    // Network was forced to fail — doori/paymentslab's network-only fields
    // are untouched from the fixture.
    expect(written.doori.dbVersion).toBe(48);
  }, 20000);
});
