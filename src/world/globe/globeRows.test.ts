import { describe, it, expect } from "vitest";
import { globeFacts, liveDotsLabel, REACH_INSTALLS_CLAIM, REACH_UPSTREAM_CLAIM } from "./globeRows.ts";

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

  it("states the employer-marker resolution as N of M, never a bare count", () => {
    const row = globeFacts.find((r) => r.id === "employer-marker")!;
    expect(row.label).toMatch(/^City markers: \d+ of \d+ mapped/);
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
