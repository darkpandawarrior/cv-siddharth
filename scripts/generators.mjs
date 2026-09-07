/**
 * ONE typed, node-importable registry of every generator in this repo.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────
 * Before this file, the same 28 generators were enumerated by hand in THREE
 * places, in three different orders, and nothing cross-checked that a
 * generator added to one was added to the others:
 *
 *   - package.json's prebuild/predev: a 15-link `&&` chain (identical for
 *     both scripts).
 *   - refresh.mjs's STEPS: 18 entries, a different subset, a different order.
 *   - check-generated.mjs's DETERMINISTIC: 8 entries, a third order, whose
 *     own comment claimed it "mirrors prebuild's order" — it does not (see
 *     the ops/archive-text edge below).
 *
 * That disagreement is the mechanism behind three incidents this repo has
 * postmortemed: an 8-day silent skip in the `&&` chain (one dead generator
 * fifth in line silenced the thirteen after it), a 29-day-stale chessDeep.ts
 * (its generator sat 17th in a list nothing enforced), and 159 Kotlin compile
 * errors past two green CIs (gen-kotlin-data.mjs read stale corpora because
 * its real inputs were never declared anywhere, just implied by list order).
 *
 * ── THE MODEL ────────────────────────────────────────────────────────────
 * Every node declares its real inputs and outputs (repo-relative paths). Run
 * order within a stage is a topological sort over those — a producer that
 * writes a file a consumer reads always runs first — with each node's
 * declared `stages[stage]` position used only to break ties between nodes
 * with no ordering relationship, so the result is deterministic and reads
 * the same as today's known-good order. This is not a parallel runner
 * (refresh.mjs's own docstring already explains why not) — it is one
 * correct order instead of three disagreeing ones.
 *
 * package.json's prebuild/predev, refresh.mjs's STEPS and
 * check-generated.mjs's DETERMINISTIC all derive from this file now (see
 * BUILD_CHAIN / REFRESH_STEPS / CHECK_DETERMINISTIC below and their use
 * sites). Adding a generator means adding ONE node here — every consumer
 * picks it up automatically, and scripts/generators.test.mjs fails the build
 * if a script exists with no node, if a node names a script that doesn't
 * exist, or if a banner-carrying generated file isn't a declared output.
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Safe to import a .ts file from a .mjs script: every generator in this repo
// already does it (e.g. gen-ops.mjs imports freshnessSla.ts directly), Node's
// native TypeScript support erases the annotations at load time, and
// scripts/ is outside tsconfig.app.json's `include` so tsc -b never sees this
// file. The reverse (a .ts file importing an .mjs one) is NOT proven safe
// here — tsconfig has no `allowJs` — so freshnessSla.ts stays the source of
// the SLA table and this file reads FROM it, never the other way round.
import { SLA_DAYS } from "../src/data/freshnessSla.ts";

export const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * @typedef {"local"|"network"|"private-env"|"sibling"} GeneratorKind
 * - local: no network call, no required env var, no sibling repo.
 * - network: makes a live outbound fetch (GitHub, chess.com/lichess, the Play
 *   Store, Internet Archive, Cartesia) as part of a normal run.
 * - private-env: refuses to run at all without an env var pointing at a
 *   private checkout (gen-store-flavours.mjs and SHELF_*_REPO).
 * - sibling: reads and/or writes another repo checked out beside this one
 *   (../cv-siddharth-kmp, ../../Android, ../../KMP), degrading to "keep the
 *   committed figures" when that repo is absent rather than failing.
 *
 * @typedef {Object} GeneratorNode
 * @property {string} id
 * @property {string} script - filename under scripts/
 * @property {string|null} npmName - the package.json script key that runs
 *   it, or null for the four manual/occasional scripts the README already
 *   documents as having no alias (gen-store-archive/siblings/flavours,
 *   gen-excelsior — see check-generated.mjs's own comment on the last of
 *   those).
 * @property {GeneratorKind} kind
 * @property {string[]} inputs - repo-relative paths (or repo-relative paths
 *   inside a sibling checkout) this reads that ANOTHER node produces. Only
 *   real cross-generator dependencies are listed here, not every file a
 *   script happens to import — a static, hand-authored source file is not a
 *   generator, so it does not create an ordering edge.
 * @property {string[]} outputs - repo-relative paths this writes. A
 *   banner-carrying generated file must appear in exactly one node's
 *   outputs (asserted by generators.test.mjs).
 * @property {Partial<Record<"build"|"refresh"|"check", number>>} stages -
 *   which pipeline(s) include this node today, and its tie-break position
 *   within each: "build" feeds package.json's prebuild/predev (identical
 *   chains), "refresh" feeds refresh.mjs's STEPS, "check" feeds
 *   check-generated.mjs's DETERMINISTIC. Absent from all three: a
 *   manual/occasional script, run by hand only.
 * @property {number} [slaDays] - folded in from freshnessSla.ts's SLA_DAYS
 *   for the one node whose primary output carries a non-default freshness
 *   ceiling. Anything stamped but absent here gets freshnessSla.ts's
 *   MAX_AGE_DAYS default (45) — see slaFor() there, which this does not
 *   replace.
 */

