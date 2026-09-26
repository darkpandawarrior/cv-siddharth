import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { openSource, upstreamMergedPRs } from "./profile.ts";
import { mifosMergedPRs } from "./careerOpsUpstream.ts";

/**
 * openSource now carries TWO unrelated upstreams (career-ops-hq/career-ops
 * and openMF/Mifos), grouped by `org` per row. This is the guard that keeps
 * the career-ops heading from ever claiming an openMF/Mifos row, the same
 * class of split candidaiNumbers.test.ts exists to catch on the single-number
 * side (a curated list quietly drifting past, or short of, the count it
 * claims to summarize).
 */
describe("openSource rows agree with the measured upstream totals", () => {
  const careerOpsRows = openSource.filter((c) => c.org === "career-ops-hq");
  const openMfRows = openSource.filter((c) => c.org === "openMF");

  it("every row carries an org", () => {
    expect(openSource.every((c) => typeof c.org === "string" && c.org.length > 0)).toBe(true);
  });

  it("never lists more career-ops rows than the measured merged total", () => {
    // A curated subset may be SHORTER than upstreamMergedPRs (it mixes in the
    // one open PR too), but never longer — see openSource.ts's own comment
    // on upstreamMergedPRs for why the two are allowed to disagree.
    expect(careerOpsRows.length).toBeLessThanOrEqual(upstreamMergedPRs);
  });

  it("counts exactly mifosMergedPRs merged openMF rows (the curated list is exhaustive here)", () => {
    expect(openMfRows.filter((c) => c.status === "merged")).toHaveLength(mifosMergedPRs);
  });

  it("labels the two open Mifos PRs as open, never merged or closed", () => {
    const byUrl = Object.fromEntries(openSource.map((c) => [c.url, c.status]));
    expect(byUrl["https://github.com/openMF/mifos-passcode-cmp/pull/82"]).toBe("open");
    expect(byUrl["https://github.com/openMF/mifos-x-actionhub/pull/89"]).toBe("open");
  });

  it("resolves every PR url to the real upstream, never a fork", () => {
    const bad = openSource.filter((c) => !/^https:\/\/github\.com\/(career-ops-hq|openMF)\/[^/]+\/pull\/\d+$/.test(c.url));
    expect(bad.map((c) => c.url)).toEqual([]);
  });
});

/**
 * Static proof for what the e2e suite would otherwise assert on the rendered
 * page (this vitest run is `environment: node`, so it never renders JSX):
 * ReposShowcase carries the two group headings career-ops and openMF render
 * from, and ResumeView's full-cut paragraph names both merged Mifos PR
 * numbers. Not e2e/smoke.spec.ts (not owned by this lane) — a source-level
 * regex catches the same regression class (a heading renamed, a PR number
 * dropped) without needing a browser.
 */
describe("the source both headings and both PR numbers render from is present", () => {
  const reposShowcase = readFileSync(new URL("../ReposShowcase.tsx", import.meta.url), "utf8");
  const resumeView = readFileSync(new URL("../ResumeView.tsx", import.meta.url), "utf8");

  it("ReposShowcase renders a career-ops heading and an openMF heading under #open-source", () => {
    expect(reposShowcase).toContain('id="open-source"');
    expect(reposShowcase).toMatch(/<h4[^>]*>career-ops<\/h4>/);
    expect(reposShowcase).toMatch(/<h4[^>]*>openMF<\/h4>/);
  });

  it("ResumeView's full-cut names both merged kmp-project-template PR numbers", () => {
    expect(resumeView).toContain("#298");
    expect(resumeView).toContain("#299");
  });
});
