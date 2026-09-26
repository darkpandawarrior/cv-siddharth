// Fails when an old product name survives in readable tracked text.
//
// WHY THIS EXISTS. The 2026-09-05 rename (Mileway -> Doori, Kursi -> Gaddi,
// PaymentsLab -> PaymentsLab-KMP, HireSignal -> Candidai, DEADLOCK -> Stutter)
// touched hundreds of lines across docs, scripts, tests and UI copy in one
// pass. A rename that size regresses the moment anyone edits an old-name
// neighbour without noticing it; a mechanical gate is the only thing that
// catches that reliably, because nobody re-reads 90 files on every PR.
//
// WHAT COUNTS AS A HIT, THREE PASSES.
//   1. Case-sensitive, word-bounded Title-case/ALL-CAPS: `Mileway`, `Kursi`,
//      `HireSignal`, `DEADLOCK`, `PaymentsLab` not already followed by
//      `-KMP`. The "a human wrote the product name in prose" shape.
//   2. Case-insensitive lowercase-slug net: `mileway`/`kursi`/`hiresignal`/
//      bare `paymentslab`, ANY case, word-bounded, skipping mixed-case
//      matches (`paymentsLab`, `paymentsLabKmp` — a JS/TS camelCase
//      identifier, never how a real mention is cased; real ones are
//      Title-case, all-lower or all-upper). Catches what pass 1
//      structurally cannot: a URL route (`/project/mileway`), a curl
//      command, an example repo name, a lowercase mention in prose.
//   3. `deadlock` (any case) counts as the PRODUCT, not the CS term, only
//      when it sits directly against a `/` on either side — a route/path
//      segment like `/project/deadlock` or `heavy/deadlock-app`. Prose
//      never touches a slash like that; a bare case-insensitive match would
//      flag the CS term everywhere it's used honestly (this repo's own
//      fiction and code comments), so it stays out of scope except in that
//      one unambiguous shape.
//
// Both pass 1 and pass 2 get the same quote/backtick/slash path-boundary
// exemption (below) — most of a lowercase old-slug's real, legitimate
// appearances are quoted identifiers (`"mileway-46-36"`, an incident id) or
// backtick-quoted external keys (`` `mileway-modules` ``), not prose, and
// they look identical to a real local path at the single-character level.
// The one shape that legitimately LOOKS like a protected path but must NOT
// be exempted is a URL route: `/project/mileway`, `#project/mileway`,
// `darkpandawarrior.github.io/mileway`. ROUTE_PREFIX_RE recognizes exactly
// that (a route prefix or a bare web host immediately before the slug) and
// forces the match through regardless of the boundary exemption — see
// isRouteMention.
//
// WHAT IS EXCLUDED FROM THE SCAN. Compiled/binary artifacts (see EXTENSION
// allowlist below) and the compiled Wasm bundles under heavy/*-app/*.js(.map),
// internal minified identifiers, never prose. Paths are not scanned, only
// file CONTENTS: a directory or filename is a one-time human rename, not
// something this gate polices on every run.
//
// THE KEEP CLASSES (allowlisted, not renamed; see the rename policy this
// codified):
//   - applicationIds/package paths (`com.mileway`, `com.kursi.android`,
//     `com.paymentslab.app`, `com.hiresignal*`) and DB filenames/URI schemes
//     built from the old slug (`mileway.db`, `mileway://`) — real, live,
//     immutable identifiers; renaming the STRING breaks every existing
//     install's upgrade path or deep link, it doesn't rename the product.
//   - local on-disk checkout paths like `~/Repos/Android/Mileway` (still
//     named that way on the maintainer's own disk: renaming the STRING
//     would point at a directory that does not exist).
//   - published lesson slugs (e.g. `mileway-dead-reckoning`) and feed GUIDs
//     (public/feed.xml's Atom `<id>` values) — permalinks already out in
//     the world; renaming the string breaks the link, not the site.
//   - compiled Wasm module ids in heavy/*-app bundles, and the real,
//     still-unrenamed build-output directory `heavy/paymentslab-app` itself
//     (checked with `ls` — see the rename policy), wherever its name (with
//     the `-app` suffix) is mentioned.
//   - vercel.json redirect SOURCE entries (the old slug is the thing being
//     redirected FROM, by definition), src/Terminal.tsx's
//     RENAMED_SLUG_ALIASES table (the same "old name still resolves"
//     contract, expressed as a JS lookup instead of a redirect list), and
//     refresh-media.yml's own internal staging-checkout label
//     (`android-mileway-checkout`), which the very next line moves to the
//     real local checkout path.
//   - sentences that record the rename itself, `"X (formerly Y)"` / `"Y
//     (now X)"`, or a historical measurement against the old route
//     (`"/project/mileway was 9,621,514 before ..."`).
//   - claim-audit:allow lines (a different gate's marker; never strip it).
//   - whole-file exemptions: src/data/history.ts (quotes real git commit
//     subjects verbatim, including ones written before the rename),
//     package-lock.json (machine-written, never hand-read),
//     public/feed.xml (machine-generated from writing.ts; its `<id>`s are
//     permanent GUIDs), docs/perf-budgets.md (a historical record of a run
//     against the pre-rename folders, deliberately left unrewritten), and
//     CHANGELOG.md if one is ever added (same "historical record" shape).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, dirname, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Pass 1: case-sensitive Title-case/ALL-CAPS. No \b after PaymentsLab:
// `-KMP` must immediately follow the raw name for the negative lookahead to
// see it, so a boundary there would only add noise.
const OLD_NAME_RE = /\bMileway\b|\bKursi\b|\bHireSignal\b|\bDEADLOCK\b|PaymentsLab(?!-KMP)/;

