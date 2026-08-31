// Fails when a committed generated artifact disagrees with the generator that
// writes it.
//
// WHY THIS EXISTS. On 2026-08-31 the chess-panes work landed a generated
// CvChessData.kt in cv-siddharth-kmp while the gen-kotlin-data.mjs change that
// produces it stayed uncommitted here. Both repos' CI was green. Anyone running
// prebuild on a fresh checkout would have regenerated that file without the
// fields the Compose screen reads:
//
//   node scripts/gen-kotlin-data.mjs   -> 12 files, 1 changed
//   ./gradlew :cmp-shared:compileKotlinJvm -> 159 errors
//
// Nothing could see it, because no gate in either repo runs the other repo's
// build, and a stale artifact compiles perfectly until the day it does not.
//
// WHAT IS AND IS NOT LISTED HERE. Only generators that are BYTE-DETERMINISTIC:
// same committed inputs, same bytes out, every run. Those must never drift, so
// a diff is a defect and this fails.
//
// Generators reading a live source (the chess APIs, the Play Store sweep, git
// commit counts) legitimately produce different bytes every run and are NOT
// listed. Their staleness is a different question with a different answer
// already in the repo: a dated stamp and a per-file deadline in
// freshnessSla.ts, tuned to how fast each source actually moves.
//
// Two are deliberately absent despite deriving from committed inputs:
//   gen-project-heroes.mjs re-encodes PNGs and the encoder is not byte-stable,
//     so all eight heroes differ on a second run from identical pixels.
//   gen-store-flavours.mjs refuses to run without SHELF_RIDER_REPO and
//     SHELF_DRIVER_REPO pointing at two private checkouts, so it cannot run on
//     a CI box at all. It looked deterministic only because an early version of
//     this check swallowed its exit code.
//
// Adding a generator forces the choice: deterministic goes here, live gets an
// SLA entry. Neither is a default, which is the point.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const KMP = join(root, "..", "cv-siddharth-kmp");

// ORDER IS LOAD-BEARING, and this list got it wrong on its first run. These
// generators are not independent: gen-kotlin-data reads the corpora the others
// write, so running it first emits Kotlin from a stale source and the check then
// fails on an artifact it just produced itself. package.json's prebuild already
// encodes the right order and this mirrors it: corpora first, the cross-repo
// emitter last.
const DETERMINISTIC = [
  "gen-galleries.mjs",
  "gen-compare-sets.mjs",
  "gen-ops.mjs",
  // Added 2026-09-01 after checking each empirically rather than by reading it:
  // run the generator three times and watch what settles. All five moved on the
  // first run and were byte-identical on the second and third, which is the
  // signature of a STALE artifact rather than a churning generator. Two of the
  // five were carrying real drift at the time, which is the argument for the
  // whole list: archiveText.ts still said `Episode 1 — "Nidra" Thama` after the
  // source had already retired that dash, and repoStats.ts said 1036 tests
  // against a suite of 1037.
  "gen-archive-text.mjs",
  "gen-excelsior.mjs",
  "gen-repo-stats.mjs",
  "gen-loopdown.mjs",
  "gen-anthology.mjs",
  // Last, always: it reads everything above and writes into the other repo.
  "gen-kotlin-data.mjs",
];

/** Repos this checks. The second is the whole reason the guard exists. */
const REPOS = [
  { label: "cv-siddharth", dir: root },
  { label: "cv-siddharth-kmp", dir: KMP },
];

const dirty = (dir) =>
  execFileSync("git", ["-C", dir, "status", "--porcelain"], { encoding: "utf8" })
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

const before = new Map();
for (const r of REPOS) {
  if (!existsSync(r.dir)) continue;
  before.set(r.label, new Set(dirty(r.dir)));
}

for (const g of DETERMINISTIC) {
  execFileSync("node", [join(root, "scripts", g)], { stdio: "ignore" });
}

const moved = [];
for (const r of REPOS) {
  if (!before.has(r.label)) continue;
  for (const line of dirty(r.dir)) {
    if (!before.get(r.label).has(line)) moved.push(`${r.label}: ${line}`);
  }
}

if (moved.length) {
  console.error(
    "check-generated: a committed artifact disagrees with its generator.\n\n" +
      moved.map((m) => "  " + m).join("\n") +
      "\n\nRun the generators and commit the result. If one of these is not\n" +
      "actually deterministic, take it out of DETERMINISTIC in this file and\n" +
      "say why, rather than committing churn on every run.\n",
  );
  process.exit(1);
}

console.log(`check-generated: ${DETERMINISTIC.length} deterministic generators, no drift.`);
