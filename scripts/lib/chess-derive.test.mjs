import { describe, expect, it } from "vitest";
import {
  normaliseChessCom, normaliseLichess, clockDeciles, tilt, sessions,
  sessionDecay, streaks, repertoireByYear, terminationSplit, squareMatrix,
  weeklyArc, hourHistogram, DRAW_RESULTS, canonOpening, openingFamily, openingLine, clockSample,
  pgnHeader, liveDurationSecs, moveCount, materialLeft, firstMoveAsWhite,
  gameLength, lengthBuckets, clutchRate, boardTime, checkmates,
  repertoireByPlatform,
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

  it("derives the fields chess.com's API does not publish, from the PGN", () => {
    const [g] = normaliseChessCom([ccGame({
      pgn:
        '[Event "Live Chess"]\n[UTCDate "2023.12.11"]\n[StartTime "04:57:38"]\n' +
        '[EndDate "2023.12.11"]\n[EndTime "05:01:57"]\n\n' +
        "1. e4 {[%clk 0:03:00]} 1... d5 {[%clk 0:02:58]} 2. exd5 {[%clk 0:02:55]}",
    })], U);
    expect(g.durSecs).toBe(259); // 04:57:38 -> 05:01:57
    expect(g.moves).toBe(2);
    expect(g.firstMove).toBe("e4");
    expect(g.opTermination).toBe("resigned");
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
  const day = 86400000;

  it("downsamples a dense series to one point per week", () => {
    const series = Array.from({ length: 28 }, (_, i) => ({ t: i * day, r: 1000 + i }));
    const out = weeklyArc(series);
    expect(out.length).toBeLessThanOrEqual(5);
    expect(out[0].t).toBe(0); // the true start survives
    expect(out.at(-1).r).toBe(1027); // and so does the final sample
  });

  // The bug this exists to prevent: keeping the LAST sample per week clipped
  // every interior peak, so the plotted lichess blitz arc topped out at 1668
  // against a true peak of 1686. On a rating chart the peaks are the point.
  it("keeps a mid-series spike instead of the week's closing value", () => {
    const series = Array.from({ length: 28 }, (_, i) => ({ t: i * day, r: 1000 }));
    series[10].r = 1686; // a spike in the middle of week two
    const out = weeklyArc(series);
    expect(Math.max(...out.map((p) => p.r))).toBe(1686);
    expect(out.some((p) => p.t === 10 * day)).toBe(true);
  });

  it("emits the true first and last samples even when neither is a weekly max", () => {
    const series = [
      { t: 0, r: 1000 },
      { t: 3 * day, r: 1500 },
      { t: 10 * day, r: 1400 },
      { t: 20 * day, r: 900 },
    ];
    const out = weeklyArc(series);
    expect(out[0]).toEqual({ t: 0, r: 1000 });
    expect(out.at(-1)).toEqual({ t: 20 * day, r: 900 });
    expect(out.map((p) => p.t)).toEqual([...out.map((p) => p.t)].sort((a, b) => a - b));
  });
});

describe("pgnHeader", () => {
  it("reads a header value and returns null for one that is absent", () => {
    const pgn = '[Event "Live Chess"]\n[EndTime "05:01:57"]\n\n1. d4 d5';
    expect(pgnHeader(pgn, "EndTime")).toBe("05:01:57");
    expect(pgnHeader(pgn, "StartTime")).toBeNull();
    expect(pgnHeader(null, "EndTime")).toBeNull();
  });
});

describe("liveDurationSecs", () => {
  const pgn = (h) => Object.entries(h).map(([k, v]) => `[${k} "${v}"]`).join("\n") + "\n\n1. d4 d5";

  it("spans a midnight date rollover", () => {
    expect(liveDurationSecs(pgn({
      UTCDate: "2023.01.01", StartTime: "23:59:00",
      EndDate: "2023.01.02", EndTime: "00:03:00",
    }))).toBe(240);
  });

  it("returns null when a header is missing", () => {
    expect(liveDurationSecs(pgn({ UTCDate: "2023.01.01", StartTime: "10:00:00" }))).toBeNull();
  });

  it("returns null for an implausible span — a daily game, not board time", () => {
    expect(liveDurationSecs(pgn({
      UTCDate: "2023.01.01", StartTime: "10:00:00",
      EndDate: "2023.01.01", EndTime: "15:00:00",
    }))).toBeNull();
  });

  it("returns null for a negative span rather than subtracting time played", () => {
    expect(liveDurationSecs(pgn({
      UTCDate: "2023.01.02", StartTime: "10:00:00",
      EndDate: "2023.01.01", EndTime: "10:00:00",
    }))).toBeNull();
  });
});

describe("moveCount", () => {
  // The regression that matters: a move-number regex run over the raw PGN sees
  // "58." inside {[%clk 0:00:58.9]} and "2023." inside [Date "2023.12.11"].
  // Both already published a wrong median game length once.
  it("strips clock comments and header tags before counting move numbers", () => {
    const pgn =
      '[Event "Live Chess"]\n[Date "2023.12.11"]\n\n' +
      "1. d4 {[%clk 0:00:58.9]} 1... d5 {[%clk 1:59.5]} " +
      "2. c4 {[%clk 0:00:50]} 2... e6 {[%clk 0:00:49]} " +
      "3. Nc3 {[%clk 0:00:45]} 1-0";
    expect(moveCount(pgn)).toBe(3);
  });

  it("returns 0 for an empty or missing movetext instead of throwing", () => {
    expect(moveCount(null)).toBe(0);
    expect(moveCount('[Event "x"]\n\n')).toBe(0);
  });
});

describe("materialLeft", () => {
  it("sums both sides and excludes the kings, so a full board is 78", () => {
    expect(materialLeft("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")).toBe(78);
  });

  it("scores a bare-kings position as zero", () => {
    expect(materialLeft("7k/8/8/8/8/8/8/K7 w - -")).toBe(0);
    expect(materialLeft(null)).toBeNull();
  });
});

// The PGN-derived aggregates are chess.com-only — the lichess export is fetched
// without moves, clocks or FENs — so every one of them filters on `plat`
// rather than trusting each caller to pre-filter.
const cc = (over = {}) => ({
  plat: "chess.com", speed: "blitz", white: true, result: "win",
  termination: "resigned", moves: 25, durSecs: 300, fen: null, clk: null,
  firstMove: "d4", opTermination: "resigned", ...over,
});

describe("boardTime", () => {
  it("sums live wall clock by time class and excludes daily games", () => {
    const out = boardTime([
      cc({ durSecs: 100 }),
      cc({ speed: "bullet", durSecs: 50 }),
      cc({ speed: "daily", durSecs: 99999 }),
      { plat: "lichess", speed: "blitz", durSecs: null },
    ]);
    expect(out.totalSecs).toBe(150);
    expect(out.byClass).toEqual({ blitz: 100, bullet: 50 });
    expect(out.measured).toBe(2);
    expect(out.skipped).toBe(0);
  });

  it("counts a live game with no derivable duration as skipped, not as zero", () => {
    const out = boardTime([cc({ durSecs: null }), cc({ durSecs: 60 })]);
    expect(out.measured).toBe(1);
    expect(out.skipped).toBe(1);
    expect(out.totalSecs).toBe(60);
  });
});

describe("gameLength", () => {
  it("reports median, mean and max overall and the median per result", () => {
    const out = gameLength([
      cc({ moves: 10, result: "win" }),
      cc({ moves: 20, result: "win" }),
      cc({ moves: 30, result: "loss" }),
      cc({ moves: 60, result: "loss" }),
      cc({ moves: 999, speed: "daily" }), // excluded
    ]);
    expect(out.n).toBe(4);
    expect(out.median).toBe(25);
    expect(out.mean).toBe(30);
    expect(out.max).toBe(60);
    expect(out.winMedian).toBe(15);
    expect(out.lossMedian).toBe(45);
  });
});

describe("lengthBuckets", () => {
  it("computes the flag share over that bucket's losses, not its whole population", () => {
    const out = lengthBuckets([
      // <20: two wins, two losses, one of them on the clock -> 50% win rate,
      // 50% flag share of losses (not 25% of the bucket).
      cc({ moves: 5, result: "win" }),
      cc({ moves: 10, result: "win" }),
      cc({ moves: 15, result: "loss", termination: "timeout" }),
      cc({ moves: 19, result: "loss", termination: "checkmated" }),
      cc({ moves: 25, result: "loss", termination: "resigned" }),
      cc({ moves: 25, result: "draw" }), // draws sit in no bucket
    ]);
    const first = out[0];
    expect([first.lo, first.hi]).toEqual([0, 20]);
    expect(first.n).toBe(4);
    expect(first.winRate).toBeCloseTo(0.5, 5);
    expect(first.flagShareOfLosses).toBeCloseTo(0.5, 5);
    expect(out[1].n).toBe(1); // the draw is not counted
    expect(out.at(-1).hi).toBeNull(); // 60+ is open-ended
  });

  it("puts a boundary length in the higher bucket", () => {
    const out = lengthBuckets([cc({ moves: 20 })]);
    expect(out[0].n).toBe(0);
    expect(out[1].n).toBe(1);
  });
});

describe("clutchRate", () => {
  it("counts blitz games finished under a tenth of the starting clock", () => {
    const out = clutchRate([
      cc({ clk: [180, 90, 10], result: "win" }), // 5.6% left
      cc({ clk: [180, 90, 17], result: "loss" }), // 9.4% left
      cc({ clk: [180, 90, 60], result: "win" }), // 33% left — not clutch
      cc({ speed: "bullet", clk: [60, 30, 1], result: "win" }), // wrong speed
      // A draw is not a failed conversion: counting it as a non-win reports
      // 28.0% against a decided-games baseline of ~48% — two denominators.
      cc({ clk: [180, 90, 5], result: "draw" }),
    ]);
    expect(out.n).toBe(2);
    expect(out.wins).toBe(1);
    expect(out.rate).toBeCloseTo(0.5, 5);
  });
});

describe("firstMoveAsWhite", () => {
  it("ranks his opening move, ignoring the games he played as black", () => {
    const out = firstMoveAsWhite([
      cc({ firstMove: "d4" }), cc({ firstMove: "d4" }), cc({ firstMove: "g3" }),
      cc({ firstMove: "e4", white: false }),
    ]);
    expect(out[0]).toEqual({ move: "d4", n: 2 });
    expect(out.map((x) => x.move)).not.toContain("e4");
  });
});

describe("checkmates", () => {
  it("separates mates delivered from mates received", () => {
    const out = checkmates([
      cc({ result: "win", opTermination: "checkmated" }),
      cc({ result: "loss", termination: "checkmated", opTermination: "win" }),
      cc({ result: "win", opTermination: "resigned" }),
    ]);
    expect(out).toEqual({ delivered: 1, received: 1 });
  });
});

describe("repertoireByPlatform", () => {
  const g = (plat, name, year) => ({
    plat, opening: name, white: false, ts: Date.parse(`${year}-06-01T12:00:00Z`),
  });

  it("shares are of that platform's black games that year, not the merged year", () => {
    const games = [
      ...Array.from({ length: 30 }, (_, i) => g("lichess", i < 12 ? "Scandinavian Defense" : "Modern Defense", 2019)),
      ...Array.from({ length: 40 }, () => g("chess.com", "Modern Defense", 2019)),
    ];
    const out = repertoireByPlatform(games);
    expect(out["2019"].lichess.blackGames).toBe(30);
    expect(out["2019"].lichess.openings.find((o) => o.name === "Scandinavian Defense").share)
      .toBeCloseTo(12 / 30, 5);
    expect(out["2019"].chesscom.openings[0].share).toBe(1);
  });

  it("marks a platform-year with too few black games thin instead of publishing noise", () => {
    const out = repertoireByPlatform(Array.from({ length: 9 }, () => g("chess.com", "Scandinavian Defense", 2021)));
    expect(out["2021"].chesscom.thin).toBe(true);
    expect(out["2021"].chesscom.blackGames).toBe(9);
    expect(out["2021"].chesscom.openings[0].share).toBeNull();
  });

  it("merges the two platform spellings within a platform too", () => {
    const games = Array.from({ length: 30 }, (_, i) =>
      g("lichess", i % 2 ? LICHESS_MK : CHESSCOM_MK, 2023));
    const out = repertoireByPlatform(games);
    expect(out["2023"].lichess.openings).toHaveLength(1);
    expect(out["2023"].lichess.openings[0].count).toBe(30);
  });

  // The abandonment IS the arc: the Scandinavian drops to 0.2% of his lichess
  // Black games in 2021, rank ~15 that year. A plain top-5 drops that point and
  // the series Task 9 plots breaks exactly where the story is.
  it("keeps a line that fell out of the top N in a year it once led", () => {
    const games = [
      ...Array.from({ length: 40 }, () => g("lichess", "Scandinavian Defense", 2019)),
      ...Array.from({ length: 39 }, () => g("lichess", "Modern Defense", 2021)),
      g("lichess", "Scandinavian Defense", 2021),
    ];
    const out = repertoireByPlatform(games, 1);
    const scand = out["2021"].lichess.openings.find((o) => o.name === "Scandinavian Defense");
    expect(scand.count).toBe(1);
    expect(scand.share).toBeCloseTo(1 / 40, 5);
  });

  // The same ...d5 repertoire arrives named after whatever it transposed from.
  // Filing those under English/Nimzowitsch under-reported the line by 4.5pts.
  it("counts a transposition into the line as part of the line", () => {
    const games = [
      ...Array.from({ length: 20 }, () => g("lichess", "Scandinavian Defense", 2019)),
      ...Array.from({ length: 10 }, () => g("lichess", "English Opening: Anglo-Scandinavian Defense", 2019)),
    ];
    const out = repertoireByPlatform(games);
    expect(out["2019"].lichess.openings[0]).toEqual({
      name: "Scandinavian Defense", count: 30, share: 1,
    });
  });
});

describe("openingLine", () => {
  it("groups a transposed Scandinavian with the mainline, not with its host", () => {
    expect(openingLine("English Opening: Anglo-Scandinavian Defense")).toBe("Scandinavian Defense");
    expect(openingLine("Nimzowitsch Defense: Scandinavian Variation")).toBe("Scandinavian Defense");
    expect(openingLine(LICHESS_MK)).toBe("Scandinavian Defense");
  });

  it("falls back to the first two words, display-cased", () => {
    expect(openingLine("Modern Defense: Standard Line")).toBe("Modern Defense");
    expect(openingLine("Van 't Kruijs Opening")).toBe("Van t");
    expect(openingLine(null)).toBeNull();
  });

  // This assertion previously expected "Queens Pawn", encoding the very bias it
  // now guards against: the Modern reached by 1.d4 is still the Modern, and
  // filing it under its host opening under-reported the line by up to 22 points
  // while the Scandinavian was being folded correctly.
  it("groups a transposed Modern with the mainline too, symmetrically", () => {
    expect(openingLine("Queen's Pawn Game: Modern Defense")).toBe("Modern Defense");
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

describe("openingLine symmetry", () => {
  // Regression guard for a bias bug: an earlier version folded transposed
  // lines for the Scandinavian ONLY, leaving every other line on two-word
  // grouping. That reproduced the spec's numbers because the spec came from the
  // same asymmetry — while under-reporting the Modern Defense by up to 22
  // points in favour of the line the repertoire narrative is about.
  it("folds transposed Scandinavian lines onto the line, not the host opening", () => {
    for (const n of [
      "Scandinavian Defense: Mieses-Kotroc Variation",
      "Scandinavian Defense Mieses Kotrc Variation",
      "English Opening Anglo-Scandinavian Defense",
      "Nimzowitsch Defense Scandinavian Variation",
      "Alekhine Defense Scandinavian Variation",
    ]) expect(openingLine(n)).toBe("Scandinavian Defense");
  });

  it("folds transposed Modern Defense lines the SAME way — this is the symmetry", () => {
    for (const n of ["Modern Defense", "Queen's Pawn Game: Modern Defense", "Modern Defense with 1 e4"])
      expect(openingLine(n)).toBe("Modern Defense");
  });

  it("does not let a shared first word capture an unrelated opening", () => {
    // "Queens" must not reach Queen's Gambit, "Kings" must not reach the King's Indian.
    expect(openingLine("Queens Pawn Opening Chigorin Variation")).toBe("Queens Pawn");
    expect(openingLine("Kings Fianchetto Opening")).toBe("Kings Fianchetto");
  });

  it("falls back to two-word grouping for untracked openings, and is null-safe", () => {
    expect(openingLine("Van t Kruijs Opening")).toBe("Van t");
    expect(openingLine(null)).toBeNull();
    expect(openingLine("")).toBeNull();
  });
});
