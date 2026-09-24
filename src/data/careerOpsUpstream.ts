/**
 * Facts about the public upstreams he contributes to, on their own so that
 * both ends of the site can read them.
 *
 * They belong in profile.ts by subject and cannot live there by structure:
 * profile.ts re-exports siteRooms from surfaces.ts, surfaces.ts imports
 * labs.ts, and labs.ts needs the provider count for its Fan-out tab. Importing
 * profile.ts from labs.ts closes that ring, and the module that loses the race
 * reads LAB_TABS as undefined at import time — a blank page, not a type error.
 * This file imports nothing, so it cannot be part of any cycle.
 *
 * providerCount and upstreamStars are refreshed by scripts/gen-candidai-stats.mjs,
 * which anchors on the whole declaration line. The PR count stays in
 * profile/openSource.ts because the résumé already imports it from there.
 *
 * upstreamStats and mifosMergedPRs are refreshed by
 * scripts/gen-oss-stats.mjs (a second, per-upstream generator — see its
 * own header for why it is not folded into gen-candidai-stats.mjs), which
 * measures every upstream with `gh pr list`, never the search API: that API
 * does not follow career-ops's own repo rename and returns 0 on the old path
 * (see gen-candidai-stats.mjs's prCount() comment for the same trap measured
 * on the old code path).
 */

/** ATS and job-board provider modules in the upstream `providers/` directory. */
export const providerCount = 89;

/** Rounded down, because the exact figure is wrong within the hour and "68k+"
 *  is not. Stars only climb on a live repo, so the generator reads a SMALLER
 *  value as a rate-limited response rather than as news. */
export const upstreamStars = "71k+";

export interface UpstreamStat {
  repo: string;
  org: string;
  merged: number;
  open: number;
  closedUnmerged: number;
  measuredAt: string;
}

/** Measured per upstream with `gh pr list --repo <repo> --author darkpandawarrior
 *  --state all`, one row per repo he has actually opened a PR against — not
 *  every repo he has forked. Order is fixed (career-ops first, then the three
 *  openMF/Mifos repos) so a re-run never reshuffles the array for no reason. */
export const upstreamStats: UpstreamStat[] = [
  {
    "repo": "career-ops-hq/career-ops",
    "org": "career-ops-hq",
    "merged": 24,
    "open": 1,
    "closedUnmerged": 2,
    "measuredAt": "2026-09-24"
  },
  {
    "repo": "openMF/kmp-project-template",
    "org": "openMF",
    "merged": 2,
    "open": 0,
    "closedUnmerged": 1,
    "measuredAt": "2026-09-24"
  },
  {
    "repo": "openMF/mifos-passcode-cmp",
    "org": "openMF",
    "merged": 0,
    "open": 1,
    "closedUnmerged": 0,
    "measuredAt": "2026-09-24"
  },
  {
    "repo": "openMF/mifos-x-actionhub",
    "org": "openMF",
    "merged": 0,
    "open": 1,
    "closedUnmerged": 0,
    "measuredAt": "2026-09-24"
  }
];

/** Merged PRs summed across every openMF/Mifos upstream repo above —
 *  kmp-project-template's 2 today; mifos-passcode-cmp and mifos-x-actionhub
 *  have none merged yet, both still open. See openSource.ts's comment on
 *  upstreamMergedPRs for why a measured total and the curated `openSource`
 *  array are allowed to disagree in length. */
export const mifosMergedPRs = 2;
