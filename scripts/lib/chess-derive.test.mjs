import { describe, expect, it } from "vitest";
import {
  normaliseChessCom, normaliseLichess, clockDeciles, tilt, sessions,
  sessionDecay, streaks, repertoireByYear, terminationSplit, squareMatrix,
  weeklyArc, hourHistogram, DRAW_RESULTS, canonOpening, openingFamily, clockSample,
} from "./chess-derive.mjs";

const U = "darkpandawarrior";

// A chess.com game as the API actually returns it (fields trimmed to what we read).
const ccGame = (over = {}) => ({
  end_time: 1700000000,
  rated: true,
  time_class: "blitz",
  rules: "chess",
  fen: "8/8/8/8/8/8/8/K6k w - -",
  eco: "https://www.chess.com/openings/Scandinavian-Defense-Mieses-Kotrc-Variation-3.Nc3",
  white: { username: U, rating: 1400, result: "win" },
  black: { username: "someone", rating: 1390, result: "resigned" },
  pgn: '[Event "x"]\n\n1. e4 {[%clk 0:03:00]} d5 {[%clk 0:02:58]} 2. exd5 {[%clk 0:02:55]}',
  ...over,
});

describe("normaliseChessCom", () => {
  it("resolves the owner's side, result and rating regardless of colour", () => {
    const [g] = normaliseChessCom([ccGame()], U);
    expect(g.plat).toBe("chess.com");
    expect(g.white).toBe(true);
    expect(g.myRating).toBe(1400);
    expect(g.opRating).toBe(1390);
    expect(g.result).toBe("win");
    expect(g.ts).toBe(1700000000 * 1000); // seconds -> ms
  });

  it("reads the owner as black when that is the side they played", () => {
    const [g] = normaliseChessCom(
      [ccGame({ white: { username: "other", rating: 1500, result: "win" }, black: { username: U, rating: 1450, result: "checkmated" } })],
      U,
    );
    expect(g.white).toBe(false);
    expect(g.myRating).toBe(1450);
    expect(g.result).toBe("loss");
  });

  it("classifies every documented draw termination as a draw, not a loss", () => {
    for (const r of DRAW_RESULTS) {
      const [g] = normaliseChessCom([ccGame({ white: { username: U, rating: 1, result: r }, black: { username: "o", rating: 1, result: r } })], U);
      expect(g.result).toBe("draw");
    }
  });

  it("extracts a readable opening name from the ECO url", () => {
    const [g] = normaliseChessCom([ccGame()], U);
    expect(g.opening).toBe("Scandinavian Defense Mieses Kotrc Variation");
  });

  it("is case-insensitive on username, since chess.com varies the casing", () => {
    const [g] = normaliseChessCom([ccGame({ white: { username: "DarkPandaWarrior", rating: 1400, result: "win" }, black: { username: "o", rating: 1, result: "resigned" } })], U);
    expect(g.white).toBe(true);
  });
});

describe("normaliseLichess", () => {
  const liGame = (over = {}) => ({
    id: "abc",
    rated: true,
    speed: "blitz",
    status: "outoftime",
    winner: "white",
    createdAt: 1600000000000,
    lastMoveAt: 1600000300000,
    opening: { eco: "B01", name: "Scandinavian Defense", ply: 2 },
    players: { white: { user: { id: U }, rating: 1500 }, black: { user: { id: "o" }, rating: 1480 } },
    ...over,
  });

  it("maps winner to the owner's perspective", () => {
    expect(normaliseLichess([liGame()], U)[0].result).toBe("win");
    expect(normaliseLichess([liGame({ winner: "black" })], U)[0].result).toBe("loss");
  });

  it("treats a missing winner as a draw", () => {
    expect(normaliseLichess([liGame({ winner: undefined })], U)[0].result).toBe("draw");
  });

  it("survives an anonymous or deleted opponent with no user object", () => {
    const g = normaliseLichess([liGame({ players: { white: { user: { id: U }, rating: 1500 }, black: { rating: 1400 } } })], U)[0];
    expect(g.white).toBe(true);
    expect(g.opRating).toBe(1400);
  });
});

