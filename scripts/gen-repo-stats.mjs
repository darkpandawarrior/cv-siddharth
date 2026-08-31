/**
 * Writes src/data/repoStats.ts — how many tests this repo has, and in how many
 * files.
 *
 * The homepage carries that pair as a metric about this site. It used to be
 * two hand-typed numbers refreshed by remembering to run vitest and read the
 * summary, which is exactly the ritual that lets a figure rot: the site said
 * 619 tests in 46 files while the suite had grown to 803 in 71.
 *
 * `vitest list` enumerates the suite WITHOUT running it, so this is cheap
 * enough to sit in prebuild next to the other generators. Counting the array
 * it returns is the same count the runner reports, because it is the same
 * collection step.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const OUT = new URL("../src/data/repoStats.ts", import.meta.url);

/**
 * The Compose twin's figures, and why they live in a GENERATOR rather than in
 * the prose that quotes them.
 *
 * profile.ts used to carry these as literals under a comment listing the shell
 * commands to re-derive them by hand. That comment also recorded why the test
 * counts had already been taken off that list: "a documented manual step is
 * still a hand-kept number", and the numbers had drifted to 619/46 against an
 * actual 777/67 before anyone noticed.
 *
 * The twin's figures then did exactly the same thing. Measured 2026-09-01, the
 * page was claiming 16,180 lines across 44 files against a real 31,479 across
 * 63, and naming four toolchain versions that had all moved on. Same ritual,
 * same outcome, one release later.
 *
 * GENERATED KOTLIN IS EXCLUDED from the line and file counts. data/generated/ is
 * emitted by gen-kotlin-data.mjs, so counting it would inflate a claim about
 * what he wrote with 8,641 lines a script produced.
 *
 * Graceful skip when the twin is not checked out, the same contract
 * gen-images.mjs uses for a missing ffmpeg: the previous values are kept rather
 * than zeroed, because a missing sibling repo is not evidence that a public
 * number is wrong.
 */
const KMP = new URL("../../cv-siddharth-kmp/", import.meta.url);

const twinStats = () => {
  if (!existsSync(KMP)) return null;
  const kt = execFileSync(
    "find",
    [".", "-name", "*.kt", "-not", "-path", "*/build/*", "-not", "-path", "*/data/generated/*"],
    { cwd: KMP, encoding: "utf8" },
  )
    .split("\n")
    .filter(Boolean);
  const lines = kt.reduce((n, f) => n + readFileSync(new URL(f.replace(/^\.\//, ""), KMP), "utf8").split("\n").length, 0);

  const toml = readFileSync(new URL("gradle/libs.versions.toml", KMP), "utf8");
  const v = (k) => toml.match(new RegExp(`^${k}\\s*=\\s*"([^"]+)"`, "m"))?.[1] ?? null;
  const gradle = readFileSync(new URL("gradle/wrapper/gradle-wrapper.properties", KMP), "utf8")
    .match(/gradle-([0-9][^-]*?)-bin/)?.[1] ?? null;

  return {
    kotlinLines: lines,
    kotlinFiles: kt.length,
    kotlin: v("kotlin"),
    compose: v("compose-multiplatform"),
    agp: v("agp"),
    gradle,
  };
};

/** What the file says today, so a bad run can decline to make things worse. */
const previous = (() => {
  try {
    const src = readFileSync(OUT, "utf8");
    const n = (k) => Number(src.match(new RegExp(`"${k}":\\s*(\\d+)`))?.[1] ?? 0);
    return { tests: n("tests"), testFiles: n("testFiles"), src };
  } catch {
    return { tests: 0, testFiles: 0, src: "" };
  }
})();

let listed;
try {
  listed = JSON.parse(
    execFileSync("npx", ["vitest", "list", "--json"], {
      cwd: new URL("..", import.meta.url),
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    }),
  );
} catch (err) {
  console.error(`[gen-repo-stats] vitest list failed, keeping committed counts: ${err.message}`);
  process.exit(0);
}

const tests = listed.length;
const testFiles = new Set(listed.map((t) => t.file)).size;

/*
 * The guard every generator here carries. A suite that fails to collect (a
 * syntax error in one file, a config that resolves nothing) reports a SMALLER
 * number rather than an error, and writing that would quietly shrink a public
 * claim about this repo. Growth is written; shrinkage has to be deliberate, so
 * it is reported and refused. Delete src/data/repoStats.ts to force a reset
 * after genuinely removing tests.
 */
if (tests < previous.tests || testFiles < previous.testFiles) {
  console.error(
    `[gen-repo-stats] collected ${tests} tests in ${testFiles} files, but ${OUT.pathname.split("/").pop()} ` +
      `says ${previous.tests}/${previous.testFiles}. Refusing to shrink a committed count. ` +
      `If tests were really removed, delete the file and re-run.`,
  );
  process.exit(0);
}

const twin = twinStats();

/*
 * A twin that is not checked out keeps whatever the committed file already says,
 * rather than dropping the fields and taking four public numbers off the page
 * with it. Same reasoning as the shrink guard above: absence of evidence is not
 * evidence that a published figure is wrong.
 */
const twinBlock = twin
  ? `,
  "kotlinLines": ${twin.kotlinLines},
  "kotlinFiles": ${twin.kotlinFiles},
  "kotlin": "${twin.kotlin}",
  "compose": "${twin.compose}",
  "agp": "${twin.agp}",
  "gradle": "${twin.gradle}"`
  : (previous.src.match(/,\n\s*"kotlinLines"[\s\S]*?"gradle":\s*"[^"]*"/)?.[0] ?? "");

if (!twin) console.log("[gen-repo-stats] twin not checked out, keeping its committed figures.");

writeFileSync(
  OUT,
  `// AUTO-GENERATED by scripts/gen-repo-stats.mjs — do not edit by hand.
// Collected with \`vitest list\`, which enumerates the suite without running it.
// Run \`npm run gen:repo-stats\` to refresh.
export const repoStats = {
  "tests": ${tests},
  "testFiles": ${testFiles}${twinBlock}
} as const;
`,
);
console.log(`[gen-repo-stats] ${tests} tests across ${testFiles} files`);
