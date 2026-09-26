#!/usr/bin/env node
// The drift doctor: daily heal-or-escalate over five checks.
// self-healing-spec.md#4 (drift doctor, the old-name guard, idempotence and
// noise rules), master-plan.md#M62 (track placement), #M63 (check-old-names
// stays extended, never re-created), #M65 (TWIN_PR_TOKEN reuses the existing
// PAGES_DEPLOY_TOKEN credential, nothing new minted), #M70 (archive review-by).
//
// SHAPE. Five checks, each PURE-planned from already-gathered state
// (planGenerated / planTwinGenerated / planFreshness / planOldNames /
// planArchive below) and then, only in main(), turned into a real branch+PR
// or a real `gh issue` — the split is deliberate: doctor.test.mjs exercises
// the planning functions directly with synthetic fixtures (no network, no
// git, no gh), which is what makes "same input -> same plan, twice" checkable
// without spinning up a real repo per test.
//
// IDEMPOTENCE / NOISE (self-healing-spec.md#4): one branch per check
// (`bot/doctor-<check>`, except the twin's own `bot/generated-sync`), one
// issue title per check (`report-gate-failure.sh`-style: search-then-comment,
// never pile up duplicates), a healed check closes its issue linking the
// merged PR, and a green day produces zero commits/issues/notifications.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname, matchesGlob } from "node:path";
import { fileURLToPath } from "node:url";
import { dirtyState } from "./lib/generated-state.mjs";
import { gitEnv } from "./lib/git-env.mjs";
import { GENERATORS, CHECK_DETERMINISTIC } from "./generators.mjs";
import { scan as scanOldNames } from "./check-old-names.mjs";

export const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const KMP = join(root, "..", "cv-siddharth-kmp");

// ─────────────────────────── pure planning ────────────────────────────────
// Every planX below is a function of its arguments ONLY: no fs/git/gh calls,
// so doctor.test.mjs can assert the exact plan a given state produces, twice,
// with nothing between the two calls that could make them disagree.

/** check:generated, site side. dirtyPaths: paths CHECK_DETERMINISTIC left
 *  dirty in the working tree (dirtyState(root) after running them). */
export function planGenerated(dirtyPaths) {
  if (!dirtyPaths.length) return null;
  return { check: "generated", branch: "bot/doctor-generated", detail: dirtyPaths };
}

/** check:generated, twin side (CvOpsData.kt drift). dirtyPaths: what running
 *  gen:kotlin left dirty in the twin checkout; tokenPresent: whether
 *  TWIN_PR_TOKEN is set (M65 — its absence downgrades this to dry-run-only,
 *  never a failure: the site half must still ship). */
export function planTwinGenerated(dirtyPaths, tokenPresent) {
  if (!dirtyPaths.length) return null;
  return {
    check: "generated-twin",
    branch: "bot/generated-sync",
    repo: "cv-siddharth-kmp",
    dryRunOnly: !tokenPresent,
    detail: dirtyPaths,
  };
}

/** check:freshness, for ONE file already known to have breached its SLA.
 *  healResult: { regenerated: boolean, stillStale: boolean } — the result of
 *  attempting that file's own generator (found through generators.mjs
 *  outputs) and re-reading check-freshness. A successful regen folds into
 *  the SAME deterministic-drift branch as planGenerated (it is, mechanically,
 *  the same action: a generator ran, its output changed, the diff needs a
 *  PR) — self-healing-spec.md#4 calls this "the SH-12 path". A regen that
 *  still leaves the file stale (the generator itself is broken, or the
 *  source it reads is down) escalates instead. */
export function planFreshness(file, healResult) {
  if (healResult.stillStale) {
    return { check: "freshness", title: `ops: ${file} past SLA`, detail: healResult };
  }
  if (healResult.regenerated) {
    return { check: "freshness", branch: "bot/doctor-generated", detail: { file, ...healResult } };
  }
  return null;
}