/** @type {GeneratorNode[]} */
export const GENERATORS = [
  { id: "galleries", script: "gen-galleries.mjs", npmName: "gen:galleries", kind: "local",
    inputs: [], outputs: ["src/data/galleries.ts"], stages: { build: 1, refresh: 5, check: 1 } },
  { id: "compare-sets", script: "gen-compare-sets.mjs", npmName: "gen:compare", kind: "local",
    inputs: [], outputs: ["src/data/compareSets.ts"], stages: { build: 2, check: 2 } },
  // kind was "local" until this lane: it unconditionally fetches
  // the-loopdown's registry.json off raw.githubusercontent.com (see
  // fetchWithTimeout in gen-loopdown.mjs) — the exact live-fetch-in-prebuild
  // shape F3 names for gen-anthology. Same fix: network kind, refresh only.
  { id: "loopdown", script: "gen-loopdown.mjs", npmName: "gen:loopdown", kind: "network",
    inputs: [], outputs: ["src/data/writing.ts"], stages: { refresh: 7, check: 6 } },
  { id: "anthology", script: "gen-anthology.mjs", npmName: "gen:anthology", kind: "network",
    inputs: [], outputs: ["src/data/anthology.ts"], stages: { refresh: 8, check: 7 } },
  { id: "timeline", script: "gen-timeline.mjs", npmName: "gen:timeline", kind: "network",
    inputs: [], outputs: ["src/data/timeline.ts"], stages: { refresh: 9 } },
  // Re-shapes the already-committed timeline.ts (itself excluded from check
  // because ITS OWN sources are live); this one is not, so it belongs there.
  { id: "lanes", script: "gen-lanes.mjs", npmName: "gen:lanes", kind: "local",
    inputs: ["src/data/timeline.ts"], outputs: ["src/data/lanes.ts"], stages: { build: 8, refresh: 21, check: 6 } },
  // git log against THIS repo — no network, no sibling checkout — but bytes
  // change on every real commit, so it is NOT in the check-generated
  // deterministic set (same rule as the "git commit counts" note elsewhere
  // in this file); its own staleness is bounded by freshnessSla.ts instead.
  { id: "history", script: "gen-history.mjs", npmName: "gen:history", kind: "local",
    inputs: [], outputs: ["src/data/history.ts"], stages: { refresh: 22 } },
  { id: "feed", script: "gen-feed.mjs", npmName: "gen:feed", kind: "local",
    inputs: ["src/data/writing.ts"], outputs: ["public/feed.xml"], stages: { build: 6, refresh: 10 } },
  { id: "anthology-feed", script: "gen-anthology-feed.mjs", npmName: "gen:anthology-feed", kind: "local",
    inputs: ["src/data/anthology.ts"], outputs: ["public/anthology.xml"], stages: { build: 7 } },
  // kind is "local" (no network, no env, no sibling) but it stamps
  // `new Date().toISOString().slice(0,10)` into every <lastmod> on every
  // run, content-identical or not (F7's "9 modified files" bug: the sitemap
  // was one of them). "local" is not the same claim as "byte-deterministic"
  // — see check-generated.mjs's own DETERMINISTIC rule, which already
  // excludes this for the same reason. Build stage needs that same
  // exclusion: refresh only, output committed, degrades visibly (its own
  // <lastmod> ages) rather than lying with a fresh stamp on every deploy.
  { id: "sitemap", script: "gen-sitemap.mjs", npmName: "gen:sitemap", kind: "local",
    inputs: [], outputs: ["public/sitemap.xml"], stages: { refresh: 11 } },
  { id: "system-prompt", script: "gen-system-prompt.mjs", npmName: "gen:system-prompt", kind: "local",
    inputs: ["src/data/writing.ts", "src/data/chess.ts"],
    outputs: ["api/_lib/system-prompt.ts", "api/_lib/jd-prompt.ts"], stages: { build: 9, refresh: 17 } },
  // Same now-restamping shape as sitemap above (`generatedAt: new
  // Date().toISOString()` unconditionally), plus a real undeclared input:
  // it dynamically imports src/data/timeline.ts for month/lane data, so it
  // must run after timeline in whichever stage it's in — declared here
  // rather than left implied by list position. Refresh only.
  { id: "world-plate", script: "gen-world-plate.mjs", npmName: "gen:world-plate", kind: "local",
    inputs: ["src/data/timeline.ts"],
    outputs: ["src/world/corridorPlate.ts", "public/p/world/corridor.png"], stages: { refresh: 19 } },
  { id: "repo-stats", script: "gen-repo-stats.mjs", npmName: "gen:repo-stats", kind: "sibling",
    inputs: [], outputs: ["src/data/repoStats.ts"], stages: { check: 5 } },
  { id: "ops", script: "gen-ops.mjs", npmName: "gen:ops", kind: "sibling",
    inputs: [], outputs: ["src/data/ops.ts"], stages: { refresh: 18, check: 3 } },
  // Sibling kind (scans ../../Android, ../../KMP checkouts) AND a now-stamp
  // (`generatedAt: new Date().toISOString().slice(0,10)`) — refresh only on
  // both counts. Had no refresh entry at all before this lane (build was its
  // only automated path), so removing build without adding refresh would
  // have made it purely manual; it keeps its committed output current here.
  { id: "system-graph", script: "gen-system-graph.mjs", npmName: "gen:system-graph", kind: "sibling",
    inputs: [], outputs: ["src/data/systemGraph.ts", "src/data/storyMap.ts"], stages: { refresh: 20 } },
  { id: "kotlin-data", script: "gen-kotlin-data.mjs", npmName: "gen:kotlin", kind: "sibling",
    // The cross-repo emitter: reads the corpora every generator above it
    // writes, then translates them into the Kotlin the Compose twin reads.
    // Running it before any one of these means it emits Kotlin from a stale
    // source — the exact failure check-generated.mjs exists to catch.
    inputs: [
      "src/data/store.ts", "src/data/weeb.ts", "src/data/writing.ts", "src/data/anthology.ts",
      "src/data/ops.ts", "src/data/archiveText.ts", "src/data/chess.ts", "src/data/storyMap.ts",
    ],
    outputs: [
      "../cv-siddharth-kmp/cmp-shared/src/composeMain/kotlin/com/siddharth/cv/shared/data/generated/*.kt",
      // Committed HERE, not beside the .kt files — this repo has no push
      // access to cv-siddharth-kmp, so a guard living only in that ephemeral
      // checkout would never survive between CI runs to diff against.
      "scripts/kotlin-field-contract.json",
    ],
    // refresh stage added by arch-L12: this had NO automated write-back path
    // at all (F4) — only check:generated's byte-diff ever exercised it, and
    // only on a machine with the twin already checked out. refresh-twin.yml
    // is the one CI job with the sibling present, so this is what actually
    // runs it on the weekly cron; refresh-media.yml has no KMP checkout and
    // gracefully skips it, same as every other sibling-kind node there today.
    stages: { refresh: 23, check: 8 } },
  // Repo/commit read from each app's own sibling checkout (`git remote
  // get-url origin` + `rev-parse HEAD`, never hand-typed) — same graceful
  // skip as the other sibling nodes above. NOT in the check stage: unlike
  // kotlin-data's cross-repo byte-diff, this reads a live sibling HEAD as an
  // input, so two runs on different days legitimately disagree exactly as
  // gen-ops/gen-repo-stats/gen-system-graph already do.
  { id: "app-manifests", script: "gen-app-manifests.mjs", npmName: "gen:app-manifests", kind: "sibling",
    inputs: [], outputs: [
      "heavy/kursi-app/build-manifest.json", "heavy/mileway-app/build-manifest.json",
      "heavy/paymentslab-app/build-manifest.json", "heavy/portfolio-app/build-manifest.json",
      "heavy/deadlock-app/build-manifest.json",
    ],
    stages: { refresh: 24 } },
  { id: "images", script: "gen-images.mjs", npmName: "gen:images", kind: "local",
    inputs: [], outputs: ["public/**/*.avif", "public/**/*.webp", "public/**/*.mp4"], stages: { build: 15, refresh: 6 } },

  { id: "sync-media", script: "sync-project-media.mjs", npmName: "sync:media", kind: "network",
    inputs: [], outputs: ["public/projects/**"], stages: { refresh: 1 } },
  { id: "showcase", script: "rebuild-showcase.mjs", npmName: "showcase", kind: "network",
    inputs: [], outputs: ["public/projects/*/showcase/**"], stages: { refresh: 2 } },
  { id: "project-stats", script: "gen-project-stats.mjs", npmName: "gen:stats", kind: "network",
    inputs: [], outputs: ["src/data/projectStats.ts"], stages: { refresh: 3 } },
  { id: "hiresignal-stats", script: "gen-hiresignal-stats.mjs", npmName: "gen:hiresignal", kind: "network",
    // Partial rewrite, not a fresh banner-carrying file: it splices one
    // updated number into three otherwise hand-authored files.
    inputs: [], outputs: ["src/data/profile.ts", "src/labs/FanoutLab.tsx", "src/data/hiresignal.ts"],
    stages: { refresh: 4 } },
  { id: "project-heroes", script: "gen-project-heroes.mjs", npmName: "gen:heroes", kind: "local",
    inputs: [], outputs: ["public/projects/_heroes/*.png"], stages: { refresh: 12 } },
  { id: "og", script: "gen-og.mjs", npmName: "gen:og", kind: "local",
    inputs: ["src/data/writing.ts"], outputs: ["public/projects/*/og.png"], stages: { refresh: 13 } },
  { id: "weeb", script: "gen-weeb.mjs", npmName: "gen:weeb", kind: "network",
    inputs: [], outputs: ["src/data/weeb.ts"], stages: { refresh: 14 } },
  { id: "chess-stats", script: "gen-chess-stats.mjs", npmName: "gen:chess", kind: "network",
    inputs: [], outputs: ["src/data/chess.ts", "public/chess/corpus.json", ".chess-cache/lichess-games.json"],
    stages: { refresh: 15 } },
  { id: "chess-deep", script: "gen-chess-deep.mjs", npmName: "gen:chess-deep", kind: "local",
    // Reads the gitignored lichess cache gen-chess-stats.mjs writes, not a
    // committed file — a real dependency its own header comment names.
    inputs: [".chess-cache/lichess-games.json"], outputs: ["src/data/chessDeep.ts"], stages: { refresh: 16 } },

  { id: "archive-text", script: "gen-archive-text.mjs", npmName: "gen:archive-text", kind: "network",
    inputs: [], outputs: ["src/data/archiveText.ts"], stages: { check: 4 } },

  // Manual/occasional: no npm alias, no stage. README documents each by name.
  { id: "store", script: "gen-store.mjs", npmName: "gen:store", kind: "network",
    inputs: [], outputs: ["src/data/store.ts"], stages: {} },
  { id: "store-archive", script: "gen-store-archive.mjs", npmName: null, kind: "network",
    inputs: [], outputs: [".store-archive-cache.json", ".store-since-cache.json"], stages: {} },
  { id: "store-siblings", script: "gen-store-siblings.mjs", npmName: null, kind: "network",
    inputs: [], outputs: [".store-siblings.json"], stages: {} },
  { id: "store-flavours", script: "gen-store-flavours.mjs", npmName: null, kind: "private-env",
    inputs: [], outputs: [".store-flavours.json"], stages: {} },
  { id: "excelsior", script: "gen-excelsior.mjs", npmName: null, kind: "network",
    inputs: [], outputs: ["src/data/excelsior.ts", "public/excelsior/pages/**"], stages: {} },
  // Manual/occasional, same posture as gen-excelsior.mjs above (its own header
  // says so): needs `tesseract` on PATH, a system binary no CI runner can be
  // assumed to have. No network call of its own — OCRs the pages the sibling
  // script above already rendered and committed.
  { id: "excelsior-text", script: "gen-excelsior-text.mjs", npmName: null, kind: "local",
    inputs: ["heavy/excelsior/pages/**"], outputs: ["heavy/excelsior/text/*.json"], stages: {} },
];

