import { describe, expect, it } from "vitest";
import { projects } from "./projects.ts";
import { provenIn, skills, resumeSkills } from "./skills.ts";
import { projectStats, projectStatsGeneratedAt } from "../projectStats.ts";

describe("the showcase flag", () => {
  const showcased = projects.filter((p) => p.showcase);

  it("is set on doori, gaddi and paymentslab-kmp, and only them", () => {
    expect(showcased.map((p) => p.slug).sort()).toEqual(["doori", "gaddi", "paymentslab-kmp"]);
  });

  it("never marks a project showcase without a heroShot", () => {
    for (const p of showcased) {
      expect(p.heroShot, p.slug).toBeTruthy();
    }
  });
});

describe("projectStats keys", () => {
  it("are the site's current slugs, not the pre-rename app names", () => {
    const keys = Object.keys(projectStats);
    expect(keys).toContain("doori");
    expect(keys).toContain("gaddi");
    expect(keys).toContain("paymentslab-kmp");
    for (const old of ["mileway", "kursi", "paymentslab"]) { // claim-audit:allow: lists the old names to ban them
      expect(keys, old).not.toContain(old);
    }
  });

  it("carries a freshness stamp", () => {
    expect(projectStatsGeneratedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("skills.provenIn", () => {
  it("only ever names a real registry slug", () => {
    const validSlugs = new Set(projects.map((p) => p.slug));
    for (const group of [...skills, ...resumeSkills]) {
      for (const item of group.items) {
        for (const slug of provenIn(item)) {
          expect(validSlugs.has(slug), `${item} -> ${slug}`).toBe(true);
        }
      }
    }
  });

  it("finds at least one project for a skill every KMP app actually uses", () => {
    expect(provenIn("Room (SQLite, 24 migrations)").length).toBeGreaterThan(0);
  });

  it("returns nothing for a skill no project's stack names", () => {
    expect(provenIn("Stakeholder management & roadmap planning")).toEqual([]);
  });
});