describe("clockDeciles", () => {
  it("reports mean fraction of clock remaining per decile, split by result", () => {
    // A win that never spends, a loss that halves by the end.
    const win = { result: "win", speed: "blitz", clk: [180, 180, 180, 180, 180, 180, 180, 180, 180, 180] };
    const loss = { result: "loss", speed: "blitz", clk: [180, 170, 160, 150, 140, 130, 120, 110, 100, 90] };
    const out = clockDeciles([win, loss]);
    expect(out).toHaveLength(10);
    expect(out[0].win).toBeCloseTo(1, 2);
    expect(out[9].win).toBeCloseTo(1, 2);
    expect(out[9].loss).toBeCloseTo(0.5, 2);
    expect(out[9].gap).toBeCloseTo(0.5, 2);
  });

  it("ignores games with too few clock samples to bucket", () => {
    expect(clockDeciles([{ result: "win", speed: "blitz", clk: [180, 170] }])[0].win).toBeNaN();
  });

  it("only considers the requested speed", () => {
    const out = clockDeciles([{ result: "win", speed: "bullet", clk: Array(10).fill(60) }], "blitz");
    expect(out[0].win).toBeNaN();
  });
});

describe("clockSample", () => {
  // The sample size printed beside the decile curve has to be the count of the
  // games the curve was computed from. A draw carries no win/loss curve, so
  // counting draws over-reported the published n.
  it("counts exactly the games the decile curve consumes", () => {
    const ok = (result) => ({ result, speed: "blitz", clk: Array(10).fill(180) });
    const games = [ok("win"), ok("loss"), ok("draw"), { result: "win", speed: "bullet", clk: Array(10).fill(60) }, { result: "win", speed: "blitz", clk: [180, 170] }];
    expect(clockSample(games)).toHaveLength(2);
  });

  it("drops a game whose first clock reading is missing or zero", () => {
    expect(clockSample([{ result: "win", speed: "blitz", clk: [0, ...Array(9).fill(1)] }])).toHaveLength(0);
  });
});

describe("tilt", () => {
  it("conditions the next result on the previous one within a session gap", () => {
    const g = (result, ts) => ({ result, ts, plat: "lichess" });
    const min = 60000;
    const out = tilt([g("loss", 0), g("loss", min), g("win", 2 * min), g("win", 3 * min), g("win", 4 * min)]);
    // after loss: games 2 and 3 -> one loss, one win = 50%
    expect(out.afterLoss).toBeCloseTo(0.5, 5);
    // after win: games 4 and 5 -> both wins = 100%
    expect(out.afterWin).toBeCloseTo(1, 5);
    expect(out.n).toBe(4);
  });

  it("keeps n to pairs after a decided game, so a draw cannot inflate it", () => {
    const out = tilt([
      { result: "draw", ts: 0, plat: "lichess" },
      { result: "win", ts: 60000, plat: "lichess" },
      { result: "win", ts: 120000, plat: "lichess" },
    ]);
    expect(out.afterDraw).toBeCloseTo(1, 5);
    expect(out.n).toBe(1); // the after-win pair only
  });

  it("does not pair across a long gap or across platforms", () => {
    const out = tilt([
      { result: "loss", ts: 0, plat: "lichess" },
      { result: "win", ts: 60 * 60000, plat: "lichess" }, // an hour later
      { result: "win", ts: 60 * 60000 + 1000, plat: "chess.com" }, // different platform
    ]);
    expect(out.n).toBe(0);
  });
});