// Fold freshnessSla.ts's SLA_DAYS in as a field on the node that owns each
// named file, rather than a second table a reader has to cross-reference by
// hand. freshnessSla.ts keeps exporting SLA_DAYS/MUST_BE_STAMPED itself —
// this only adds a view, it does not move the policy.
for (const g of GENERATORS) {
  for (const out of g.outputs) {
    const base = out.split("/").pop();
    if (base in SLA_DAYS) g.slaDays = SLA_DAYS[base];
  }
}

/**
 * Kahn's algorithm over inputs/outputs, scoped to one stage. Nodes with no
 * ordering relationship break ties by their declared `stages[stage]`
 * position, so the result reads the same as the order already proven out in
 * production — this is a real topological sort, not a comment asserting one.
 */
export function stageOrder(stage) {
  const nodes = GENERATORS.filter((g) => stage in g.stages);
  const byOutput = new Map();
  for (const g of nodes) for (const out of g.outputs) byOutput.set(out, g.id);

  const indegree = new Map(nodes.map((g) => [g.id, 0]));
  const consumers = new Map(nodes.map((g) => [g.id, []]));
  for (const g of nodes) {
    for (const input of g.inputs) {
      const producerId = byOutput.get(input);
      if (producerId && producerId !== g.id) {
        consumers.get(producerId).push(g.id);
        indegree.set(g.id, indegree.get(g.id) + 1);
      }
    }
  }

  const byId = new Map(nodes.map((g) => [g.id, g]));
  const byPosition = (a, b) => a.stages[stage] - b.stages[stage];
  const ready = nodes.filter((g) => indegree.get(g.id) === 0).sort(byPosition);
  const order = [];
  while (ready.length) {
    const next = ready.shift();
    order.push(next);
    for (const consumerId of consumers.get(next.id)) {
      indegree.set(consumerId, indegree.get(consumerId) - 1);
      if (indegree.get(consumerId) === 0) {
        const pos = ready.findIndex((g) => byPosition(g, byId.get(consumerId)) > 0);
        ready.splice(pos === -1 ? ready.length : pos, 0, byId.get(consumerId));
      }
    }
  }
  if (order.length !== nodes.length) {
    const stuck = nodes.filter((g) => !order.includes(g)).map((g) => g.id);
    throw new Error(`generators.mjs: unresolved dependency (cycle?) in stage "${stage}": ${stuck.join(", ")}`);
  }
  return order;
}