/** check:old-names. hits: check-old-names.mjs's findHits() shape
 *  ({file, lineNo, text, name}[]). isGeneratedOutput(file): whether that file
 *  is a declared generator output — a hit there is fixed by regenerating (its
 *  generator already keys on current slugs, so re-running it removes the old
 *  name); a hit in hand-written source or prose is a judgement call and
 *  escalates with file:line so a human can look, per self-healing-spec.md#4. */
export function planOldNames(hits, isGeneratedOutput) {
  const generated = hits.filter((h) => isGeneratedOutput(h.file));
  const handWritten = hits.filter((h) => !isGeneratedOutput(h.file));
  const plans = [];
  if (generated.length) {
    plans.push({ check: "old-names-generated", branch: "bot/doctor-old-names", detail: generated });
  }
  if (handWritten.length) {
    plans.push({
      check: "old-names",
      title: "old-names: hand-written old-name hit(s)",
      detail: handWritten.map((h) => `${h.file}:${h.lineNo}: ${h.name}`),
    });
  }
  return plans;
}

/** archive review-by. rows: src/archive/registry.ts's ARCHIVE; today:
 *  'YYYY-MM-DD'. One issue per stale row (each title already unique, so
 *  report-gate-failure.sh-style search-then-comment dedupes per row, not
 *  per check-run) — never compares reviewBy at build time (registry.test.ts
 *  deliberately does not, master-plan.md#M62's store.ts lesson), only here. */
export function planArchive(rows, today) {
  return rows
    .filter((r) => r.reviewBy < today)
    .map((r) => ({
      check: "archive",
      title: `archive: ${r.id} past review-by`,
      detail: `ARCHIVE.md#${r.id} — reviewBy ${r.reviewBy}, today ${today}`,
    }));
}

/** Is `file` a declared output of some generator (exact path or glob)? */
export function isGeneratorOutput(file) {
  return GENERATORS.some((g) => g.outputs.some((glob) => matchesGlob(file, glob)));
}

/** Which generator script writes `file` (declared output match), or null. */
export function generatorForOutput(file) {
  const g = GENERATORS.find((g) => g.outputs.some((glob) => matchesGlob(file, glob)));
  return g ? g.script : null;
}

// ─────────────────────── fixtures (runner checkout only) ──────────────────
// Applied to the WORKING TREE only, never committed — doctor.yml's inputs.
// Each mutates exactly what its own check looks at, so the other four stay
// clean and the smoke test proves one check at a time (G19).
const FIXTURES = {
  "dirty-output": () => {
    // Nudge a deterministic generator's committed output out of sync with
    // its generator, the same shape check-generated.mjs itself guards.
    const target = join(root, "src/data/galleries.ts");
    appendFixtureComment(target, "// doctor fixture: dirty-output");
  },
  "backdated-stamp": () => {
    // freshnessSla.ts's STAMP_RE reads `generatedAt`/`*GeneratedAt`; back it
    // 60 days so check:freshness reports a breach without touching the real
    // generator (H0's own acceptance bar: "a stamp backdated 60 days" fires
    // the alarm — this fixture proves the doctor sees the same alarm).
    const target = join(root, "src/data/chess.ts");
    const src = readFileSync(target, "utf8");
    const stamped = src.replace(
      /"generatedAt":\s*"\d{4}-\d{2}-\d{2}"/,
      `"generatedAt": "${daysAgo(60)}"`,
    );
    if (stamped !== src) writeFileSyncQuiet(target, stamped);
  },
  "old-name-in-prose": () => {
    const target = join(root, "docs/perf-budgets.md.doctor-fixture.md");
    writeFileSyncQuiet(target, "Fixture: the Mileway team ships this doc.\n"); // old-name:allow — bait for the check itself
  },
  "archive-past-review": () => {
    // Fixture registry copy: registry.ts stays untouched on disk (a real
    // edit there would violate ownership, G2); the doctor reads this file
    // INSTEAD of the real registry only when it exists.
    const target = join(root, "src/archive/registry.doctor-fixture.json");
    writeFileSyncQuiet(
      target,
      JSON.stringify([{ id: "fixture-past-due", reviewBy: daysAgo(1) }], null, 2),
    );
  },
  none: () => {},
};

