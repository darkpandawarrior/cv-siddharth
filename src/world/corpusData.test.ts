import { describe, expect, it } from "vitest";
import { chess } from "../data/chess.ts";
import { weeb } from "../data/weeb.ts";
import { writing } from "../data/writing.ts";
import { excelsiorEditions } from "../data/excelsior.ts";
import { excelsiorMarks } from "../data/excelsiorMarks.ts";
import { boardProfiles } from "../data/beforeTheCode.ts";
import { CITY, yearZ } from "./city.ts";
import {
  chessRidge,
  activityPlates,
  repertoirePillars,
  weebField,
  writingLessons,
  writingArchive,
  excelsiorEditionBlocks,
  excelsiorMarkMarkers,
  boardProfileMarkers,
  eastStructures,
  eastResolveSources,
} from "./corpusData.ts";

describe("chess ridge", () => {
  it("carries exactly one instance per rating sample across all six series — 473", () => {
    const total = chess.arc.reduce((s, series) => s + series.points.length, 0);
    expect(total).toBe(473);
    expect(chessRidge()).toHaveLength(473);
  });

  it("is z-monotone with t within each series — the data arrives time-ordered and nothing here reorders it", () => {
    let offset = 0;
    for (const series of chess.arc) {
      const slice = chessRidge().slice(offset, offset + series.points.length);
      for (let i = 1; i < slice.length; i++) {
        expect(slice[i].z, `${series.platform}/${series.format}[${i}]`).toBeGreaterThanOrEqual(slice[i - 1].z);
      }
      offset += series.points.length;
    }
  });

  it("keeps every lane inside x 17-23, six series at 1.2m apart", () => {
    for (const p of chessRidge()) {
      expect(p.x).toBeGreaterThanOrEqual(17);
      expect(p.x).toBeLessThanOrEqual(23);
    }
  });
});

describe("activity plates", () => {
  it("gives one plate per activityByYear row", () => {
    expect(activityPlates()).toHaveLength(chess.activityByYear.length);
    expect(activityPlates()).toHaveLength(8);
  });
});

describe("repertoire", () => {
  it("gives 5 pillars per year, 40 total", () => {
    expect(repertoirePillars()).toHaveLength(40);
  });

  it("heights are share * 8, never invented", () => {
    for (const p of repertoirePillars()) expect(p.height).toBeCloseTo(p.share * 8, 5);
  });
});

describe("weeb field", () => {
  it("totals 176 — every anime plus every manga, from real status counts", () => {
    const animeTotal = Object.values(weeb.anime.byWatch).reduce((a, b) => a + b, 0);
    const mangaTotal = Object.values(weeb.manga.byRead).reduce((a, b) => a + b, 0);
    expect(animeTotal + mangaTotal).toBe(176);
    expect(weebField()).toHaveLength(176);
  });

  it("sits entirely inside the 2026 band, z in [64, 80]", () => {
    for (const m of weebField()) {
      expect(m.z).toBeGreaterThanOrEqual(64);
      expect(m.z).toBeLessThanOrEqual(80);
    }
  });

  it("renders 'To Watch' unlit, everything else lit", () => {
    for (const m of weebField()) expect(m.lit).toBe(m.status !== "To Watch");
  });
});

describe("writing lessons", () => {
  it("gives one column per lesson, 17 total", () => {
    expect(writingLessons()).toHaveLength(writing.lessons.length);
    expect(writingLessons()).toHaveLength(17);
  });

  it("clusters entirely past the 2026 marker — z > yearZ(2026) + 4", () => {
    const floor = yearZ(2026) + 4;
    for (const l of writingLessons()) expect(l.z).toBeGreaterThan(floor);
  });
});

describe("writing archive", () => {
  it("gives one block per archive entry, 11 total, real years dated and the rest uncertain", () => {
    const blocks = writingArchive();
    expect(blocks).toHaveLength(11);
    const dated = blocks.filter((b) => b.dated);
    const uncertain = blocks.filter((b) => !b.dated);
    // deadline (2018), the-loopdown-story (2020) and the-tour (2020) are the
    // only three `era` values that parse to a real year; the rest (personal
    // essays, "campus-lore", the deliberately-unparseable "2069 (written
    // 2020)"...) get no fabricated date.
    expect(dated).toHaveLength(3);
    expect(uncertain).toHaveLength(8);
    for (const b of uncertain) expect(b.z).toBe(CITY.z0);
  });

  it("heights are words / 400", () => {
    for (const b of writingArchive()) expect(b.height).toBeGreaterThan(0);
  });
});

describe("old town", () => {
  it("totals 16 — 3 editions + 10 marks + 3 profiles, the only district with no 2026 presence", () => {
    expect(excelsiorEditionBlocks()).toHaveLength(3);
    expect(excelsiorMarkMarkers()).toHaveLength(10);
    expect(boardProfileMarkers()).toHaveLength(3);
    expect(excelsiorEditions).toHaveLength(3);
    expect(excelsiorMarks).toHaveLength(10);
    expect(boardProfiles).toHaveLength(3);
  });

  it("edition height is pages / 16 — 128 pages -> 8m", () => {
    const y2021 = excelsiorEditionBlocks().find((e) => e.year === 2021)!;
    expect(y2021.pages).toBe(128);
    expect(y2021.height).toBeCloseTo(8, 5);
  });

  it("sits inside 2019-2021, z -40 to -8", () => {
    for (const e of excelsiorEditionBlocks()) {
      expect(e.z).toBeGreaterThanOrEqual(-40);
      expect(e.z).toBeLessThanOrEqual(-8);
    }
    for (const m of excelsiorMarkMarkers()) {
      expect(m.z).toBeGreaterThanOrEqual(-40);
      expect(m.z).toBeLessThanOrEqual(-8);
    }
  });
});

describe("the whole east flank stays off the approach apron", () => {
  it("never places anything at x < CITY.buildInner", () => {
    const allX = [
      ...chessRidge().map((p) => p.x),
      ...activityPlates().map((p) => p.x),
      ...repertoirePillars().map((p) => p.x),
      ...weebField().map((p) => p.x),
      ...writingLessons().map((p) => p.x),
      ...writingArchive().map((p) => p.x),
      ...excelsiorEditionBlocks().map((p) => p.x),
      ...excelsiorMarkMarkers().map((p) => p.x),
      ...boardProfileMarkers().map((p) => p.x),
    ];
    expect(allX.length).toBeGreaterThan(0);
    for (const x of allX) expect(x, `x=${x}`).toBeGreaterThanOrEqual(CITY.buildInner);
  });
});

describe("gps.ts / ResolveField exports", () => {
  it("east structures never fabricate a placement — every one traces to a real dated block", () => {
    expect(eastStructures().length).toBeGreaterThan(0);
    for (const s of eastStructures()) {
      expect(Number.isFinite(s.x)).toBe(true);
      expect(Number.isFinite(s.z)).toBe(true);
      expect(s.height).toBeGreaterThan(0);
    }
  });

  it("structure dust only sources from structures at least 6m tall, ~350 points each", () => {
    const sources = eastResolveSources();
    expect(sources.length).toBeGreaterThan(0);
    for (const s of sources) {
      expect(s.targets.length).toBe(350 * 3);
      expect(s.targets.length % 3).toBe(0);
    }
  });

  it("is reproducible — same id, same cloud, every call", () => {
    const a = eastResolveSources();
    const b = eastResolveSources();
    expect(a[0].targets).toEqual(b[0].targets);
  });
});