/** package.json's prebuild/predev derive from this via scripts/run-pipeline.mjs. */
export const BUILD_CHAIN = stageOrder("build");

// The hermetic-build gate, mechanically enforced rather than left as a
// convention a node's placement here could quietly violate: a deploy and a
// dev boot (prebuild/predev, both scripts/run-pipeline.mjs build) must make
// zero outbound requests and leave zero dirty files, so no node with a
// network fetch, a required private env var, or a sibling-repo read/write
// may run in this stage. This throws at import time — on `npm run build`,
// on `npm test` (generators.test.mjs imports this module), and on
// check:generated — so a generator moved back into the build stage without
// also being reclassified fails immediately, everywhere, not just in CI.
for (const g of BUILD_CHAIN) {
  if (g.kind !== "local") {
    throw new Error(
      `generators.mjs: "${g.id}" is kind="${g.kind}" but is declared in the build ` +
        `stage — only kind="local" nodes may run there (prebuild/predev must make ` +
        `zero outbound requests). Move it to refresh-only or reclassify it.`,
    );
  }
}

/** refresh.mjs's STEPS derives from this (npm script names, `npm run` needs one). */
export const REFRESH_STEPS = stageOrder("refresh").map((g) => g.npmName);
/** check-generated.mjs's DETERMINISTIC derives from this (script filenames). */
export const CHECK_DETERMINISTIC = stageOrder("check").map((g) => g.script);