describe("sessions and sessionDecay", () => {
  it("splits on a gap and reports win rate by position with its n", () => {
    const g = (result, ts) => ({ result, ts, plat: "lichess" });
    const s = sessions([g("win", 0), g("loss", 60000), g("win", 10 * 60 * 60000)], 30 * 60000);
    expect(s.map((x) => x.length)).toEqual([2, 1]);
    const decay = sessionDecay(s);
    expect(decay[0]).toEqual({ position: 1, winRate: 1, n: 2 }); // both sessions' first game won
    expect(decay[1]).toEqual({ position: 2, winRate: 0, n: 1 });
  });
});

describe("streaks", () => {
  it("finds the longest win and loss runs and counts distinct days", () => {
    const day = (d) => new Date(`2021-01-${String(d).padStart(2, "0")}T12:00:00Z`).getTime();
    const out = streaks([
      { result: "win", ts: day(1) }, { result: "win", ts: day(1) },
      { result: "loss", ts: day(2) }, { result: "loss", ts: day(2) }, { result: "loss", ts: day(2) },
      { result: "win", ts: day(5) },
    ]);
    expect(out.longestWin).toBe(2);
    expect(out.longestLoss).toBe(3);
    expect(out.distinctDays).toBe(3);
    expect(out.longestDayStreak).toBe(2); // Jan 1-2 consecutive, Jan 5 alone
  });

  it("breaks a win streak on a draw rather than continuing it", () => {
    const out = streaks([
      { result: "win", ts: 1 }, { result: "draw", ts: 2 }, { result: "win", ts: 3 },
    ]);
    expect(out.longestWin).toBe(1);
  });
});

// The exact spellings the two APIs return for the SAME opening. lichess writes
// the name out; chess.com's ECO slug drops apostrophes and uses "-" as its word
// separator, so openingFromEco hands us spaces where lichess has hyphens.
const LICHESS_MK = "Scandinavian Defense: Mieses-Kotroc Variation";
const CHESSCOM_MK = "Scandinavian Defense Mieses Kotrc Variation";

describe("canonOpening", () => {
  it("collapses both platforms' spelling of the same opening onto one key", () => {
    expect(canonOpening(LICHESS_MK)).toBe(canonOpening(CHESSCOM_MK));
  });

  it("drops apostrophes rather than splitting the word, matching chess.com's slug", () => {
    // lichess "Queen's Pawn Game" vs chess.com "Queens-Pawn-Opening": the first
    // two words must agree, which they cannot if "Queen's" becomes "Queen s".
    expect(canonOpening("Queen's Pawn Game")).toBe("Queens Pawn Game");
    expect(canonOpening("King's Indian Attack")).toBe("Kings Indian Attack");
  });

  it("strips the move-list suffix chess.com sometimes appends", () => {
    expect(canonOpening("Scandinavian Defense with 1 e4")).toBe("Scandinavian Defense");
  });

  it("returns null for absent or empty names instead of throwing", () => {
    expect(canonOpening(null)).toBeNull();
    expect(canonOpening(undefined)).toBeNull();
    expect(canonOpening("")).toBeNull();
    expect(canonOpening("  :  ")).toBeNull();
  });
});

describe("openingFamily", () => {
  it("groups every Scandinavian variation under one family", () => {
    const fam = openingFamily(LICHESS_MK);
    expect(fam).toBe("scandinavian defense");
    expect(openingFamily(CHESSCOM_MK)).toBe(fam);
    expect(openingFamily("Scandinavian Defense: Valencian Variation")).toBe(fam);
    expect(openingFamily("Scandinavian Defense")).toBe(fam);
  });

  it("keeps different families apart", () => {
    expect(openingFamily("Modern Defense: Standard Line")).not.toBe(openingFamily(LICHESS_MK));
  });

  it("returns null for absent names", () => {
    expect(openingFamily(null)).toBeNull();
    expect(openingFamily("")).toBeNull();
  });
});

