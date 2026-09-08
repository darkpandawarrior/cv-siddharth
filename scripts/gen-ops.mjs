/**
 * Writes src/data/ops.ts and src/data/generated/evidence.ts — everything
 * `/ops` renders that cannot be read straight from the browser.
 *
 *   - THE PERIMETER (ops.ts): every generated file that stamps itself, with
 *     the SLA it is measured against. The stamp is written here; the AGE is
 *     computed at render time, so the board is never staler than the moment
 *     you load it even if nobody rebuilds.
 *   - THE LEVERAGE BOARD (ops.ts): each convention plugin in kmp-build-logic
 *     and how many modules across the consumer repos apply it. That is the
 *     number that turns "22 convention plugins" from a count into a blast
 *     radius.
 *   - THE GENERATOR MANIFEST (evidence.ts, arch-L14): every node in
 *     scripts/generators.mjs, straight off that array — not the stamped
 *     subset the perimeter above can see. A node with no `stages` entry has
 *     no automated path at all (store.ts, gen-excelsior and four others);
 *     the manifest names it UNAUTOMATED with the command to run it by hand,
 *     rather than leaving it invisible to the one board built to see it.
 *     Adding a generator means one edit, to generators.mjs — this file
 *     `.map()`s the array, so nothing here needs to change.
 *   - WHAT THIS BOARD DOES NOT MEASURE (evidence.ts, arch-L14): named
 *     rather than silently absent — see NOT_MEASURED_HERE below.
 *
 * The perimeter reads the SAME freshnessSla.ts that freshness.test.ts does, so
 * the board and the gate can never disagree about a deadline. The manifest
 * reads the SAME generators.mjs that check-generated.mjs and refresh.mjs
 * derive their run order from, for the same reason.
 *
 * Committed output, same posture as gen-project-heroes.mjs and
 * gen-project-stats.mjs: the leverage scan needs the sibling KMP repos checked
 * out beside this one, which a build machine does not have. Without them it
 * keeps the committed rows and says so, rather than shipping an empty board.
 * The manifest and the "not measured" list need no sibling repo and no live
 * scan — they are pure functions of files already in THIS repo — so they are
 * never affected by that fallback.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { STAMP_RE, slaFor, generatorFor } from "../src/data/freshnessSla.ts";
import { GENERATORS } from "./generators.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = join(root, "src", "data");
const outFile = join(dataDir, "ops.ts");
const generatedDir = join(dataDir, "generated");
const evidenceFile = join(generatedDir, "evidence.ts");

/* ── The perimeter ─────────────────────────────────────────────────────── */

const perimeter = readdirSync(dataDir)
  .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
  // ops.ts is a PROJECTION of the perimeter, not a member of it. Left in, the
  // stamp scan matched the first `"generatedAt"` inside its own perimeter
  // array — another file's date — and the board reported ops.ts as four days
  // old on the day it was generated. A dashboard misreading its own freshness
  // is precisely the defect it exists to report.
  .filter((f) => f !== "ops.ts")
  .map((f) => ({ file: f, at: STAMP_RE.exec(readFileSync(join(dataDir, f), "utf8"))?.[1] }))
  .filter((x) => x.at)
  .map((x) => ({
    file: x.file,
    generatedAt: x.at,
    slaDays: slaFor(x.file),
    generator: generatorFor(x.file),
  }))
  .sort((a, b) => a.file.localeCompare(b.file));

/* ── The leverage board ────────────────────────────────────────────────── */

