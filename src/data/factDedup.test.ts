import { describe, it, expect } from "vitest";
import { projects } from "./profile.ts";
import { statLineExtras, badgesBeyondStatus, repoStatLine } from "../lib/projectStatLine.ts";

/**
 * No project card says the same fact twice.
 *
 * Each card renders three fact rows — the bracketed `status`, the generated
 * `◇` stat line, and the badge chips — and nothing kept them from echoing each
 * other. Before this, a Kursi (now Gaddi) card printed "14 modules · 4 platforms" in the
 * bracket AND again on the line directly beneath it, and PaymentsLab (now PaymentsLab-KMP) managed
 * "40 modules · 66 gateways" three times inside 200px.
 *
 * The same complaint that started this work ("showing same thing in image that
 * content also has") applied one layer down, in the text.
 */
describe("a card states each fact once", () => {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const clauses = (s: string) => s.split("·").map((x) => norm(x.trim())).filter(Boolean);

  it("finds the projects it is meant to be checking", () => {
    expect(projects.length).toBeGreaterThanOrEqual(8);
  });

  it("never repeats a status clause in the stat line", () => {
    const echoes: string[] = [];
    for (const p of projects) {
      const extra = statLineExtras(p.slug, p.status);
      if (!extra) continue;
      const known = new Set(clauses(p.status));
      for (const c of clauses(extra)) if (known.has(c)) echoes.push(`${p.slug}: "${c}"`);
    }
    expect(echoes, `stat line repeats the status: ${echoes.join(", ")}`).toEqual([]);
  });

  it("never repeats a status clause in the badges", () => {
    const echoes: string[] = [];
    for (const p of projects) {
      const known = new Set(clauses(p.status));
      for (const b of badgesBeyondStatus(p.badges, p.status)) {
        if (known.has(norm(b))) echoes.push(`${p.slug}: "${b}"`);
      }
    }
    expect(echoes, `badges repeat the status: ${echoes.join(", ")}`).toEqual([]);
  });

  it("still shows the stat line where it genuinely adds something", () => {
    // Doori's generated line carries features and screenshot counts the
    // curated status does not — dropping the whole row would lose real facts.
    expect(statLineExtras("doori", projects.find((p) => p.slug === "doori")!.status)).toContain("features");
  });

  it("drops the row entirely when every word of it was already said", () => {
    const gaddi = projects.find((p) => p.slug === "gaddi")!;
    expect(repoStatLine("gaddi")).toBeTruthy();
    expect(statLineExtras("gaddi", gaddi.status)).toBeNull();
  });
});