// Pass 2: case-insensitive lowercase-slug net, DERIVED from vercel.json's
// own /project/<old> -> /project/<new> redirects (SH-4, self-healing-spec.md
// #4 "the old-name guard": "rename map derived from the redirects in
// vercel.json" — this is the one place the renames are already recorded, so
// there is no second hand-kept list; adding a new redirect there extends
// this net with no code change here). No real-English collision on any slug
// vercel.json actually redirects, so any case is in scope; `deadlock` is
// deliberately excluded (handled separately below, since it collides with
// the CS term — see findDeadlockSlugMatch).
export function deriveOldSlugs(vercelPath = join(root, "vercel.json")) {
  let redirects;
  try {
    redirects = JSON.parse(readFileSync(vercelPath, "utf8")).redirects ?? [];
  } catch {
    return new Map();
  }
  const PROJECT_RE = /^\/project\/([a-z0-9-]+)$/;
  const map = new Map(); // old slug (lower) -> new slug (lower); first redirect wins
  for (const r of redirects) {
    const oldMatch = PROJECT_RE.exec(r.source ?? "");
    const newMatch = PROJECT_RE.exec(r.destination ?? "");
    if (!oldMatch || !newMatch) continue;
    const oldSlug = oldMatch[1].toLowerCase();
    const newSlug = newMatch[1].toLowerCase();
    if (oldSlug === newSlug || map.has(oldSlug)) continue;
    map.set(oldSlug, newSlug);
  }
  return map;
}

// `-?<suffix>` (hyphen optional) when the new slug is the old one plus a
// suffix (`paymentslab` -> `paymentslab-kmp`): excludes both the hyphenated
// current name and its camelCase form (`paymentsLabKmp`, a real
// property/variable name in this codebase) — the same shape the hand-kept
// PaymentsLab(?!-KMP) exception encoded, now derived instead of hardcoded.
export function buildLowerSlugRe(oldToNew) {
  const parts = [];
  for (const [oldSlug, newSlug] of oldToNew) {
    if (oldSlug === "deadlock") continue; // pass 3 owns this one, narrowly
    if (newSlug.startsWith(oldSlug + "-")) {
      parts.push(`${oldSlug}(?!-?${newSlug.slice(oldSlug.length + 1)})`);
    } else {
      parts.push(`\\b${oldSlug}\\b`);
    }
  }
  return new RegExp(parts.join("|") || "(?!)", "gi"); // (?!) never matches, for an empty map
}

const LOWER_SLUG_RE = buildLowerSlugRe(deriveOldSlugs());

function findLowerSlugMatch(line) {
  LOWER_SLUG_RE.lastIndex = 0;
  let m;
  while ((m = LOWER_SLUG_RE.exec(line))) {
    const text = m[0];
    // Skip mixed-case matches (`paymentsLab`): see the pass-2 note above.
    if (text !== text.toLowerCase() && text !== text.toUpperCase()) continue;
    return m;
  }
  return null;
}

// Pass 3: `deadlock` as a product, narrowly. See findDeadlockSlugMatch.
const DEADLOCK_WORD_RE = /\bdeadlock\b/gi;