function daysAgo(n) {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
}

function appendFixtureComment(file, comment) {
  const src = readFileSync(file, "utf8");
  writeFileSyncQuiet(file, src.trimEnd() + `\n${comment}\n`);
}

function writeFileSyncQuiet(file, content) {
  writeFileSync(file, content);
}

function cleanupFixtures() {
  execFileSync("git", ["-C", root, "checkout", "--", "src/data/galleries.ts", "src/data/chess.ts"], {
    env: gitEnv(),
    stdio: "ignore",
  });
  for (const f of ["docs/perf-budgets.md.doctor-fixture.md", "src/archive/registry.doctor-fixture.json"]) {
    const full = join(root, f);
    if (existsSync(full)) execFileSync("rm", [full]);
  }
}

// ────────────────────────── real state gathering ───────────────────────────

function runDeterministicGenerators() {
  for (const script of CHECK_DETERMINISTIC) {
    try {
      execFileSync("node", [join(root, "scripts", script)], { stdio: "ignore" });
    } catch {
      // A generator's own refusal to write bad data (G13) is not this
      // check's failure to report — dirtyState below only sees what it DID
      // write; an unwritten file just stays out of the drift set.
    }
  }
}

function gatherGeneratedPlan() {
  const before = dirtyState(root);
  runDeterministicGenerators();
  const after = dirtyState(root);
  const dirty = [...new Set([...before.keys(), ...after.keys()])].filter((p) => before.get(p) !== after.get(p));
  return planGenerated(dirty);
}

function gatherTwinPlan(tokenPresent) {
  if (!existsSync(KMP)) return null;
  const before = dirtyState(KMP);
  try {
    execFileSync("node", [join(root, "scripts/gen-kotlin-data.mjs")], { stdio: "ignore" });
  } catch {
    return null; // the generator's own failure is check:generated's site-side concern, not the twin heal
  }
  const after = dirtyState(KMP);
  const dirty = [...new Set([...before.keys(), ...after.keys()])].filter((p) => before.get(p) !== after.get(p));
  return planTwinGenerated(dirty, tokenPresent);
}

function readFreshnessBreaches() {
  try {
    const out = execFileSync("node", [join(root, "scripts/check-freshness.mjs"), "--json"], { encoding: "utf8" });
    return JSON.parse(out).filter((r) => !r.ok);
  } catch (e) {
    // check-freshness.mjs prints JSON to stdout even when it exits 1
    // (breaches exist) — e.stdout carries it.
    try {
      return JSON.parse(e.stdout).filter((r) => !r.ok);
    } catch {
      return [];
    }
  }
}

function gatherFreshnessPlans() {
  const breaches = readFreshnessBreaches();
  const plans = [];
  for (const r of breaches) {
    const script = generatorForOutput(`src/data/${r.file}`);
    let regenerated = false;
    if (script) {
      try {
        execFileSync("node", [join(root, "scripts", script)], { stdio: "ignore" });
        regenerated = true;
      } catch {
        regenerated = false;
      }
    }
    const after = regenerated ? readFreshnessBreaches() : breaches;
    const stillStale = after.some((r2) => r2.file === r.file);
    const plan = planFreshness(r.file, { regenerated, stillStale });
    if (plan) plans.push(plan);
  }
  return plans;
}

function gatherOldNamesPlans() {
  const tracked = execFileSync("git", ["-C", root, "ls-files"], { encoding: "utf8" }).split("\n").filter(Boolean);
  // check-old-names.mjs's own scan() only sees git-tracked files by design
  // (a fresh untracked file is nobody's prose yet); the old-name-in-prose
  // fixture above writes one on purpose, so it is added explicitly here —
  // real, committed doctor runs never have an extra untracked file lying
  // around, so this is a no-op outside the fixture.
  const fixturePath = "docs/perf-budgets.md.doctor-fixture.md";
  const files = existsSync(join(root, fixturePath)) ? [...tracked, fixturePath] : tracked;
  const hits = scanOldNames(files);
  return planOldNames(hits, isGeneratorOutput);
}

