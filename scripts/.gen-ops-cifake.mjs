/**
 * Writes src/data/ops.ts — the two halves of `/ops` that cannot be read from
 * the browser.
 *
 *   - THE PERIMETER: every generated file that stamps itself, with the SLA it
 *     is measured against. The stamp is written here; the AGE is computed at
 *     render time, so the board is never staler than the moment you load it
 *     even if nobody rebuilds.
 *   - THE LEVERAGE BOARD: each convention plugin in kmp-build-logic and how
 *     many modules across the consumer repos apply it. That is the number that
 *     turns "22 convention plugins" from a count into a blast radius.
 *
 * The perimeter reads the SAME freshnessSla.ts that freshness.test.ts does, so
 * the board and the gate can never disagree about a deadline.
 *
 * Committed output, same posture as gen-project-heroes.mjs and
 * gen-project-stats.mjs: the leverage scan needs the sibling KMP repos checked
 * out beside this one, which a build machine does not have. Without them it
 * keeps the committed rows and says so, rather than shipping an empty board.
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { STAMP_RE, slaFor, generatorFor } from "../src/data/freshnessSla.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = join(root, "src", "data");
const outFile = join(dataDir, "ops.ts");

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
const KMP = join(root, "..", "..", "NO_KMP_HERE");
const ANDROID = join(root, "..", "..", "NO_ANDROID_HERE");
const BUILD_LOGIC = join(KMP, "kmp-build-logic", "convention", "build.gradle.kts");
const CONSUMERS = [
  ["Mileway", join(ANDROID, "Mileway")],
  ["Kursi", join(ANDROID, "Kursi")],
  ["PaymentsLab", join(ANDROID, "PaymentsLab")],
  ["kmp-toolkit", join(KMP, "kmp-toolkit")],
  ["kmp-app-template", join(KMP, "kmp-app-template")],
  // A fourth consumer, and one kmp-toolkit's own notify-consumers.yml matrix
  // already dispatches to. Omitting it understated the reach of the plugins
  // while the external/ walk overstated it.
  ["HireSignal", join(ANDROID, "HireSignal")],
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
  const m = /export const drift = (\[[\s\S]*?\]) as const;/.exec(prev);
  if (m) drift = JSON.parse(m[1]);
}
if (!drift) drift = [];

const banner =
  "// AUTO-GENERATED by scripts/gen-ops.mjs — do not edit by hand.\n" +
  "// The perimeter is scanned from src/data/*.ts stamps against the SLAs in\n" +
  "// freshnessSla.ts; the leverage board is scanned from the sibling KMP repos.\n" +
  "// Run `npm run gen:ops` to refresh.\n";

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
    `export const opsGeneratedAt = ${JSON.stringify(new Date().toISOString().slice(0, 10))};\n`,
);

console.log(
  `[gen-ops] ${perimeter.length} perimeter rows, ${leverage.length} convention plugins, ${drift.length} vendored pins` +
    (scanned ? "" : " (kept committed leverage — sibling KMP repos not found)"),
);
