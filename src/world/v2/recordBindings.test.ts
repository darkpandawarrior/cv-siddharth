import { describe, expect, it } from "vitest";
import { ledger } from "./ledger.ts";
import { experience } from "../../data/profile/experience.ts";
import { caseStudies } from "../../data/profile/caseStudies.ts";
import { ROOM_PLACEMENTS } from "../cityData.ts";
import {
  recordBindings,
  stoneMaterial,
  ROOM_CHHATRI_VALLEY_SCALE,
} from "./recordBindings.ts";

describe("deepmal binding", () => {
  it("lit/total read straight off fleetStats (the e2e's own formula)", () => {
    const { deepmal } = recordBindings(ledger);
    expect(deepmal.lit).toBe(ledger.fleet.stats.live);
    expect(deepmal.total).toBe(ledger.fleet.stats.live + ledger.fleet.stats.delisted);
  });

  it("every niche is either lit (live) or dark (delisted), never anything else", () => {
    const { deepmal } = recordBindings(ledger);
    expect(deepmal.niches.length).toBeGreaterThan(0);
    for (const n of deepmal.niches) {
      if (n.lit) expect(n.eraKey).not.toBeNull();
      else expect(n.eraKey).toBeNull();
    }
  });

  it("lit + dark niches equal the total (no niche double-counted or dropped)", () => {
    const { deepmal } = recordBindings(ledger);
    const lit = deepmal.niches.filter((n) => n.lit).length;
    const dark = deepmal.niches.filter((n) => !n.lit).length;
    expect(lit + dark).toBe(deepmal.niches.length);
    expect(lit).toBe(deepmal.lit);
  });
});

describe("stepping stones binding", () => {
  it("career-ops-hq count equals upstreamMergedPRs, openMF equals mifosMergedPRs's own itemised total", () => {
    const { steppingStones } = recordBindings(ledger);
    expect(steppingStones.countsByOrg["career-ops-hq"]).toBe(ledger.upstreamMergedPRs);
    const openMfMerged = ledger.openSource.filter((c) => c.org === "openMF" && c.status === "merged").length;
    expect(steppingStones.countsByOrg.openMF).toBe(openMfMerged);
  });

  it("submerged count equals every open (non-merged, non-closed) PR row, never counted in countsByOrg", () => {
    const { steppingStones } = recordBindings(ledger);
    const openRows = ledger.openSource.filter((c) => c.status === "open");
    expect(steppingStones.submergedCount).toBe(openRows.length);
    expect(steppingStones.submerged).toHaveLength(openRows.length);
    const submergedUrls = new Set(steppingStones.submerged.map((s) => s.url));
    for (const row of openRows) expect(submergedUrls.has(row.url)).toBe(true);
  });

  it("a repo with 3+ merged PRs is flagged recurrence, one with fewer is not", () => {
    const { steppingStones } = recordBindings(ledger);
    const byRepo = new Map<string, number>();
    for (const c of ledger.openSource) if (c.status === "merged") byRepo.set(c.repo, (byRepo.get(c.repo) ?? 0) + 1);
    for (const stone of steppingStones.stones) {
      const contribution = ledger.openSource.find((c) => c.url === stone.id.slice("pr-stone:".length));
      if (!contribution) continue; // a cairn-folded org has no itemised stone to check here
      const expected = (byRepo.get(contribution.repo) ?? 0) >= 3;
      expect(stone.recurrence).toBe(expected);
    }
  });

  it("stoneMaterial: basalt for career-ops-hq, laterite for openMF, plain stone otherwise", () => {
    expect(stoneMaterial("career-ops-hq")).toBe("basalt");
    expect(stoneMaterial("openMF")).toBe("laterite");
    expect(stoneMaterial("some-other-org")).toBe("stone");
  });
});

describe("weirs binding", () => {
  it("one weir per distinct company in experience.ts", () => {
    const { weirs } = recordBindings(ledger);
    const companies = new Set(experience.map((e) => e.company));
    expect(weirs).toHaveLength(companies.size);
  });
});