/** Where the convention plugins are declared, and who consumes them. */
const KMP = join(root, "..", "..", "KMP");
const ANDROID = join(root, "..", "..", "Android");
const BUILD_LOGIC = join(KMP, "kmp-build-logic", "convention", "build.gradle.kts");
const CONSUMERS = [
  ["Doori", join(ANDROID, "Mileway")],
  ["Gaddi", join(ANDROID, "Kursi")],
  ["PaymentsLab-KMP", join(ANDROID, "PaymentsLab")],
  ["kmp-toolkit", join(KMP, "kmp-toolkit")],
  ["kmp-app-template", join(KMP, "kmp-app-template")],
  // A fourth consumer, and one kmp-toolkit's own notify-consumers.yml matrix
  // already dispatches to. Omitting it understated the reach of the plugins
  // while the external/ walk overstated it.
  ["Candidai", join(ANDROID, "HireSignal")],
];

/**
 * Every build file a repo OWNS, skipping build output and vendored code.
 *
 * `external/` is the important one and it was missing. Every consumer vendors
 * kmp-toolkit and kmp-build-logic as git SUBMODULES under external/, so walking
 * into them counted the same upstream modules once per consumer and counted
 * each convention plugin's own declaration file as a consumer of itself.
 *
 * The damage was not cosmetic. shared.android.library shipped as 63 modules
 * against a true 24, every one of the 17 rows was inflated by at least 3, and
 * TEN rows rendered green — `state={l.modules > 0 ? "OK" : "DEGRADED"}` — on a
 * true count of zero. A board whose whole subject is claims that quietly stop
 * being true was itself overstating its most quotable number by 2.6x.
 *
 * `build-logic/` is skipped for the same reason: a repo's own convention
 * plugins declare the ids, they do not consume them.
 */
const VENDORED = new Set(["build", ".git", ".gradle", "node_modules", "external", "build-logic"]);

function buildFiles(dir, acc = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    if (VENDORED.has(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) buildFiles(p, acc);
    else if (e.name === "build.gradle.kts") acc.push(p);
  }
  return acc;
}

function scanLeverage() {
  if (!existsSync(BUILD_LOGIC)) return null;
  const ids = [...readFileSync(BUILD_LOGIC, "utf8").matchAll(/id = "(shared\.[a-z.]+)"/g)].map((m) => m[1]);
  const unique = [...new Set(ids)].sort();

  const files = CONSUMERS.flatMap(([repo, dir]) =>
    buildFiles(dir).map((f) => ({ repo, text: readFileSync(f, "utf8") })),
  );
  if (!files.length) return null;

  return unique
    .map((id) => {
      const hits = files.filter((f) => f.text.includes(`"${id}"`));
      return {
        id,
        modules: hits.length,
        repos: [...new Set(hits.map((h) => h.repo))].sort(),
      };
    })
    .sort((a, b) => b.modules - a.modules || a.id.localeCompare(b.id));
}

/* ── Vendored drift ───────────────────────────────────────────────────────
 * How far each consumer's pinned submodule is behind its upstream.
 *
 * The spec asks the leverage board for "blast radius and SHA distance". This
 * is the SHA distance half, and it is real: every consumer vendors
 * kmp-toolkit and kmp-build-logic as git SUBMODULES, so the pin is a commit
 * and `rev-list --count <pin>..HEAD` is the exact number of upstream commits
 * a consumer has not taken yet.
 *
 * It is also the drift that already has automation behind it — kmp-toolkit's
 * notify-consumers.yml dispatches its consumers on every push — so a row that
 * sits behind for weeks is a loop that is not closing.
 */
const UPSTREAMS = [
  ["kmp-build-logic", join(KMP, "kmp-build-logic")],
  ["kmp-toolkit", join(KMP, "kmp-toolkit")],
];

