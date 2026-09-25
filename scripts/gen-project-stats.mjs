// Emits src/data/projectStats.ts and src/data/kmpGraph.ts.
//
// projectStats.ts's older fields (modules/features/cores/dbVersion/gateway
// breakdown/screenshots) still come from each app repo's settings.gradle.kts
// + Room DB file, fetched over raw.githubusercontent (public repos, no auth;
// optional GITHUB_TOKEN lifts the rate limit for the screenshot count). If
// ANY of that fetch fails, those fields are left untouched so offline /
// Vercel-hiccup builds still succeed off the last good copy.
//
// The substitution/adoption data (composedModules, substitutedModules, and
// kmpGraph.ts's per-module first-adoption month) is read from LOCAL sibling
// checkouts instead, for two reasons, not one: Candidai's GitHub repo is
// PRIVATE (M18 — never fetched, even with a token), so a network path can
// never cover it; and answering "which month did app X first substitute
// module Y" needs `git log` over that app's own history, which a raw-file
// fetch cannot give you at all. A local `git log -p` pass beats either a
// GitHub REST commit-history walk (paginated, one file's worth of diffs to
// download and re-scan) or the naive one-`git log -S`-per-module approach
// (this repo's own settings.gradle.kts has 40+ substitutions across five
// apps) — one subprocess per sibling instead of dozens.
//
// Same fallback contract as gen-ops.mjs / gen-system-graph.mjs: a missing
// sibling checkout keeps whatever that app's fields already say (this run's
// local scan simply has nothing new to say about it), and if NOTHING new was
// learned from either source the file is not rewritten at all — the safest
// way to guarantee "missing sibling => byte-identical output" is to make
// "nothing changed" produce literally the same write, not a special case.
//
// Pure/IO-only building blocks are exported so a test can feed them fixture
// paths directly (no subprocess, no env vars to juggle); only `main()` reads
// process.env and writes files, and it runs only when this file is executed
// directly — importing it for its exports never touches disk or network.
import { writeFileSync, existsSync, readFileSync, realpathSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { fetchWithTimeout } from "./lib/net.mjs";
import { gitEnv } from "./lib/git-env.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const raw = (repo, ref, path) => `https://raw.githubusercontent.com/${repo}/${ref}/${path}`;
const contents = (repo, ref, path) => `https://api.github.com/repos/${repo}/contents/${path}?ref=${ref}`;

async function getText(url, token) {
  const res = await fetchWithTimeout(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

async function pngCount(repo, ref, path, token) {
  const res = await fetchWithTimeout(contents(repo, ref, path), {
    headers: { Accept: "application/vnd.github+json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!res.ok) throw new Error(`${res.status} ${contents(repo, ref, path)}`);
  const list = await res.json();
  return list.filter((f) => /\.png$/i.test(f.name)).length;
}

const count = (s, re) => (s.match(re) || []).length;

// GEN_PROJECT_STATS_FAIL: test-only fault injection, same shape as
// gen-oss-stats.mjs's GEN_OSS_STATS_FAIL — lets a test force the network
// path to fail deterministically without needing a flaky real network.
export async function fetchNetworkStats(token = process.env.GITHUB_TOKEN) {
  if (process.env.GEN_PROJECT_STATS_FAIL === "1") throw new Error("forced failure (test)");

  const mRepo = "darkpandawarrior/Doori";
  const pRepo = "darkpandawarrior/PaymentsLab-KMP";
  const kRepo = "darkpandawarrior/Gaddi";

  const mSettings = await getText(raw(mRepo, "main", "settings.gradle.kts"), token);
  const mDb = await getText(raw(mRepo, "main", "core/data/src/commonMain/kotlin/com/mileway/core/data/database/MilewayDatabase.kt"), token);
  const pSettings = await getText(raw(pRepo, "main", "settings.gradle.kts"), token);
  const kSettings = await getText(raw(kRepo, "main", "settings.gradle.kts"), token);
  const toolkitSettings = await getText(raw("darkpandawarrior/kmp-toolkit", "main", "settings.gradle.kts"), token);
  const conventionBuild = await getText(raw("darkpandawarrior/kmp-build-logic", "main", "convention/build.gradle.kts"), token);
  // Gateway breakdown used to be re-derived from raw source (Application.kt
  // import counting) — that broke silently when providers got reorganized
  // into their own config files (2026-07-24: was reporting 71 gateways,
  // repo's own README already said 66). PaymentsLab-KMP's own gen-readme.sh
  // keeps its README banner honest against settings.gradle.kts on every
  // commit, so trust that instead of re-deriving from files whose shape we
  // don't control.
  const pReadme = await getText(raw(pRepo, "main", "README.md"), token);
  // Same trust-the-repo's-own-AUTOGEN-line move for Doori's Room schema
  // version: Doori's own gen-readme.sh already keeps this line honest
  // against its schemaDirectory() export, and that export isn't committed
  // to the repo at all (it's a build artefact, not source), so there is no
  // schemas/ tree to walk here.
  const mReadme = await getText(raw(mRepo, "main", "README.md"), token);

  const dbMatch = mDb.match(/version\s*=\s*(\d+)/);
  if (!dbMatch) throw new Error("could not parse Doori DB version");
  const schemaMatch = mReadme.match(/Room schema \*\*v(\d+)\*\*/);
  if (!schemaMatch) throw new Error("could not parse Doori schema version from README");

  return {
    foundation: {
      modules: count(toolkitSettings, /^include\(/gm),
      providerModules: count(toolkitSettings, /^include\(":provider:/gm),
      conventionPlugins: count(conventionBuild, /^\s*id\s*=\s*"shared\./gm),
    },
    // Keyed by the site's own current slugs (renamed 2026-09-05) — see
    // projectStatLine.ts for the one thing left keyed by the old app names
    // (this file's own repo URLs, which are real GitHub repo names, not
    // site slugs).
    doori: {
      modules: count(mSettings, /^include\(/gm),
      // The kmp-toolkit modules Doori composes in through `includeBuild` +
      // `dependencySubstitution`. They are part of the built app but are NOT
      // `include(` lines, so counting only local includes reported 36 against
      // an audited claim of 46 (claims.json: "36 local includes + 10 composed
      // from kmp-toolkit") — and the Doori card printed both numbers, 30px
      // apart. Same measurable definition paymentslab-kmp already used.
      composedModules: count(mSettings, /substitute\(module\(/gm),
      features: count(mSettings, /^include\(":feature:/gm),
      cores: count(mSettings, /^include\(":core:/gm),
      dbVersion: Number(dbMatch[1]),
      // Distinct from dbVersion above: a version COUNT off the Room schema
      // export directory, not the migration count. Numerically the two
      // agree today (Room's own `version = N` IS the schema version its
      // exporter names its `N.json` file after) — they are kept as two
      // fields because they are two claims with two different sources, and
      // T4/REC-8 wants the pillar labelled "schema version 48" measured
      // against the schema artifact, not silently reused from dbVersion.
      schemaVersion: Number(schemaMatch[1]),
      screenshots: await pngCount(mRepo, "main", "docs/screenshots", token),
    },
    "paymentslab-kmp": {
      modules: count(pSettings, /^include\(/gm),
      composedModules: Number(pReadme.match(/(\d+)\s*composed/i)?.[1] ?? 0),
      providers: count(pSettings, /^include\(":provider:/gm),
      features: count(pSettings, /^include\(":feature:/gm),
      cores: count(pSettings, /^include\(":core:/gm),
      // Pulled from the README's own "Modular KMP architecture, N gateways
      // behind it" highlight bullet — see the note above on why.
      gatewaysNative: Number(pReadme.match(/catalog spans (\d+) native-SDK integrations/i)?.[1] ?? 0),
      gatewaysInternal: Number(pReadme.match(/(\d+) internal wallet ledger/i)?.[1] ?? 0),
      gatewaysHosted: Number(pReadme.match(/(\d+) hosted-webview gateways/i)?.[1] ?? 0),
      gatewaysMobileMoney: Number(pReadme.match(/(\d+) mobile-money flows/i)?.[1] ?? 0),
      gatewaysStub: Number(pReadme.match(/(\d+) catalog-only\/KYC-gated entries/i)?.[1] ?? 0),
      screenshots: await pngCount(pRepo, "main", "docs/screenshots", token),
    },
    gaddi: {
      modules: count(kSettings, /^include\(/gm),
      screenshots: await pngCount(kRepo, "main", "docs/screenshots", token),
    },
  };
}

/* ── Local sibling scan: substitution adoption + first-month history ─────
 * `substitute(module("com.siddharth.kmp:X")).using(...)` lines in each
 * consumer's own settings.gradle.kts are the one ground truth for both
 * composedModules and substitutedModules — reading the SAME local files a
 * developer's own Gradle sync reads, not a re-derivation of them.
 */
export const SUBSTITUTE_RE = /substitute\(module\("com\.siddharth\.kmp:([\w-]+)"\)\)/g;

function git(cwd, args) {
  try {
    return execFileSync("git", args, { cwd, env: gitEnv(), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || null;
  } catch {
    return null;
  }
}

/** One `git log -p` pass over settings.gradle.kts gives every module's first
 *  added-line month in a single subprocess, instead of one `git log -S`
 *  invocation per module (this file alone substitutes a dozen-plus modules
 *  per app). `--reverse` walks oldest-first, so the first `+` line matching
 *  a given module IS its first-adoption commit. Returns {} (never throws)
 *  when `dir` has no git history git can read — that reads as "unmeasured"
 *  per module, not as a whole-scan failure. */
export function firstMonths(dir) {
  const months = {};
  const log = git(dir, ["log", "--reverse", "-p", "--format=@@@%ad", "--date=format:%Y-%m", "--", "settings.gradle.kts"]);
  if (!log) return months;
  let month = null;
  for (const line of log.split("\n")) {
    if (line.startsWith("@@@")) {
      month = line.slice(3);
      continue;
    }
    if (line[0] !== "+") continue;
    SUBSTITUTE_RE.lastIndex = 0;
    const m = SUBSTITUTE_RE.exec(line);
    if (m && !(m[1] in months)) months[m[1]] = month;
  }
  return months;
}

/** `dirs`: candidate local checkout paths for one consumer app, in
 *  preference order (current repo name, then any prior name). Returns null
 *  when none exist — the sibling is simply absent this run. */
export function scanConsumer(dirs) {
  const dir = dirs.find((d) => existsSync(join(d, "settings.gradle.kts")));
  if (!dir) return null;
  const text = readFileSync(join(dir, "settings.gradle.kts"), "utf8");
  SUBSTITUTE_RE.lastIndex = 0;
  const substitutedModules = [...new Set([...text.matchAll(SUBSTITUTE_RE)].map((m) => m[1]))];
  const months = firstMonths(dir);
  return {
    substitutedModules,
    composedModules: substitutedModules.length,
    firstMonth: Object.fromEntries(substitutedModules.map((m) => [m, months[m] ?? null])),
  };
}

/** kmp-toolkit's own module catalog (`include(":x")` / `include(":provider:x")`
 *  lines, leaf name only — the same name `substitute(module(...))` uses).
 *  Returns null when `toolkitDir` isn't checked out. */
export function scanToolkitModules(toolkitDir) {
  const settingsPath = join(toolkitDir, "settings.gradle.kts");
  if (!existsSync(settingsPath)) return null;
  const text = readFileSync(settingsPath, "utf8");
  const ids = [...text.matchAll(/^include\("(:[\w:-]+)"\)/gm)].map((m) => m[1].split(":").pop());
  return [...new Set(ids)];
}

/* ── Read what is already committed, for the per-field fallback ─────────
 * Regex over the emitted JSON body rather than `import()`-ing our own
 * output: same approach gen-repo-stats.mjs's `previous` already uses, and it
 * needs no TS loader round trip on our own generated file.
 */
export function readPreviousStats(file) {
  if (!existsSync(file)) return {};
  const m = /export const projectStats = ([\s\S]*?) as const;/.exec(readFileSync(file, "utf8"));
  if (!m) return {};
  try {
    return JSON.parse(m[1]);
  } catch {
    return {};
  }
}

export function readPreviousGraph(file) {
  if (!existsSync(file)) return null;
  const m = /export const kmpGraph: KmpGraph = ([\s\S]*?);\n/.exec(readFileSync(file, "utf8"));
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

/** composedModules/substitutedModules for one app: prefer this run's local
 *  scan; fall back to whatever is already committed when the sibling is
 *  absent (a stale-but-unchanged answer beats silently zeroing a real app
 *  out because a laptop's checkout wasn't there this run). */
export function adoptionFor(app, localScan, previousStats, networkBase = {}) {
  const local = localScan[app];
  const prev = previousStats[app] ?? {};
  return {
    composedModules: local ? local.composedModules : (networkBase.composedModules ?? prev.composedModules ?? 0),
    substitutedModules: local ? local.substitutedModules : (prev.substitutedModules ?? []),
  };
}

export const CONSUMER_LABELS = {
  doori: "Doori",
  gaddi: "Gaddi",
  "paymentslab-kmp": "PaymentsLab-KMP",
  candidai: "Candidai",
  portfolio: "Portfolio twin",
};

/** kmpGraph.ts's per-module `usedBy`: this run's local scan when the
 *  consumer was found, else whatever that module already said for that
 *  consumer (graceful per-sibling degrade, same contract as adoptionFor). */
export function graphUsedBy(moduleId, consumerIds, localScan, previousGraph) {
  const usedBy = [];
  for (const app of consumerIds) {
    const local = localScan[app];
    if (local) {
      if (local.substitutedModules.includes(moduleId)) usedBy.push({ app, firstMonth: local.firstMonth[moduleId] ?? null });
    } else {
      const prevEntry = previousGraph?.modules?.find((m) => m.id === moduleId)?.usedBy?.find((u) => u.app === app);
      if (prevEntry) usedBy.push(prevEntry);
    }
  }
  return usedBy;
}

async function main() {
  const outFile = join(root, "src", "data", "projectStats.ts");
  const graphOutFile = join(root, "src", "data", "kmpGraph.ts");

  const REPOS_ROOT = process.env.CV_REPOS_ROOT ?? join(root, "..", "..");
  const ANDROID = join(REPOS_ROOT, "Android");
  const KMP_ROOT = join(REPOS_ROOT, "KMP");
  // Matches sync-twin.mjs / gen-kotlin-data.mjs's own sibling convention: the
  // portfolio's Compose twin is a sibling of THIS repo, not of Android/KMP.
  const PORTFOLIO_TWIN = process.env.CV_SIDDHARTH_KMP_ROOT ?? join(root, "..", "cv-siddharth-kmp");
  const TOOLKIT_DIR = process.env.CV_KMP_TOOLKIT_ROOT ?? join(KMP_ROOT, "kmp-toolkit");

  const CONSUMER_DIRS = {
    doori: [join(ANDROID, "Doori"), join(ANDROID, "Mileway")],
    gaddi: [join(ANDROID, "Gaddi"), join(ANDROID, "Kursi")],
    "paymentslab-kmp": [join(ANDROID, "PaymentsLab-KMP"), join(ANDROID, "PaymentsLab")],
    // Candidai's repo is PRIVATE (M18) — this local checkout is the only way
    // its substitution data can ever be measured; it is never fetched.
    candidai: [join(ANDROID, "Candidai"), join(ANDROID, "HireSignal")],
    portfolio: [PORTFOLIO_TWIN],
  };
  const consumerIds = Object.keys(CONSUMER_DIRS);

  const localScan = Object.fromEntries(consumerIds.map((app) => [app, scanConsumer(CONSUMER_DIRS[app])]));
  const previousStats = readPreviousStats(outFile);
  const previousGraph = readPreviousGraph(graphOutFile);

  const banner =
    "// AUTO-GENERATED by scripts/gen-project-stats.mjs — do not edit by hand.\n" +
    "// Numbers are derived from each app repo's settings.gradle.kts + Room DB over\n" +
    "// raw.githubusercontent, plus a local sibling-checkout scan for the KMP\n" +
    "// substitution/adoption fields (candidai's repo is private and can only ever\n" +
    "// be read locally — see the module docstring). Run `npm run gen:stats` to refresh.\n";

  let networkStats = null;
  try {
    networkStats = await fetchNetworkStats();
    // Sanity guard: a parse that silently returns 0 modules is a bad fetch, not real.
    if (
      !networkStats.doori.modules ||
      !networkStats["paymentslab-kmp"].modules ||
      !networkStats.gaddi.modules ||
      !networkStats.foundation.modules ||
      !networkStats.foundation.conventionPlugins
    )
      throw new Error("parsed 0 modules — refusing to overwrite");
  } catch (err) {
    console.warn("[gen-project-stats] network fetch failed, keeping committed network-derived fields —", err.message);
  }

  if (!networkStats && !existsSync(outFile)) {
    console.error("[gen-project-stats] fetch failed and no committed projectStats.ts exists");
    process.exit(1);
  }

  const baseline = networkStats ?? previousStats;

  const finalStats = {
    foundation: baseline.foundation ?? previousStats.foundation,
    doori: { ...previousStats.doori, ...baseline.doori, ...adoptionFor("doori", localScan, previousStats, baseline.doori) },
    "paymentslab-kmp": {
      ...previousStats["paymentslab-kmp"],
      ...baseline["paymentslab-kmp"],
      ...adoptionFor("paymentslab-kmp", localScan, previousStats, baseline["paymentslab-kmp"]),
    },
    gaddi: { ...previousStats.gaddi, ...baseline.gaddi, ...adoptionFor("gaddi", localScan, previousStats, baseline.gaddi) },
    // candidai and portfolio have no network-fetched fields at all (private
    // repo; a Compose Multiplatform twin, not a "consumer app" claim) — pure
    // local-scan output, falling back to whatever was already committed.
    candidai: adoptionFor("candidai", localScan, previousStats),
    portfolio: adoptionFor("portfolio", localScan, previousStats),
  };

  if (JSON.stringify(finalStats) === JSON.stringify(previousStats)) {
    console.log("[gen-project-stats] no change — projectStats.ts left untouched");
  } else {
    const generatedAt = new Date().toISOString().slice(0, 10);
    writeFileSync(
      outFile,
      banner +
        `export const projectStats = ${JSON.stringify(finalStats, null, 2)} as const;\n` +
        `export const projectStatsGeneratedAt = "${generatedAt}";\n`,
    );
    console.log("[gen-project-stats]", JSON.stringify(finalStats));
  }

  /* ── kmpGraph.ts: kmp-toolkit's module catalog + who has adopted what ── */

  const toolkitModules = scanToolkitModules(TOOLKIT_DIR);

  const graphData = toolkitModules
    ? {
        generatedAt: new Date().toISOString().slice(0, 10),
        modules: toolkitModules.map((id) => ({ id, usedBy: graphUsedBy(id, consumerIds, localScan, previousGraph) })),
        consumers: consumerIds.map((id) => ({ id, label: CONSUMER_LABELS[id] })),
        dependencySpine: consumerIds.flatMap((id) => [
          { from: "kmp-build-logic", to: id },
          { from: "kmp-toolkit", to: id },
        ]),
      }
    : previousGraph;

  if (!graphData) {
    console.warn("[gen-project-stats] kmp-toolkit not checked out and no committed kmpGraph.ts exists — skipping");
    return;
  }

  const { generatedAt: _prevStamp, ...prevBody } = previousGraph ?? {};
  const { generatedAt: _newStamp, ...newBody } = graphData;
  if (previousGraph && JSON.stringify(newBody) === JSON.stringify(prevBody)) {
    console.log("[gen-project-stats] no change — kmpGraph.ts left untouched");
    return;
  }

  const graphBanner =
    "// AUTO-GENERATED by scripts/gen-project-stats.mjs — do not edit by hand.\n" +
    "// kmp-toolkit's module catalog, which consumer app first substituted each\n" +
    "// module and when (git history of that consumer's own settings.gradle.kts),\n" +
    "// and the repo-level includeBuild spine. Feeds mermaidFromGraph\n" +
    "// (src/lib/mermaidFromGraph.ts). Run `npm run gen:stats` to refresh.\n";
  writeFileSync(
    graphOutFile,
    graphBanner +
      `export interface KmpModuleUsage { app: string; firstMonth: string | null }\n` +
      `export interface KmpModule { id: string; usedBy: KmpModuleUsage[] }\n` +
      `export interface KmpConsumer { id: string; label: string }\n` +
      `export interface KmpDependencyEdge { from: string; to: string }\n` +
      `export interface KmpGraph { generatedAt: string; modules: KmpModule[]; consumers: KmpConsumer[]; dependencySpine: KmpDependencyEdge[] }\n\n` +
      `export const kmpGraph: KmpGraph = ${JSON.stringify(graphData, null, 2)};\n`,
  );
  console.log(`[gen-project-stats] kmpGraph: ${graphData.modules.length} modules, ${graphData.consumers.length} consumers`);
}

// Only runs the network/fs/git side effects when executed directly —
// importing the exports above for a test never touches disk or network.
//
// realpathSync, not a bare string compare: process.argv[1] is the path as
// INVOKED, import.meta.url is Node's fully RESOLVED path, and on macOS
// `/tmp` and `/var` are themselves symlinks into `/private/...` — a spawned
// test invoking this script from `os.tmpdir()` (which macOS returns
// unresolved) would otherwise never match, silently skip main(), and still
// exit 0, which reads as a false-positive pass rather than the exercised
// path a test believes it is checking.
function isMain() {
  try {
    return fileURLToPath(import.meta.url) === realpathSync(process.argv[1]);
  } catch {
    return false;
  }
}
if (isMain()) {
  await main();
}