describe("repertoireByYear", () => {
  it("ranks the owner's openings as black, per year, with each one's share", () => {
    const g = (name, year, white = false) => ({ opening: name, white, ts: new Date(`${year}-06-01T00:00:00Z`).getTime() });
    const out = repertoireByYear([g("Scandinavian", 2019), g("Scandinavian", 2019), g("Modern", 2019), g("Modern", 2021)]);
    expect(out["2019"][0]).toEqual({ name: "Scandinavian", count: 2, share: 2 / 3 });
    expect(out["2021"][0]).toEqual({ name: "Modern", count: 1, share: 1 });
  });

  it("merges the two platform spellings into a single line", () => {
    const g = (name) => ({ opening: name, white: false, ts: Date.parse("2023-06-01") });
    // The regression this exists to prevent: split spellings would render the
    // 2023 handoff as a repertoire discontinuity that never happened.
    const out = repertoireByYear([g(LICHESS_MK), g(LICHESS_MK), g(CHESSCOM_MK)]);
    expect(out["2023"]).toHaveLength(1);
    expect(out["2023"][0].count).toBe(3);
    expect(out["2023"][0].share).toBe(1);
  });

  it("excludes games played as white from the black repertoire", () => {
    const out = repertoireByYear([{ opening: "Queens Pawn", white: true, ts: Date.parse("2021-06-01") }]);
    expect(out["2021"]).toBeUndefined();
  });
});

describe("terminationSplit", () => {
  it("computes the clock share of losses, wins, and all decided games", () => {
    const out = terminationSplit([
      { result: "loss", termination: "outoftime" },
      { result: "loss", termination: "checkmated" },
      { result: "win", termination: "outoftime" },
      { result: "win", termination: "resign" },
      { result: "draw", termination: "agreed" },
    ]);
    expect(out.lossesOnTime).toBe(1);
    expect(out.winsOnTime).toBe(1);
    expect(out.lossRate).toBeCloseTo(0.5, 5);
    expect(out.winRate).toBeCloseTo(0.5, 5);
    // 2 of 4 decided games ended on a clock; draws excluded from "decided"
    expect(out.decidedOnClock).toBeCloseTo(0.5, 5);
  });
});

describe("squareMatrix", () => {
  it("counts occupied squares from terminal FENs into a 64-cell board", () => {
    // Two kings only: a1 (index 0) and h8 (index 63).
    const m = squareMatrix([{ fen: "7k/8/8/8/8/8/8/K7 w - -", result: "loss" }], "loss");
    expect(m).toHaveLength(64);
    expect(m[0]).toBe(1);
    expect(m[63]).toBe(1);
    expect(m[1]).toBe(0);
  });

  it("filters to the requested result", () => {
    const m = squareMatrix([{ fen: "7k/8/8/8/8/8/8/K7 w - -", result: "win" }], "loss");
    expect(m.every((c) => c === 0)).toBe(true);
  });
});

describe("weeklyArc", () => {
  it("downsamples a dense series to one point per week", () => {
    const day = 86400000;
    const series = Array.from({ length: 28 }, (_, i) => ({ t: i * day, r: 1000 + i }));
    const out = weeklyArc(series);
    expect(out.length).toBeLessThanOrEqual(5);
    expect(out[0].t).toBe(0);
    expect(out.at(-1).r).toBe(1027); // last value survives, so the peak isn't clipped
  });
});

describe("hourHistogram", () => {
  it("buckets by local hour after applying the offset", () => {
    const out = hourHistogram([{ ts: Date.UTC(2021, 0, 1, 0, 0, 0), result: "win" }], 5.5 * 3600000);
    expect(out).toHaveLength(24);
    expect(out[5].n).toBe(1); // 00:00 UTC -> 05:30 IST -> hour 5
    expect(out[5].winRate).toBe(1);
  });

  it("reports a null win rate for hours with no games rather than NaN", () => {
    const out = hourHistogram([], 0);
    expect(out[0].n).toBe(0);
    expect(out[0].winRate).toBeNull();
  });
});