function git(cwd, args) {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

function scanDrift() {
  const out = [];
  for (const [repo, dir] of CONSUMERS) {
    if (!existsSync(join(dir, ".gitmodules"))) continue;
    const tree = git(dir, ["ls-tree", "HEAD", "external/"]);
    if (!tree) continue;
    for (const [name, upstreamDir] of UPSTREAMS) {
      const line = tree.split("\n").find((l) => l.endsWith(`external/${name}`));
      if (!line) continue;
      const pin = line.split(/\s+/)[2];
      // A pin the local clone has never fetched cannot be measured offline.
      // Say so rather than guessing a distance.
      const known = git(upstreamDir, ["cat-file", "-t", pin]) === "commit";
      const behind = known ? Number(git(upstreamDir, ["rev-list", "--count", `${pin}..HEAD`])) : null;
      const pinnedAt = known ? git(upstreamDir, ["show", "-s", "--format=%cs", pin]) : null;
      out.push({ repo, upstream: name, pin: pin.slice(0, 7), behind, pinnedAt });
    }
  }
  return out.length ? out : null;
}

const scanned = scanLeverage();
let leverage = scanned;
if (!leverage && existsSync(outFile)) {
  // Keep what is committed rather than shipping an empty board.
  const prev = readFileSync(outFile, "utf8");
  const m = /export const leverage = (\[[\s\S]*?\]) as const;/.exec(prev);
  if (m) leverage = JSON.parse(m[1]);
}
if (!leverage) leverage = [];

const scannedDrift = scanDrift();
let drift = scannedDrift;
if (!drift && existsSync(outFile)) {
  const prev = readFileSync(outFile, "utf8");
  // Must match the shape actually EMITTED below. This read `= (...) as const;`
  // while the writer emits `export const drift: Drift[] = [...];`, so it never
  // matched and every CI build — where the sibling repos do not exist — would
  // have shipped an empty Vendored Drift block. A silently-emptied board on a
  // page about silent emptying; caught by simulating a repo-less build.
  const m = /export const drift: Drift\[\] = (\[[\s\S]*?\n\]);/.exec(prev);
  if (m) drift = JSON.parse(m[1]);
}
if (!drift) drift = [];

const banner =
  "// AUTO-GENERATED by scripts/gen-ops.mjs — do not edit by hand.\n" +
  "// The perimeter is scanned from src/data/*.ts stamps against the SLAs in\n" +
  "// freshnessSla.ts; the leverage board is scanned from the sibling KMP repos.\n" +
  "// Run `npm run gen:ops` to refresh.\n";

// Stamped from the newest input, never the wall clock. This file sits in
// check-generated's DETERMINISTIC list and ci.yml runs that check, so a
// `new Date()` here failed the gate on every day after the commit day with
// nothing changed. A board is exactly as fresh as its freshest input.
// evidence.ts (below) reuses this SAME value — it is just as deterministic
// (a straight map over generators.mjs), so it needs no stamp of its own.
const opsGeneratedAt = perimeter
  .reduce((mx, x) => (x.generatedAt > mx ? x.generatedAt : mx), "1970-01-01")
  .slice(0, 10);

writeFileSync(
  outFile,
  banner +
    `export const perimeter = ${JSON.stringify(perimeter, null, 2)} as const;\n\n` +
    `export const leverage = ${JSON.stringify(leverage, null, 2)} as const;\n\n` +
    // Typed, NOT `as const`: literal-narrowing an array of measurements makes
    // `behind === 0` a type error the day no consumer happens to be level with
    // upstream, which is a compile break caused purely by today's data.
    `export type Drift = { repo: string; upstream: string; pin: string; behind: number | null; pinnedAt: string | null };\n` +
    `export const drift: Drift[] = ${JSON.stringify(drift, null, 2)};\n\n` +
    `export const opsGeneratedAt = ${JSON.stringify(opsGeneratedAt)};\n`,
);

/* ── The generator manifest (arch-L14) ────────────────────────────────────
 * Every node in scripts/generators.mjs, mapped straight across — never a
 * hand-picked subset. `automated` is true the moment a node carries ANY
 * stage; a node stuck at `stages: {}` (store.ts, gen-excelsior and four more
 * manual/occasional scripts) has no cron, no prebuild step and no check —
 * nothing regenerates or verifies it until a person runs the command by
 * hand, and `invocation` is exactly that command, taken from the node's own
 * `npmName` (falling back to the raw `node scripts/<file>` a script with no
 * npm alias is actually run with, per generators.mjs's own doc comment on
 * why four of these have none). */
const nodes = GENERATORS.map((g) => ({
  id: g.id,
  script: g.script,
  kind: g.kind,
  automated: Object.keys(g.stages).length > 0,
  stages: Object.keys(g.stages),
  slaDays: g.slaDays ?? null,
  invocation: g.npmName ? `npm run ${g.npmName}` : `node scripts/${g.script}`,
}));

/* ── What this board does not measure (arch-L14) ──────────────────────────
 * /ops's whole argument is that a blind spot named is more honest than a
 * number invented to fill the row. These five are named rather than
 * papered over with a client-writable substitute:
 *   - field Core Web Vitals (RUM): no RUM package is installed (package.json
 *     ships only @vercel/speed-insights); lighthouserc.json's numbers are lab
 *     measurements on one machine, already on the runway as the freshness
 *     perimeter's siblings, never a real visitor's device.
 *   - chat error rate: api/_lib/chat-handler.ts enforces an origin allowlist
 *     and a rate limiter (see api/_lib/guard.ts) but keeps no error counter —
 *     there is nothing here for this board to read.
 *   - LHCI run history: lighthouserc.json gates CI, but nothing yet
 *     summarises a run's assertions into a committed file this board can
 *     read — that generator does not exist in scripts/generators.mjs today.
 *   - axe accessibility results: e2e/a11y.spec.ts runs on every PR; its
 *     pass/fail is never persisted anywhere outside the CI log.
 *   - the external claim-audit run record: the script lives outside this
 *     repo by design (the owner's private AgentHarness, never committed
 *     here) and writes no record inside this repo when it last ran.
 * Each of these becomes a real row the day its generator lands — this list
 * is not a promise nothing will, it is naming what is true right now. */
const NOT_MEASURED_HERE = [
  "Field Core Web Vitals (real-user LCP/TBT/CLS) — no RUM is installed; the lab-only numbers are on the runway above.",
  "Chat error rate — the endpoint is rate-limited and origin-checked (api/_lib/guard.ts) but keeps no error counter.",
  "LHCI run history — lighthouserc.json gates CI; no generator yet summarises a run into a file this board can read.",
  "axe accessibility results — e2e/a11y.spec.ts runs every PR; its result is never persisted outside the CI log.",
  "The external claim-audit run record — the script lives outside this repo by design and writes nothing back here.",
];

const evidenceBanner =
  "// AUTO-GENERATED by scripts/gen-ops.mjs — do not edit by hand.\n" +
  "// The generator manifest below is a straight map over scripts/generators.mjs's\n" +
  "// own GENERATORS array — adding a node there is the only edit a new generator\n" +
  "// needs; nothing here changes. Run `npm run gen:ops` to refresh.\n";

mkdirSync(generatedDir, { recursive: true });
writeFileSync(
  evidenceFile,
  evidenceBanner +
    `export type GeneratorNode = {\n` +
    `  id: string; script: string; kind: string; automated: boolean;\n` +
    `  stages: string[]; slaDays: number | null; invocation: string;\n` +
    `};\n` +
    `export const generatorNodes: GeneratorNode[] = ${JSON.stringify(nodes, null, 2)};\n\n` +
    `export const notMeasuredHere: string[] = ${JSON.stringify(NOT_MEASURED_HERE, null, 2)};\n\n` +
    `export const evidenceGeneratedAt = ${JSON.stringify(opsGeneratedAt)};\n`,
);

console.log(
  `[gen-ops] ${perimeter.length} perimeter rows, ${leverage.length} convention plugins, ${drift.length} vendored pins, ` +
    `${nodes.length} manifest nodes (${nodes.filter((n) => !n.automated).length} unautomated)` +
    (scanned ? "" : " (kept committed leverage — sibling KMP repos not found)"),
);
