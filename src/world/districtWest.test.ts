import { describe, expect, it } from "vitest";
import { experience, projects } from "../data/profile.ts";
import { CITY } from "./city.ts";
import {
  employerBlocks,
  caseStudyMonuments,
  projectTowers,
  westStructures,
  westResolveSources,
  PROP_FAMILIES,
} from "./districtWest.ts";
import { PROP_COLLISION_GROUPS } from "./collisionGroups.ts";

describe("employer blocks", () => {
  it("gives exactly one block per experience entry", () => {
    expect(employerBlocks()).toHaveLength(experience.length);
    expect(employerBlocks()).toHaveLength(4);
  });

  it("has a z-extent within 5% of max(6, span*16) — the design doc's own formula", () => {
    // Cross-checked against the design doc's own computed values, independent
    // of periodZRange's internals: Dice (Jun 2023 - Present) ~49m, Jugnoo
    // (Jan 2021 - May 2023) ~37.3m, John Deere (May 2020 - Jul 2020) clamped
    // to 6m, Neev (Apr 2026 - Present) clamped to 6m.
    for (const b of employerBlocks()) {
      const raw = b.zEnd - (b.zStart);
      expect(raw, b.company).toBeGreaterThanOrEqual(6);
      expect(raw, b.company).toBeCloseTo(b.span, 5);
    }
  });

  it("heights are 4 + points.length * 1.6 — never a number this file invents", () => {
    for (let i = 0; i < experience.length; i++) {
      const e = experience[i];
      const b = employerBlocks()[i];
      expect(b.height).toBeCloseTo(4 + e.points.length * 1.6, 5);
      expect(b.floors).toHaveLength(e.points.length);
    }
  });
});

describe("case studies", () => {
  it("gives exactly one monument per case study, every one mapped to a real employer span", () => {
    const monuments = caseStudyMonuments();
    expect(monuments).toHaveLength(5);
    // Every z must land inside SOME employer's [zStart, zEnd] range — the
    // "parent employer's mid-span" rule — never off on its own.
    const blocks = employerBlocks();
    for (const m of monuments) {
      const inSomeSpan = blocks.some((b) => m.z >= b.zStart - 0.01 && m.z <= b.zEnd + 0.01);
      expect(inSomeSpan, `${m.slug} at z=${m.z} matches no employer span`).toBe(true);
    }
  });
});

describe("project towers", () => {
  it("gives exactly one tower per project", () => {
    expect(projectTowers()).toHaveLength(projects.length);
    // Pinned as well as derived, so a project silently appearing or vanishing fails here rather
    // than quietly reshaping the city. 9 -> 8 on 2026-08-11 when cv-siddharth-kmp merged into the
    // portfolio entry: one project, one tower.
    expect(projectTowers()).toHaveLength(8);
  });

  it("never fabricates a year for an undated project", () => {
    // deadlock has no projectStats entry and no recentGrowth/openSource date
    // anywhere in the data — it must land on the undated plinth, not at a
    // guessed year.
    const deadlock = projectTowers().find((t) => t.slug === "deadlock");
    expect(deadlock).toBeDefined();
    expect(deadlock?.dated).toBe(false);
    // The undated plinth sits south of the current-year band, inside the
    // "post-2026, no data says otherwise" zone city.ts reserves for exactly
    // this — never at CITY.z1 itself (that's the honest ceiling, not a slot).
    expect(deadlock!.z).toBeLessThan(CITY.z1);
    expect(deadlock!.z).toBeGreaterThan(CITY.z1 - 40);
  });

  it("dates every projectStats-classified project inside Dice's span", () => {
    const dice = employerBlocks().find((b) => b.company === "Dice.tech")!;
    for (const slug of ["kursi", "mileway", "paymentslab"]) {
      const tower = projectTowers().find((t) => t.slug === slug)!;
      expect(tower.dated, slug).toBe(true);
      expect(tower.z, slug).toBeGreaterThanOrEqual(dice.zStart - 0.01);
      expect(tower.z, slug).toBeLessThanOrEqual(dice.zEnd + 0.01);
    }
  });

  it("heights are modules * 0.55, widths are 1.1 + min(1.6, screenshots/60)", () => {
    for (const t of projectTowers()) {
      expect(t.height).toBeCloseTo(t.modules * 0.55, 5);
      expect(t.width).toBeGreaterThanOrEqual(1.1);
      expect(t.width).toBeLessThanOrEqual(2.7);
    }
  });
});

describe("the whole west flank stays off the approach apron", () => {
  it("never places a structure at |x| < CITY.buildInner", () => {
    for (const s of westStructures()) {
      expect(Math.abs(s.x), `x=${s.x}`).toBeGreaterThanOrEqual(CITY.buildInner);
    }
  });

  it("gives gps.ts one TallStructure per employer block, case study and tower", () => {
    expect(westStructures()).toHaveLength(4 + 5 + 8); // 4 employer blocks + 5 case studies + 8 towers
  });
});

describe("site debris", () => {
  it("carries PROP_COLLISION_GROUPS on every family — asserted over the array, not by eye", () => {
    // A dynamic body missing this has shipped twice as a room a stray prop
    // could navigate a visitor into, four seconds after load, untouched.
    expect(PROP_FAMILIES.length).toBeGreaterThan(0);
    for (const family of PROP_FAMILIES) {
      expect(family.collisionGroups).toBe(PROP_COLLISION_GROUPS);
    }
  });

  it("totals 48 dynamic bodies", () => {
    const total = PROP_FAMILIES.reduce((sum, f) => sum + f.count, 0);
    expect(total).toBe(48);
  });
});

describe("structure dust", () => {
  it("only sources dust from structures at least 6m tall, ~350 points each", () => {
    const sources = westResolveSources();
    expect(sources.length).toBeGreaterThan(0);
    for (const s of sources) {
      expect(s.targets.length).toBe(350 * 3);
      expect(s.targets.length % 3).toBe(0);
    }
  });

  it("is reproducible — same id, same cloud, every call", () => {
    const a = westResolveSources();
    const b = westResolveSources();
    expect(a[0].targets).toEqual(b[0].targets);
  });
});