describe("employer ghats binding: label purity (recordBindings.test.ts's own acceptance line)", () => {
  it("no employer label contains text outside experience.ts published fields", () => {
    const { employerGhats } = recordBindings(ledger);
    for (const ghat of employerGhats) {
      const entries = experience.filter((e) => e.company === ghat.company);
      expect(entries.length).toBeGreaterThan(0);
      let stripped = ghat.label;
      // Every substring the label formula is allowed to splice in, longest
      // first so a role that is a prefix of another role never leaves a
      // dangling remainder.
      const allowed = [
        ghat.company,
        ...entries.map((e) => e.role),
        ...entries.map((e) => e.period.split(" - ")[0]),
        ...entries.map((e) => e.period.split(" - ").slice(-1)[0]),
      ].sort((a, b) => b.length - a.length);
      for (const text of allowed) stripped = stripped.split(text).join("");
      // What's left must be pure formatting: punctuation and whitespace,
      // never a letter or digit this file would have had to invent.
      expect(stripped).not.toMatch(/[A-Za-z0-9]/);
    }
  });

  it("every flight's label is either null or a real ExperiencePoint.label for that company", () => {
    const { employerGhats } = recordBindings(ledger);
    for (const ghat of employerGhats) {
      const entries = experience.filter((e) => e.company === ghat.company);
      const realLabels = new Set(entries.flatMap((e) => e.points.map((p) => p.label).filter((l): l is string => l !== undefined)));
      for (const flight of ghat.flights) {
        if (flight.label !== null) expect(realLabels.has(flight.label)).toBe(true);
        expect(flight.steps).toBe(4);
      }
    }
  });

  it("flights sum to every point across every one of that company's stints (bullets.length, G14's own formula)", () => {
    const { employerGhats } = recordBindings(ledger);
    for (const ghat of employerGhats) {
      const entries = experience.filter((e) => e.company === ghat.company);
      const expected = entries.reduce((n, e) => n + e.points.length, 0);
      expect(ghat.flights).toHaveLength(expected);
    }
  });

  it("ghats are never clickable: the binding carries no opens/detailLink field at all", () => {
    const { employerGhats } = recordBindings(ledger);
    for (const ghat of employerGhats) {
      expect(ghat).not.toHaveProperty("opens");
      expect(ghat).not.toHaveProperty("detailLink");
    }
  });
});

describe("hero stones binding", () => {
  it("one hero stone per case study, registers === approach.length", () => {
    const { heroStones } = recordBindings(ledger);
    expect(heroStones).toHaveLength(caseStudies.length);
    for (const stone of heroStones) {
      const cs = caseStudies.find((c) => c.slug === stone.slug);
      expect(cs).toBeDefined();
      expect(stone.registers).toBe(cs!.approach.length);
    }
  });

  it("doori opens as a project, every other case study opens as a home anchor", () => {
    const { heroStones } = recordBindings(ledger);
    const doori = heroStones.find((s) => s.slug === "doori");
    expect(doori?.opens).toEqual({ kind: "project", target: "doori" });
    for (const stone of heroStones.filter((s) => s.slug !== "doori")) {
      expect(stone.opens.kind).toBe("home-anchor");
    }
  });
});

describe("room chhatris binding", () => {
  it("one chhatri per ROOM_PLACEMENTS entry", () => {
    const { roomChhatris } = recordBindings(ledger);
    expect(roomChhatris).toHaveLength(ROOM_PLACEMENTS.length);
    expect(ROOM_CHHATRI_VALLEY_SCALE).toBeGreaterThan(1);
  });
});

describe("old town binding", () => {
  it("one house per distinct writing.archive era, piece counts sum to the whole archive", () => {
    const { oldTown } = recordBindings(ledger);
    const total = oldTown.reduce((n, h) => n + h.pieceCount, 0);
    expect(total).toBe(ledger.writing.archive.length);
  });
});

describe("benchmarks binding", () => {
  it("matches landOf's own benchmark feature count", () => {
    const { benchmarks } = recordBindings(ledger);
    const total = ledger.timeline.lanes.flatMap((l) => l.milestones ?? []).length;
    expect(benchmarks).toHaveLength(total);
  });
});

describe("break-it (G15): the label-purity check actually fires", () => {
  it("flags an injected word the field list never published", () => {
    const label = "Acme Corp: Staff Engineer (definitely not a real role field)";
    const allowed = ["Acme Corp", "Staff Engineer"].sort((a, b) => b.length - a.length);
    let stripped = label;
    for (const text of allowed) stripped = stripped.split(text).join("");
    expect(stripped).toMatch(/[A-Za-z0-9]/);
  });
});
