import { describe, it, expect } from "vitest";
import { globeFacts, liveDotsLabel, weeksAgoLabel, REACH_INSTALLS_CLAIM, REACH_UPSTREAM_CLAIM } from "./globeRows.ts";
import { fleetStats } from "../../data/store.ts";

describe("globeFacts", () => {
  it("carries the exact reach-column claim sentences (living-ledger-spec.md#6.3)", () => {
    expect(REACH_INSTALLS_CLAIM).toBe("install floor across 88 live listings (Play's own install bands, summed as floors)");
    expect(REACH_UPSTREAM_CLAIM).toBe("24 merged PRs in a repository starred 71k+ times");
  });

  it("every row carries a number and an EvidenceChip source (G8: a number always sits beside its chip)", () => {
    for (const row of globeFacts) {
      expect(row.label).toMatch(/\d/);
      expect(row.file.length).toBeGreaterThan(0);
      expect(row.source.length).toBeGreaterThan(0);
    }
  });

  it("formats the install-floor number en-IN (lakh grouping), not en-US (data.md #1)", () => {
    const row = globeFacts.find((r) => r.id === "reach-installs")!;
    expect(fleetStats.installFloor.toLocaleString("en-IN")).toBe("29,17,170");
    expect(row.label).toContain("29,17,170");
    expect(row.label).not.toContain("2,917,170");
  });

  it("does NOT bake '(N weeks ago)' into the static label (task Z1: that used to be a hydration-mismatch trap - GlobePanel/puneSelection append it once a real clock exists)", () => {
    const row = globeFacts.find((r) => r.id === "reach-installs")!;
    expect(row.label).not.toMatch(/\(\d+ weeks? ago\)/);
  });

  it("states the employer-marker resolution as N of M, never a bare count", () => {
    const row = globeFacts.find((r) => r.id === "employer-marker")!;
    expect(row.label).toMatch(/^City markers: \d+ of \d+ mapped/);
  });
});

describe("weeksAgoLabel (break-it, G15: the guard must actually fire)", () => {
  it("54 days later reads '7 weeks ago' (data.md #6's own worked example)", () => {
    expect(weeksAgoLabel("2026-08-07", new Date("2026-09-30T00:00:00Z"))).toBe("7 weeks ago");
  });

  it("under a week old reads as a floor phrase, never '0 weeks ago'", () => {
    expect(weeksAgoLabel("2026-09-28", new Date("2026-09-30T00:00:00Z"))).toBe("less than a week ago");
  });

  it("exactly one week uses the singular", () => {
    expect(weeksAgoLabel("2026-09-23", new Date("2026-09-30T00:00:00Z"))).toBe("1 week ago");
  });
});

describe("liveDotsLabel (break-it, G15: the guard must actually fire)", () => {
  it("two presences from two countries reads '2 here now, from 2 countries'", () => {
    expect(liveDotsLabel({ IN: 1, US: 1 })).toBe("2 here now, from 2 countries");
  });

  it("one country, plural count, singular 'country'", () => {
    expect(liveDotsLabel({ IN: 3 })).toBe("3 here now, from 1 country");
  });

  it("no presences at all reads as nobody, not '0 here now'", () => {
    expect(liveDotsLabel({})).toBe("no one else here right now");
  });
});