function findDeadlockSlugMatch(line) {
  DEADLOCK_WORD_RE.lastIndex = 0;
  let m;
  while ((m = DEADLOCK_WORD_RE.exec(line))) {
    const before = line[m.index - 1];
    const after = line[m.index + m[0].length];
    if (before === "/" || after === "/") return m;
  }
  return null;
}

// A URL-route/URL mention of the slug: a route prefix (`/project/`,
// `#project/`, `/projects/`, `/p/`) or a bare web host (`github.io/`,
// `.vercel.app/`, `localhost:<port>/`) immediately before the match. Looked
// for in a short window before the match, not the whole line, so an
// unrelated earlier slash elsewhere in the line can't trigger it.
const ROUTE_PREFIX_RE = /(?:^|[#/])(?:projects?|p)\/$|\.(?:io|app|dev|com)\/$|localhost(?::\d+)?\/$/i;
function isRouteMention(line, matchIndex) {
  const before = line.slice(Math.max(0, matchIndex - 48), matchIndex);
  return ROUTE_PREFIX_RE.test(before);
}

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

// Whole-file exemptions for KEEP classes that are not line-shaped:
// history.ts is ALL commit-subject quotes; package-lock.json is
// machine-written and never hand-read; feed.xml is machine-generated and
// its <id> values are permanent Atom GUIDs; perf-budgets.md is a historical
// record of a run against the pre-rename folder names, deliberately left
// unrewritten (its own text says so); CHANGELOG.md, if one is ever added,
// is the same "historical record" shape as perf-budgets.md.
const SELF_EXEMPT_FULL_FILE = new Set([
  "src/data/history.ts",
  "package-lock.json",
  "public/feed.xml",
  "docs/perf-budgets.md",
  "CHANGELOG.md",
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

// applicationId / package path: `com.mileway`, `com.kursi.android`,
// `com.paymentslab.app`, `com.hiresignal*` — the real, live Kotlin/Android
// package namespace, never renamed alongside the product (renaming it would
// break every existing install's upgrade path). Dot-bounded on both sides in
// practice, which the generic quote/backtick/slash boundary check below does
// not cover.
const APPLICATION_ID_RE = /\bcom\.(mileway|kursi|hiresignal|paymentslab)\b/i;

// A DB filename (`mileway.db`) or URI scheme (`mileway://`) built from the
// old slug: same "real, live, immutable identifier" class as the
// applicationId, just with no live instance in this repo today. Kept as an
// explicit rule so the policy is already enforced the moment one IS added,
// rather than rediscovered as a false positive later.
const IMMUTABLE_SUFFIX_RE = /\b(mileway|kursi|hiresignal|paymentslab):\/\/|\b(mileway|kursi|hiresignal|paymentslab)\.(db|sqlite)\b/i;

// src/Terminal.tsx's RENAMED_SLUG_ALIASES table: deliberately keeps every
// old slug TYPEABLE as a terminal alias to its current name (`open mileway`
// still resolves) — the same "old name still works" contract vercel.json's
// redirects give everywhere else, just expressed as a JS lookup object
// instead of a redirect list. Shape: a bare lowercase key immediately
// followed by `: "<new-slug>",`, nothing else on the line.
const isTerminalAliasLine = (file, line) =>
  file === "src/Terminal.tsx" && /^\s*[a-z]+:\s*"[a-z-]+",?\s*$/.test(line);

// The real, still-on-disk build-output directory `heavy/paymentslab-app`
// (never renamed to `paymentslab-kmp-app` — see the rename policy's "check
// with ls before renaming a path" rule). Its own quoted/slash-bounded
// appearances already pass the boundary check above; this also covers a
// bare mention in a comment (`// paymentslab-app, the Compose twin...`).
const isPaymentsLabAppPath = (line) => /\bpaymentslab-app\b/i.test(line);

// `.github/workflows/refresh-media.yml`'s own internal staging-checkout
// label (`android-mileway-checkout`, hyphen-bounded, not quote/slash-
// bounded): an intermediate name this workflow invents for itself before
// `mv`-ing the checkout to the already-exempt local path convention
// (`../../Android/Mileway`) gen-app-manifests.mjs also relies on. Not a
// stray product mention — the very next line moves it to the real path.
const isRefreshMediaStagingLabel = (file, line) =>
  file === ".github/workflows/refresh-media.yml" &&
  /\bandroid-(?:mileway|kursi|hiresignal|paymentslab)-checkout\b/i.test(line);

// A historical-record sentence about a superseded number or identifier —
// the `formerly`/`now` rename-record's sibling for something other than a
// bare name: a past measurement against the pre-rename route ("/project/
// mileway was 9,621,514 before ...") or a regression-test comment
// explaining that an old identifier no longer exists ("stat-mileway ...
// died the moment projectStats.ts's keys moved").
const HISTORICAL_MEASUREMENT_RE = /\bwas\s+[\d,]+\s+before\b|\bdied\s+the\s+moment\b/i;

// A local on-disk checkout path or bare quoted identifier: the old name sits
// immediately against a double quote, backtick or slash on at least one
// side: `"Mileway"`, `` `Android/HireSignal` ``, `Mileway/docs/RELEASE.md`,
// `../../Android/PaymentsLab`, `"mileway-46-36"` (an incident id). Prose
// never quotes a bare product name like this; a path or a data identifier
// always does. NOT a single quote: "Kursi's", "Mileway's"; the possessive
// apostrophe is the single most common character actually touching these
// names in real prose, and treating it as a path boundary would exempt
// exactly the sentences this scanner exists to catch. Applied to both pass
// 1 and pass 2 (see isRouteMention for the one case where pass 2 overrides
// it) — a KMP applicationId (`com.mileway`) or a DB/URI literal are the two
// lowercase keep classes that don't happen to sit at such a boundary, which
// is why they get their own dedicated rules above instead.
const PATH_BOUNDARY_CHARS = new Set(['"', "`", "/"]);
const isPathBoundary = (ch) => PATH_BOUNDARY_CHARS.has(ch);

// A URL under github.com/darkpandawarrior/: GitHub redirects a renamed
// repo's old URL on its own, so a link using the pre-rename repo name
// breaks nothing and churns no history worth chasing (self-healing-spec.md
// #4 "the old-name guard").
const GITHUB_REPO_URL_RE = /github\.com\/darkpandawarrior\//;

function isAllowed(file, line) {
  if (RENAME_RECORD_RE.test(line)) return true;
  if (file === "vercel.json" && line.includes('"source":')) return true;
  if (file.startsWith("CHANGELOG")) return true;
  if (line.includes("claim-audit:allow") || line.includes("old-name:allow")) return true;
  if (GITHUB_REPO_URL_RE.test(line)) return true;
  // The scanner's own pattern, wherever it is inline-quoted (this file, its
  // test, or a spec asserting a surface never leaks an old name): the
  // negative lookahead syntax only ever appears as the pattern's source.
  if (line.includes("(?!-KMP)") || line.includes("(?!-kmp)")) return true;
  if (APPLICATION_ID_RE.test(line)) return true;
  if (IMMUTABLE_SUFFIX_RE.test(line)) return true;
  if (isTerminalAliasLine(file, line)) return true;
  if (isPaymentsLabAppPath(line)) return true;
  if (isRefreshMediaStagingLabel(file, line)) return true;
  if (HISTORICAL_MEASUREMENT_RE.test(line)) return true;
  return false;
}

function locateMatch(line) {
  const caseSensitive = OLD_NAME_RE.exec(line);
  const lowerSlug = findLowerSlugMatch(line);
  const deadlockSlug = findDeadlockSlugMatch(line);

  const candidates = [];
  if (caseSensitive) candidates.push({ m: caseSensitive, pathExempt: true });
  if (lowerSlug) candidates.push({ m: lowerSlug, pathExempt: true });
  if (deadlockSlug) candidates.push({ m: deadlockSlug, pathExempt: false });
  if (!candidates.length) return null;
  candidates.sort((a, b) => a.m.index - b.m.index);
  return candidates[0];
}

function findHits(file, text) {
  const hits = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const found = locateMatch(line);
    if (!found) continue;
    const { m, pathExempt } = found;
    // A route/URL mention forces the match through even though it sits at
    // what would otherwise be an exempt boundary (see ROUTE_PREFIX_RE).
    if (pathExempt && !isRouteMention(line, m.index)) {
      const before = line.slice(Math.max(0, m.index - 1), m.index);
      const after = line.slice(m.index + m[0].length, m.index + m[0].length + 1);
      if (isPathBoundary(before) || isPathBoundary(after)) continue;
    }
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

export { findHits, trackedFiles, isAllowed, OLD_NAME_RE, LOWER_SLUG_RE };

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