function readArchiveRows() {
  const fixture = join(root, "src/archive/registry.doctor-fixture.json");
  if (existsSync(fixture)) return JSON.parse(readFileSync(fixture, "utf8"));
  // Real registry.ts is erasable-TypeScript-only (no build step needed) —
  // Node's --experimental-strip-types reads it directly, same contract
  // scripts/*.mjs already rely on elsewhere in this repo.
  return import(join(root, "src/archive/registry.ts")).then((m) => m.ARCHIVE);
}

async function gatherArchivePlans() {
  const rows = await readArchiveRows();
  return planArchive(rows, new Date().toISOString().slice(0, 10));
}

// ────────────────────────────── heal execution ─────────────────────────────
// Only reached when --dry-run is NOT set. Mirrors refresh-media.yml's
// classify-diff + PR pattern for the site-side branches; the twin PR uses
// TWIN_PR_TOKEN (M65) and never carries a Co-Authored-By trailer.

function openOrUpdateIssue(title, body) {
  const existing = execFileSync(
    "gh",
    ["issue", "list", "--repo", "darkpandawarrior/cv-siddharth", "--state", "open", "--search", `in:title "${title}"`, "--json", "number", "--jq", ".[0].number // empty"],
    { encoding: "utf8" },
  ).trim();
  if (existing) {
    execFileSync("gh", ["issue", "comment", existing, "--repo", "darkpandawarrior/cv-siddharth", "--body", body]);
  } else {
    execFileSync("gh", ["issue", "create", "--repo", "darkpandawarrior/cv-siddharth", "--title", title, "--body", body]);
  }
}

function closeIssueIfOpen(title, prUrl) {
  const existing = execFileSync(
    "gh",
    ["issue", "list", "--repo", "darkpandawarrior/cv-siddharth", "--state", "open", "--search", `in:title "${title}"`, "--json", "number", "--jq", ".[0].number // empty"],
    { encoding: "utf8" },
  ).trim();
  if (existing) {
    execFileSync("gh", [
      "issue", "close", existing, "--repo", "darkpandawarrior/cv-siddharth",
      "--comment", `Healed: ${prUrl}`,
    ]);
  }
}

function openDoctorPr(branch, paths, title, body) {
  execFileSync("git", ["-C", root, "checkout", "-B", branch], { env: gitEnv() });
  execFileSync("git", ["-C", root, "add", ...paths], { env: gitEnv() });
  execFileSync("git", ["-C", root, "-c", "user.name=github-actions[bot]", "-c", "user.email=41898282+github-actions[bot]@users.noreply.github.com", "commit", "-m", title], { env: gitEnv() });
  execFileSync("git", ["-C", root, "push", "-f", "origin", branch], { env: gitEnv() });
  const prUrl = execFileSync("gh", ["pr", "create", "--repo", "darkpandawarrior/cv-siddharth", "--head", branch, "--title", title, "--body", body, "--label", "data-refresh"], { encoding: "utf8" }).trim();
  execFileSync("gh", ["pr", "merge", "--repo", "darkpandawarrior/cv-siddharth", "--squash", "--delete-branch", branch]);
  execFileSync("git", ["-C", root, "checkout", "main"], { env: gitEnv() });
  return prUrl;
}

