import { describe, it, expect } from "vitest";
import { buildCiSegments, changedSlugs, ciPassSummary, CI_FAMILY_SLUGS } from "./familyCi.ts";
import type { SignalsResponse } from "../../../../api/_lib/signals-handler.ts";

const ALL_PASS = Object.fromEntries(
  CI_FAMILY_SLUGS.map((slug) => [slug, { state: "pass", newestAt: "2026-09-24T00:00:00Z", failing: [] }]),
) as unknown as SignalsResponse["ci"];

describe("buildCiSegments", () => {
  it("draws nothing when the whole feed is down", () => {
    expect(buildCiSegments(null)).toEqual([]);
  });

  it("one segment per family repo, evenly split", () => {
    const segments = buildCiSegments(ALL_PASS);
    expect(segments).toHaveLength(CI_FAMILY_SLUGS.length);
    expect(segments.every((s) => s.status === "pass")).toBe(true);
    const totalArc = segments.reduce((sum, s) => sum + s.angleLength, 0);
    // Less than a full turn -- the gaps between segments are real, not
    // filled by widening the segments to compensate.
    expect(totalArc).toBeLessThan(Math.PI * 2);
  });

  it("maps a mixed feed's states to pass/fail/unknown", () => {
    const mixed = {
      ...ALL_PASS,
      gaddi: { state: "fail", newestAt: "t", failing: ["Quality Gate"] },
      "kmp-toolkit": { state: "none", newestAt: null, failing: [] },
    } as SignalsResponse["ci"];
    const segments = buildCiSegments(mixed);
    expect(segments.find((s) => s.slug === "gaddi")!.status).toBe("fail");
    expect(segments.find((s) => s.slug === "kmp-toolkit")!.status).toBe("unknown");
    expect(segments.find((s) => s.slug === "doori")!.status).toBe("pass");
  });
});

describe("changedSlugs", () => {
  it("flags nothing against a null previous snapshot (nothing to diff yet)", () => {
    expect(changedSlugs(null, buildCiSegments(ALL_PASS)).size).toBe(0);
  });

  it("flags exactly the slug whose status flipped", () => {
    const before = buildCiSegments(ALL_PASS);
    const afterMixed = { ...ALL_PASS, doori: { state: "fail", newestAt: "t", failing: ["build"] } } as SignalsResponse["ci"];
    const after = buildCiSegments(afterMixed);
    expect([...changedSlugs(before, after)]).toEqual(["doori"]);
  });

  it("flags nothing when nothing changed", () => {
    const segments = buildCiSegments(ALL_PASS);
    expect(changedSlugs(segments, segments).size).toBe(0);
  });
});

describe("ciPassSummary", () => {
  it("counts pass out of the family total", () => {
    expect(ciPassSummary(ALL_PASS)).toEqual({ pass: 5, total: 5 });
  });

  it("is null when the feed is down", () => {
    expect(ciPassSummary(null)).toBeNull();
  });
});
