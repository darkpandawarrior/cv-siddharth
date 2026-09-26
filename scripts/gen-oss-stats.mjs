// scripts/gen-oss-stats.mjs
/**
 * Measures merged/open/closed PR counts per upstream repo via
 * `gh pr list --repo <repo> --author darkpandawarrior --state all`, not the
 * search API: after career-ops's own repo rename the search API does not
 * follow it and returns total_count 0 on the old path — the same trap
 * gen-candidai-stats.mjs's prCount() comment documents on that code path.
 *
 * Four repos, two unrelated upstreams: career-ops-hq/career-ops (the public
 * job-search engine) and three openMF/Mifos repos (kmp-project-template,
 * mifos-passcode-cmp, mifos-x-actionhub) — every repo he has actually opened
 * a PR against, not every repo he has forked.
 *
 * Writes:
 *   - src/data/careerOpsUpstream.ts: upstreamStats (all four, in REPOS order)
 *     and mifosMergedPRs (the openMF org's merged total).
 *   - src/data/profile/openSource.ts: upstreamMergedPRs (career-ops-hq/career-ops
 *     merged total only — openMF has its own separate total so one upstream's
 *     drift can never hide inside the other's number).
 * The curated `openSource` Contribution rows themselves are hand-maintained
 * (see that file's comment on why the array is a shorter, curated subset of
 * the measured total) — this script only refreshes the three counts above.
 *
 * House generator contract (gen-timeline.mjs, gen-candidai-stats.mjs): a
 * missing `gh`, missing auth, or any command failure NEVER fails the build
 * and NEVER writes a degraded file — the previous committed numbers are left
 * exactly as they were, and the script exits 0 so a doctor sweep doesn't open
 * an issue over a laptop with no GitHub CLI on PATH.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const careerOpsUpstreamPath = join(root, "src", "data", "careerOpsUpstream.ts");
const openSourcePath = join(root, "src", "data", "profile", "openSource.ts");

/** Fixed order: career-ops first, then the three openMF/Mifos repos, so a
 *  re-run never reshuffles upstreamStats for no reason. */
export const REPOS = [
  { repo: "career-ops-hq/career-ops", org: "career-ops-hq" },
  { repo: "openMF/kmp-project-template", org: "openMF" },
  { repo: "openMF/mifos-passcode-cmp", org: "openMF" },
  { repo: "openMF/mifos-x-actionhub", org: "openMF" },
];

/** Pure: one repo's `gh pr list --json number,state,mergedAt,...` array ->
 *  its {merged, open, closedUnmerged} counts. Exported so the test can feed
 *  it the recorded fixtures directly, with no `gh` on PATH. */
export function countPrs(prs) {
  let merged = 0, open = 0, closedUnmerged = 0;
  for (const pr of prs) {
    if (pr.state === "MERGED") merged++;
    else if (pr.state === "OPEN") open++;
    else if (pr.state === "CLOSED") closedUnmerged++;
  }
  return { merged, open, closedUnmerged };
}

/** Pure: {repo, org, prs}[] plus a measuredAt stamp -> upstreamStats[] and
 *  the two named totals this script writes. Exported for the same reason as
 *  countPrs — the whole shape a fixture-fed test needs to assert on, with no
 *  filesystem or network access. */
export function buildStats(repoResults, measuredAt) {
  const upstreamStats = repoResults.map(({ repo, org, prs }) => {
    const { merged, open, closedUnmerged } = countPrs(prs);
    return { repo, org, merged, open, closedUnmerged, measuredAt };
  });
  const upstreamMergedPRs = upstreamStats.find((s) => s.repo === "career-ops-hq/career-ops")?.merged ?? 0;
  const mifosMergedPRs = upstreamStats.filter((s) => s.org === "openMF").reduce((n, s) => n + s.merged, 0);
  return { upstreamStats, upstreamMergedPRs, mifosMergedPRs };
}

// GEN_OSS_STATS_FAIL: test-only fault injection, same shape as
// gen-weeb.mjs's FAIL_LOOKUP — lets the "gh unavailable" path be exercised
// deterministically without relying on PATH tricks that behave differently
// across CI images.
function fetchPrs(repo) {
  if (process.env.GEN_OSS_STATS_FAIL === "1") throw new Error("forced failure (test)");
  const json = execFileSync(
    "gh",
    ["pr", "list", "--repo", repo, "--author", "darkpandawarrior", "--state", "all", "--limit", "500", "--json", "number,state,mergedAt,title,url"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  return JSON.parse(json);
}

// Only runs the network/gh path when executed directly — importing the pure
// functions above for a test never shells out.
if (import.meta.url === `file://${process.argv[1]}`) {
  // Date-only, not a full timestamp: two runs on the same day must be
  // byte-identical (this file's committed output is diffed like any other),
  // the same granularity gen-lanes.mjs's lanesGeneratedAt already uses.
  const measuredAt = new Date().toISOString().slice(0, 10);
  let stats;
  try {
    const repoResults = REPOS.map(({ repo, org }) => ({ repo, org, prs: fetchPrs(repo) }));
    stats = buildStats(repoResults, measuredAt);
  } catch (err) {
    // gh missing, unauthenticated or rate-limited: a network blip, never a
    // repo bug. Leave both committed files exactly as they are and exit 0 so
    // a doctor sweep doesn't open an issue over a laptop with no GitHub CLI.
    console.warn("[gen-oss-stats] gh unavailable or failed, leaving committed numbers untouched —", err.message);
    process.exit(0);
  }
  const { upstreamStats, upstreamMergedPRs, mifosMergedPRs } = stats;

  // A dead regex here IS a repo bug (the two files' shape moved under this
  // script), same distinction gen-candidai-stats.mjs draws between a fetch
  // failure (warn, exit 0) and a dead pattern (exitCode 1) — so `npm run
  // refresh` says so instead of silently freezing these numbers forever.
  const statsRe = /export const upstreamStats: UpstreamStat\[\] = \[[\s\S]*?\n\];/;
  const mifosRe = /export const mifosMergedPRs = \d+;/;
  const mergedRe = /export const upstreamMergedPRs = \d+;/;
  const upstreamSrc = readFileSync(careerOpsUpstreamPath, "utf8");
  const openSourceSrc = readFileSync(openSourcePath, "utf8");
  const misses = [];
  if (!statsRe.test(upstreamSrc)) misses.push(`${statsRe} (careerOpsUpstream.ts)`);
  if (!mifosRe.test(upstreamSrc)) misses.push(`${mifosRe} (careerOpsUpstream.ts)`);
  if (!mergedRe.test(openSourceSrc)) misses.push(`${mergedRe} (openSource.ts)`);
  if (misses.length) {
    console.error(`[gen-oss-stats] dead pattern(s), leaving committed numbers untouched:\n  ${misses.join("\n  ")}`);
    process.exitCode = 1;
  } else {
    writeFileSync(
      careerOpsUpstreamPath,
      upstreamSrc
        .replace(statsRe, `export const upstreamStats: UpstreamStat[] = ${JSON.stringify(upstreamStats, null, 2)};`)
        .replace(mifosRe, `export const mifosMergedPRs = ${mifosMergedPRs};`),
    );
    writeFileSync(openSourcePath, openSourceSrc.replace(mergedRe, `export const upstreamMergedPRs = ${upstreamMergedPRs};`));
    console.log(`[gen-oss-stats] career-ops=${upstreamMergedPRs} merged, openMF=${mifosMergedPRs} merged`);
  }
}