function openTwinPr(branch, title, body) {
  const token = process.env.TWIN_PR_TOKEN;
  if (!token) return { opened: false, reason: "TWIN_PR_TOKEN not set (M65) — twin half stays dry-run" };
  execFileSync("git", ["-C", KMP, "checkout", "-B", branch], { env: gitEnv() });
  execFileSync("git", ["-C", KMP, "add", "-A"], { env: gitEnv() });
  // No Co-Authored-By: kmp-family repos block the trailer (feedback_kmp_family_no_ai_attribution).
  execFileSync("git", ["-C", KMP, "-c", "user.name=github-actions[bot]", "-c", "user.email=41898282+github-actions[bot]@users.noreply.github.com", "commit", "-m", title], { env: gitEnv() });
  execFileSync("git", ["-C", KMP, "push", "-f", `https://x-access-token:${token}@github.com/darkpandawarrior/cv-siddharth-kmp.git`, branch], { env: gitEnv() });
  const prUrl = execFileSync("gh", ["pr", "create", "--repo", "darkpandawarrior/cv-siddharth-kmp", "--head", branch, "--title", title, "--body", body], { encoding: "utf8", env: { ...process.env, GH_TOKEN: token } }).trim();
  execFileSync("gh", ["pr", "merge", "--repo", "darkpandawarrior/cv-siddharth-kmp", "--auto", "--squash", prUrl], { env: { ...process.env, GH_TOKEN: token } });
  return { opened: true, prUrl };
}

// ─────────────────────────────────── main ──────────────────────────────────

async function plan(fixtureName) {
  (FIXTURES[fixtureName] ?? FIXTURES.none)();
  const results = [];
  const generated = gatherGeneratedPlan();
  if (generated) results.push(generated);
  const twin = gatherTwinPlan(Boolean(process.env.TWIN_PR_TOKEN));
  if (twin) results.push(twin);
  results.push(...gatherFreshnessPlans());
  results.push(...gatherOldNamesPlans());
  results.push(...(await gatherArchivePlans()));
  return results;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run") || args.includes("--dry_run");
  const fixtureIdx = args.indexOf("--fixture");
  const fixtureName = fixtureIdx >= 0 ? args[fixtureIdx + 1] : "none";
  // A fixture always forces dry_run (doctor.yml's own contract): nothing a
  // fixture invents may ever open a real PR or issue.
  const forcedDryRun = dryRun || fixtureName !== "none";

  try {
    const results = await plan(fixtureName);
    if (!results.length) {
      console.log("doctor: all five checks clean, nothing to do.");
      return;
    }
    for (const r of results) {
      const action = r.branch ? `branch:${r.branch}${r.dryRunOnly ? " (dry-run only, no token)" : ""}` : `issue:${r.title}`;
      console.log(`doctor: [${r.check}] planned: ${action}`);
      if (forcedDryRun) continue;

      if (r.check === "generated" || r.check === "old-names-generated") {
        const prUrl = openDoctorPr(r.branch, r.detail, `chore: doctor heals ${r.check}`, `Automated by doctor.yml.\n\n${JSON.stringify(r.detail, null, 2)}`);
        console.log(`doctor: [${r.check}] healed: ${prUrl}`);
      } else if (r.check === "generated-twin") {
        if (r.dryRunOnly) {
          console.log(`doctor: [${r.check}] TWIN_PR_TOKEN absent, staying dry-run (M65 — record OD-TWIN-TOKEN)`);
        } else {
          const res = openTwinPr(r.branch, "chore: sync generated Kotlin data", "Automated by doctor.yml (cv-siddharth's doctor).");
          if (res.opened) console.log(`doctor: [${r.check}] opened: ${res.prUrl} (auto-merge on green CI)`);
        }
      } else if (r.check === "freshness") {
        if (r.branch) {
          const prUrl = openDoctorPr(r.branch, [`src/data/${r.detail.file}`], `chore: doctor heals freshness for ${r.detail.file}`, "Automated by doctor.yml.");
          closeIssueIfOpen(`ops: ${r.detail.file} past SLA`, prUrl);
        } else {
          openOrUpdateIssue(r.title, `Its generator could not restamp it — see the run log. See self-healing-spec.md#2.2.`);
        }
      } else if (r.check === "old-names") {
        openOrUpdateIssue(r.title, r.detail.join("\n"));
      } else if (r.check === "archive") {
        openOrUpdateIssue(r.title, r.detail);
      }
    }
  } finally {
    if (fixtureName !== "none") cleanupFixtures();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
