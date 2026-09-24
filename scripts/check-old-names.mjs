// Fails when an old product name survives in readable tracked text.
//
// WHY THIS EXISTS. The 2026-09-05 rename (Mileway -> Doori, Kursi -> Gaddi,
// PaymentsLab -> PaymentsLab-KMP, HireSignal -> Candidai, DEADLOCK -> Stutter)
// touched hundreds of lines across docs, scripts, tests and UI copy in one
// pass. A rename that size regresses the moment anyone edits an old-name
// neighbour without noticing it; a mechanical gate is the only thing that
// catches that reliably, because nobody re-reads 90 files on every PR.
//
// WHAT COUNTS AS A HIT. Case-sensitive, word-bounded: `Mileway`, `Kursi`,
// `HireSignal`, `DEADLOCK`, and `PaymentsLab` not already followed by
// `-KMP`. Case-sensitive on purpose: lowercase forms (`mileway`, the DB
// class `MilewayDatabase`, the applicationId `com.kursi.android`) are real,
// live, immutable identifiers, not a stray mention of the product, and stay
// out of scope entirely. `DEADLOCK` (all-caps, the product) is deliberately
// distinct from `Deadlock`/`deadlock` (the CS term) at the regex level; a
// human already swept the title-case product mentions by hand, and the
// lowercase CS term is never in scope.
//
// WHAT IS EXCLUDED FROM THE SCAN. Compiled/binary artifacts (see EXTENSION
// allowlist below) and the compiled Wasm bundles under heavy/*-app/*.js(.map),
// internal minified identifiers, never prose. Paths are not scanned, only
// file CONTENTS: a directory or filename is a one-time human rename, not
// something this gate polices on every run.
//
// THE FIVE KEEP CLASSES (allowlisted, not renamed; see the rename policy
// this codified): applicationIds/package paths and DB filenames (out of
// scope already, lowercase); local on-disk checkout paths like
// `~/Repos/Android/Mileway` (still named that way on the maintainer's own
// disk: renaming the STRING would point at a directory that does not
// exist); vercel.json redirect SOURCE entries (the old slug is the thing
// being redirected FROM, by definition); sentences that record the rename
// itself, `"X (formerly Y)"` / `"Y (now X)"`; and src/data/history.ts, whose
// job is to quote real git commit subjects verbatim, including ones written
// before the rename.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, dirname, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// One pattern, so `--files` and the full-repo scan agree exactly. No \b after
// PaymentsLab: `-KMP` must immediately follow the raw name for the negative
// lookahead to see it, so a boundary there would only add noise.
const OLD_NAME_RE = /\bMileway\b|\bKursi\b|\bHireSignal\b|\bDEADLOCK\b|PaymentsLab(?!-KMP)/;

// Readable text extensions only. Everything else (images, audio, video,
// fonts, wasm, lockfiles, hashes) is either binary or machine-generated
// noise no human reads as prose.
const TEXT_EXT = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".css", ".html", ".md", ".mdx", ".json",
  ".py", ".sh", ".yml", ".yaml", ".txt", ".xml", ".svg",
]);

// Files whose entire job is to CONTAIN the old names: the scanner's own
// pattern source and its test fixtures, never the codebase's prose about
// the products. Scanning these would just be the script failing on itself.
const SELF_EXEMPT_FILES = new Set([
  "scripts/check-old-names.mjs",
  "scripts/check-old-names.test.mjs",
]);

// Whole-file exemptions for the two structural KEEP classes that are not
// line-shaped: history.ts is ALL commit-subject quotes, and package-lock.json
// is machine-written and never hand-read.
const SELF_EXEMPT_FULL_FILE = new Set([
  "src/data/history.ts",
  "package-lock.json",
]);

// Compiled bundles under heavy/*-app: internal minified/Wasm module ids, not
// prose, even though their extension (.js) would otherwise pass TEXT_EXT.
const isCompiledHeavyBundle = (file) => /^heavy\/[^/]+\/.*\.js(\.map)?$/.test(file);

// A rename-record sentence: "Doori (formerly Mileway)" / "Mileway (now
// Doori)" / "DEADLOCK (now STUTTER)" / "(Mileway, now Doori)". `formerly`/
// `now` immediately followed by a capitalized word is specific enough on its
// own; the parenthetical isn't required, since the old and new name can sit
// on either side of the keyword. A line carrying this marker is documenting
// the rename, not failing to have made it.
const RENAME_RECORD_RE = /\b(?:formerly|now)\s+[A-Z]/;

// A local on-disk checkout path or bare path segment: the old name sits
// immediately against a double quote, backtick or slash on at least one
// side: `"Mileway"`, `` `Android/HireSignal` ``, `Mileway/docs/RELEASE.md`,
// `../../Android/PaymentsLab`. Prose never quotes a bare product name like
// this; a path always does. NOT a single quote: "Kursi's", "Mileway's"; the
// possessive apostrophe is the single most common character actually
// touching these names in real prose, and treating it as a path boundary
// would exempt exactly the sentences this scanner exists to catch.
const PATH_BOUNDARY_CHARS = new Set(['"', "`", "/"]);
const isPathBoundary = (ch) => PATH_BOUNDARY_CHARS.has(ch);

function isAllowed(file, line) {
  if (RENAME_RECORD_RE.test(line)) return true;
  if (file === "vercel.json" && line.includes('"source":')) return true;
  if (line.includes("claim-audit:allow")) return true;
  // The scanner's own pattern, wherever it is inline-quoted (this file, its
  // test, or a spec asserting a surface never leaks an old name): the
  // negative lookahead syntax only ever appears as the pattern's source.
  if (line.includes("(?!-KMP)")) return true;
  return false;
}

function findHits(file, text) {
  const hits = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = OLD_NAME_RE.exec(line);
    if (!m) continue;
    const before = line.slice(Math.max(0, m.index - 1), m.index);
    const after = line.slice(m.index + m[0].length, m.index + m[0].length + 1);
    if (isPathBoundary(before) || isPathBoundary(after)) continue;
    if (isAllowed(file, line)) continue;
    hits.push({ file, lineNo: i + 1, text: line.trim(), name: m[0] });
  }
  return hits;
}

function trackedFiles() {
  return execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
}

export function scan(files) {
  const hits = [];
  for (const file of files) {
    if (SELF_EXEMPT_FILES.has(file) || SELF_EXEMPT_FULL_FILE.has(file)) continue;
    if (isCompiledHeavyBundle(file)) continue;
    const ext = file.slice(file.lastIndexOf("."));
    if (!TEXT_EXT.has(ext)) continue;
    let text;
    try {
      text = readFileSync(isAbsolute(file) ? file : join(root, file), "utf8");
    } catch {
      continue; // deleted/renamed between `git ls-files` and the read
    }
    hits.push(...findHits(file, text));
  }
  return hits;
}

export { findHits, trackedFiles, isAllowed, OLD_NAME_RE };

// Only run the CLI when this file is the entry point, not when
// check-old-names.test.mjs imports `scan`/`findHits` to test them directly.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const argFiles = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const files = argFiles.length ? argFiles.map((f) => f.replace(root + "/", "")) : trackedFiles();
  const hits = scan(files);

  if (hits.length) {
    console.error(`check-old-names: ${hits.length} old-name hit(s):`);
    for (const h of hits) console.error(`  ${h.file}:${h.lineNo}: [${h.name}] ${h.text}`);
    process.exit(1);
  }
  console.log(`check-old-names: clean (${files.length} file(s) scanned).`);
}
