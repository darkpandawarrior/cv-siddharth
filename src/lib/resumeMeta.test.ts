import { describe, it, expect } from "vitest";
import { concurrentCompanies, currentRoles, buildResumeJsonLd } from "./resumeMeta";

describe("currentRoles", () => {
  it("keeps only entries whose period ends with Present", () => {
    const exp = [
      { period: "Apr 2026 - Present" },
      { period: "Jan 2021 - May 2023" },
    ];
    expect(currentRoles(exp)).toEqual([{ period: "Apr 2026 - Present" }]);
  });
});

describe("concurrentCompanies", () => {
  it("flags every company still marked Present when more than one is", () => {
    const exp = [
      { company: "A", period: "Apr 2026 - Present" },
      { company: "B", period: "Jun 2023 - Present" },
      { company: "C", period: "Jan 2021 - May 2023" },
    ];
    expect(concurrentCompanies(exp)).toEqual(["A", "B"]);
  });

  it("returns a single entry when only one role is current (caller gates on length > 1)", () => {
    expect(concurrentCompanies([{ company: "A", period: "2023 - Present" }])).toEqual(["A"]);
  });
});

describe("buildResumeJsonLd", () => {
  it("builds a Person schema whose worksFor matches the live current roles", () => {
    const ld = buildResumeJsonLd();
    expect(ld["@type"]).toBe("Person");
    expect(ld.url).toBe("https://cv-siddharth.vercel.app/resume");
    expect(Array.isArray(ld.worksFor)).toBe(true);
    expect((ld.worksFor as Array<{ name: string }>).length).toBeGreaterThan(0);
  });
});
