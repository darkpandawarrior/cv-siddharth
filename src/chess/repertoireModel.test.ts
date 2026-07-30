import { describe, expect, it } from "vitest";
import { focusLines, pct, repertoireYears, shareSeries } from "./repertoireModel.ts";
import type { Corpus } from "../lib/useCorpus.ts";

/** Two platforms, one thin year, one line that swings hard within lichess and
 *  another that swings within chess.com — the shape the real corpus has. */
const fixture: Corpus["repertoireByPlatform"] = {
  "2019": {
    lichess: {
      blackGames: 100,
      thin: false,
      openings: [
        { name: "Scandinavian", count: 40, share: 0.4 },
        { name: "Modern", count: 1, share: 0.01 },
      ],
    },
  },
  "2021": {
    lichess: {
      blackGames: 200,
      thin: false,
      openings: [
        { name: "Modern", count: 160, share: 0.8 },
        { name: "Scandinavian", count: 1, share: 0.005 },
      ],
    },
    chesscom: { blackGames: 9, thin: true, openings: [{ name: "Modern", count: 5, share: null }] },
  },
  "2023": {
    chesscom: {
      blackGames: 300,
      thin: false,
      openings: [{ name: "Scandinavian", count: 90, share: 0.3 }],
    },
  },
  "2026": {
    chesscom: {
      blackGames: 100,
      thin: false,
      openings: [{ name: "Scandinavian", count: 40, share: 0.4 }],
    },
  },
};

describe("repertoireModel", () => {
  it("orders years and keeps only the platforms actually played", () => {
    const years = repertoireYears(fixture);
    expect(years.map((y) => y.year)).toEqual(["2019", "2021", "2023", "2026"]);
    expect(years[0].platforms.map((p) => p.key)).toEqual(["lichess"]);
    expect(years[1].platforms.map((p) => p.key)).toEqual(["lichess", "chesscom"]);
  });

  it("ranks lines by within-platform swing, thin years excluded", () => {
    // Modern: lichess 0.01 -> 0.8 = 0.79. Scandinavian: lichess 0.4 -> 0.005
    // = 0.395, plus chess.com 0.3 -> 0.4 = 0.1 → 0.495. The thin 2021
    // chess.com slice must not contribute a swing of its own.
    expect(focusLines(repertoireYears(fixture))).toEqual(["Modern", "Scandinavian"]);
  });

  it("reads absence as a zero share, not as missing data", () => {
    const series = shareSeries(repertoireYears(fixture), "Scandinavian");
    // chess.com 2021 is thin → no percentage at all, not 0%.
    expect(series.find((p) => p.year === "2021" && p.key === "chesscom")).toMatchObject({
      share: null,
      thin: true,
    });
    // Scandinavian is absent from chess.com 2023's list? No — but Modern is,
    // and absence there is a real zero.
    const modern = shareSeries(repertoireYears(fixture), "Modern");
    expect(modern.find((p) => p.year === "2023")).toMatchObject({ share: 0, count: 0 });
  });

  it("never renders a percentage for a thin slice", () => {
    expect(pct(0.4107)).toBe("41.1%");
    expect(pct(null)).toBe("thin");
  });
});
