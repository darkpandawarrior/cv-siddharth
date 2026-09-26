import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { countPrs, buildStats, REPOS } from "./gen-oss-stats.mjs";

// Recorded once with `gh pr list --repo <repo> --author darkpandawarrior
// --state all --limit 500 --json number,state,mergedAt,title,url`, trimmed to
// the fields countPrs actually reads (number kept for readability only).
// career-ops-hq/career-ops: 24 merged, 1 open, 2 closed-unmerged.
const CAREER_OPS_PRS = [
  { number: 3302, state: "OPEN" },
  ...Array.from({ length: 24 }, (_, i) => ({ number: 4000 + i, state: "MERGED" })),
  { number: 1148, state: "CLOSED" },
  { number: 913, state: "CLOSED" },
];
// openMF/kmp-project-template: 2 merged, 1 closed-unmerged, 0 open.
const KMP_TEMPLATE_PRS = [
  { number: 299, state: "MERGED" },
  { number: 298, state: "MERGED" },
  { number: 263, state: "CLOSED" },
];
// openMF/mifos-passcode-cmp: 1 open, nothing else.
const PASSCODE_PRS = [{ number: 82, state: "OPEN" }];
// openMF/mifos-x-actionhub: 1 open, nothing else.
const ACTIONHUB_PRS = [{ number: 89, state: "OPEN" }];

const FIXTURES = {
  "career-ops-hq/career-ops": CAREER_OPS_PRS,
  "openMF/kmp-project-template": KMP_TEMPLATE_PRS,
  "openMF/mifos-passcode-cmp": PASSCODE_PRS,
  "openMF/mifos-x-actionhub": ACTIONHUB_PRS,
};

describe("countPrs", () => {
  it("splits a repo's PRs into merged/open/closedUnmerged by state", () => {
    expect(countPrs(CAREER_OPS_PRS)).toEqual({ merged: 24, open: 1, closedUnmerged: 2 });
    expect(countPrs(KMP_TEMPLATE_PRS)).toEqual({ merged: 2, open: 0, closedUnmerged: 1 });
    expect(countPrs(PASSCODE_PRS)).toEqual({ merged: 0, open: 1, closedUnmerged: 0 });
  });

  // Break-it fixture (G15): a MERGED pr with mergedAt present must still be
  // counted by `state`, not by the presence of mergedAt — a PR the API
  // returns as CLOSED (not MERGED) can still carry a truthy field from a
  // stale cache in some callers, and this asserts the branch is state-first.
  it("never double-counts a CLOSED PR as merged", () => {
    expect(countPrs([{ number: 1, state: "CLOSED", mergedAt: null }])).toEqual({ merged: 0, open: 0, closedUnmerged: 1 });
  });
});

describe("buildStats", () => {
  const repoResults = REPOS.map(({ repo, org }) => ({ repo, org, prs: FIXTURES[repo] }));
  const { upstreamStats, upstreamMergedPRs, mifosMergedPRs } = buildStats(repoResults, "2026-09-24");

  it("produces exactly the measured upstreamStats, in REPOS order", () => {
    expect(upstreamStats).toEqual([
      { repo: "career-ops-hq/career-ops", org: "career-ops-hq", merged: 24, open: 1, closedUnmerged: 2, measuredAt: "2026-09-24" },
      { repo: "openMF/kmp-project-template", org: "openMF", merged: 2, open: 0, closedUnmerged: 1, measuredAt: "2026-09-24" },
      { repo: "openMF/mifos-passcode-cmp", org: "openMF", merged: 0, open: 1, closedUnmerged: 0, measuredAt: "2026-09-24" },
      { repo: "openMF/mifos-x-actionhub", org: "openMF", merged: 0, open: 1, closedUnmerged: 0, measuredAt: "2026-09-24" },
    ]);
  });

  it("sums upstreamMergedPRs from career-ops-hq/career-ops only", () => {
    expect(upstreamMergedPRs).toBe(24);
  });

  it("sums mifosMergedPRs across every openMF repo", () => {
    expect(mifosMergedPRs).toBe(2); // kmp-project-template's 2; passcode and actionhub have none merged
  });
});

/**
 * End-to-end: a failing `gh` must leave both committed files byte-identical
 * and exit 0 — never a degraded write, never a non-zero exit that would fail
 * `npm run refresh` over a laptop with no GitHub CLI on PATH. Sandboxed the
 * same way gen-weeb.test.mjs sandboxes its generator: copy the real script
 * into a scratch dir mirroring the same relative paths, so it never touches
 * the actual repo files.
 */
describe("gh unavailable", () => {
  it("leaves openSource.ts (and careerOpsUpstream.ts) untouched and exits 0", () => {
    const root = mkdtempSync(join(tmpdir(), "gen-oss-stats-"));
    try {
      mkdirSync(join(root, "scripts"), { recursive: true });
      mkdirSync(join(root, "src/data/profile"), { recursive: true });
      copyFileSync(new URL("gen-oss-stats.mjs", import.meta.url), join(root, "scripts/gen-oss-stats.mjs"));

      const upstreamPath = join(root, "src/data/careerOpsUpstream.ts");
      const openSourcePath = join(root, "src/data/profile/openSource.ts");
      const upstreamFixture =
        `export interface UpstreamStat { repo: string; org: string; merged: number; open: number; closedUnmerged: number; measuredAt: string; }\n` +
        `export const upstreamStats: UpstreamStat[] = [\n  { "repo": "x", "org": "y", "merged": 1, "open": 0, "closedUnmerged": 0, "measuredAt": "2020-01-01" }\n];\n` +
        `export const mifosMergedPRs = 1;\n`;
      const openSourceFixture = `export const upstreamMergedPRs = 1;\n`;
      writeFileSync(upstreamPath, upstreamFixture);
      writeFileSync(openSourcePath, openSourceFixture);

      const result = spawnSync(process.execPath, [join(root, "scripts/gen-oss-stats.mjs")], {
        env: { ...process.env, GEN_OSS_STATS_FAIL: "1" },
        encoding: "utf8",
        timeout: 12000,
      });

      expect(result.status).toBe(0);
      expect(readFileSync(upstreamPath, "utf8")).toBe(upstreamFixture);
      expect(readFileSync(openSourcePath, "utf8")).toBe(openSourceFixture);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 20000);
});
