import { describe, expect, it } from "vitest";
import { projects, kmpFamilyModuleClaims } from "./projects.ts";
import { provenIn, skills, resumeSkills } from "./skills.ts";
import { projectStats, projectStatsGeneratedAt, kmpAdoption } from "../projectStats.ts";
import { kmpGraph } from "../kmpGraph.ts";
import { paymentStats } from "../../lib/projectStatLine.ts";

/** The measured substitutedModules list for an app named in the kmp-family
 *  prose. doori/gaddi/paymentslab-kmp live on projectStats; candidai and
 *  the portfolio twin live on the separate kmpAdoption export instead
 *  (see projectStats.ts's own docstring for why). */
function substitutedModulesOf(app: string): readonly string[] {
  if (app === "candidai" || app === "portfolio") return kmpAdoption[app].substitutedModules;
  const stats = projectStats[app as keyof typeof projectStats] as { substitutedModules?: readonly string[] };
  return stats?.substitutedModules ?? [];
}

/** Throws naming the first module a claims map states an app uses that the
 *  measured registry never substituted for it. */
function assertClaimsAreSubstituted(claims: Record<string, string[]>): void {
  for (const [app, modules] of Object.entries(claims)) {
    const real = substitutedModulesOf(app);
    for (const module of modules) {
      if (!real.includes(module)) {
        throw new Error(`kmp-family prose claims ${app} uses ${module}, but it is not in ${app}'s substitutedModules`);
      }
    }
  }
}

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

describe("kmp-family prose module claims", () => {
  it("matches the measured substitutedModules for every app the prose names (real registry)", () => {
    expect(() => assertClaimsAreSubstituted(kmpFamilyModuleClaims)).not.toThrow();
  });

  it("fails when the prose claims a module the app never substituted (break-it)", () => {
    const bad = { ...kmpFamilyModuleClaims, doori: [...kmpFamilyModuleClaims.doori, "bots-policy"] };
    expect(() => assertClaimsAreSubstituted(bad)).toThrow(/doori uses bots-policy/);
  });

  it("names no module as a first-consumer gap once it has a real consumer", () => {
    // Every module a substitutedModules list names for some app must not
    // also appear in kmp-family's "still finding a first consumer" prose.
    const kmpFamily = projects.find((p) => p.slug === "kmp-family");
    const proseText = [
      ...(kmpFamily?.highlights ?? []),
      kmpFamily?.detail?.overview ?? "",
      ...(kmpFamily?.detail?.sections.map((s) => s.body) ?? []),
    ].join("\n");
    const adopted = new Set(Object.values(kmpFamilyModuleClaims).flat());
    for (const module of adopted) {
      const stillFinding = new RegExp(`[Ss]till finding a first consumer:[^.]*\\b${module}\\b`);
      expect(stillFinding.test(proseText), module).toBe(false);
    }
  });
});

describe("paymentslab-kmp's provider gateway count", () => {
  // Same definition projects.ts uses (kmpGraph.modules' trailing
  // foundation.providerModules entries are kmp-toolkit's provider catalog),
  // rederived here independently so a hand-typed literal creeping back into
  // projects.ts fails this test instead of only being caught by eye.
  const providerIds = new Set(kmpGraph.modules.slice(-projectStats.foundation.providerModules).map((m) => m.id));
  const counted = paymentStats.substitutedModules.filter((m) => providerIds.has(m)).length;

  it("is a real subset of kmp-toolkit's provider catalog, not zero and not all of it", () => {
    expect(counted).toBeGreaterThan(0);
    expect(counted).toBeLessThanOrEqual(projectStats.foundation.providerModules);
  });

  it("equals what the paymentslab-kmp prose states (test computes it)", () => {
    const kmp = projects.find((p) => p.slug === "paymentslab-kmp");
    const body = kmp?.detail?.sections.map((s) => s.body).join("\n") ?? "";
    expect(body).toContain(`(${counted} of kmp-toolkit's ${projectStats.foundation.providerModules} standalone provider gateway modules)`);
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
