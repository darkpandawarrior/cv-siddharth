/**
 * Pure derivations over the merged game corpus. No fetch, no fs — everything
 * here is a function of its arguments so the numbers the site asserts are
 * unit-testable against fixtures.
 *
 * Every rate returned is a 0..1 fraction; formatting to percentages is the
 * UI's job.
 */

/** chess.com encodes draws as one of several per-side result strings. */
export const DRAW_RESULTS = [
  "agreed", "repetition", "stalemate", "insufficient", "50move", "timevsinsufficient",
];

const DRAWS = new Set(DRAW_RESULTS);
const ON_TIME = /timeout|outoftime/;

/** "…/openings/Scandinavian-Defense-Mieses-Kotrc-Variation-3.Nc3" -> "Scandinavian Defense Mieses Kotrc Variation" */
function openingFromEco(url) {
  if (!url) return null;
  const tail = decodeURIComponent(url.split("/openings/")[1] || "");
  if (!tail) return null;
  // Cut at the move list: either an ellipsis or a "-3." style move number.
  return tail.split(/\.\.\.|-\d+\./)[0].replace(/-/g, " ").trim() || null;
}

/** "0:02:58.9" -> 178.9 seconds */
function clockSeconds(s) {
  const m = /(\d+):(\d+):([\d.]+)/.exec(s);
  return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : null;
}

/**
 * The owner's own clock readings, in move order. PGN interleaves both sides'
 * annotations, white first, so we take every other one starting at the side
 * the owner played.
 */
function ownClocks(pgn, white) {
  if (!pgn || !pgn.includes("%clk")) return null;
  const all = (pgn.match(/\[%clk ([^\]]+)\]/g) || []).map((s) => clockSeconds(s));
  const mine = all.filter((_, i) => i % 2 === (white ? 0 : 1)).filter((x) => x != null);
  return mine.length ? mine : null;
}

export function normaliseChessCom(games, username) {
  const u = username.toLowerCase();
  return games.map((g) => {
    const white = (g.white?.username || "").toLowerCase() === u;
    const me = white ? g.white : g.black;
    const op = white ? g.black : g.white;
    const result = me.result === "win" ? "win" : DRAWS.has(me.result) ? "draw" : "loss";
    return {
      plat: "chess.com",
      ts: g.end_time * 1000,
      white,
      rated: !!g.rated,
      speed: g.time_class,
      myRating: me.rating ?? null,
      opRating: op?.rating ?? null,
      result,
      termination: me.result,
      // The opponent's own result string — the only place a mate *delivered*
      // is recorded. His own `result` just reads "win".
      opTermination: op?.result ?? null,
      opening: openingFromEco(g.eco),
      acc: g.accuracies ? (white ? g.accuracies.white : g.accuracies.black) ?? null : null,
      fen: g.fen ?? null,
      clk: ownClocks(g.pgn, white),
      // chess.com publishes no playTime and no move statistics, but every game
      // ships full PGN headers and per-move clocks, so all three are computable
      // here rather than being absent from the corpus.
      durSecs: liveDurationSecs(g.pgn),
      moves: moveCount(g.pgn),
      firstMove: firstMove(g.pgn),
    };
  });
}

/* ------------------------------------------------------------------------- *
 * PGN derivations — the numbers chess.com's API withholds.
 *
 * The lichess export is fetched without moves, clocks or FENs (the full
 * payload is a 9-minute download for a frozen archive), so everything below is
 * chess.com-only. The aggregates enforce that with a `plat` filter of their
 * own rather than trusting every future caller to pre-filter.
 * ------------------------------------------------------------------------- */

/** `[EndTime "05:01:57"]` -> `"05:01:57"`. */
export function pgnHeader(pgn, key) {
  if (!pgn) return null;
  const m = new RegExp(`\\[${key} "([^"]*)"\\]`).exec(pgn);
  return m ? m[1] : null;
}

/** Above this a "live" span is a daily game or a corrupt header, not a sitting. */
const MAX_LIVE_SECS = 4 * 3600;

/**
 * Wall-clock seconds a live game occupied, from its PGN headers. Handles the
 * midnight rollover (`UTCDate` and `EndDate` differ) because `EndTime` alone
 * would read 23:59 -> 00:03 as minus 24 hours.
 *
 * Returns null — never a guess — when a header is missing or the span is
 * negative or implausibly long, so `boardTime` can report those as skipped
 * instead of silently folding zeros into the total.
 */
export function liveDurationSecs(pgn) {
  const d0 = pgnHeader(pgn, "UTCDate");
  const t0 = pgnHeader(pgn, "StartTime");
  const d1 = pgnHeader(pgn, "EndDate");
  const t1 = pgnHeader(pgn, "EndTime");
  if (!d0 || !t0 || !d1 || !t1) return null;
  const at = (d, t) => Date.parse(`${d.replace(/\./g, "-")}T${t}Z`);
  const secs = (at(d1, t1) - at(d0, t0)) / 1000;
  return Number.isFinite(secs) && secs >= 0 && secs < MAX_LIVE_SECS ? secs : null;
}

/**
 * Movetext with `{...}` comments and `[...]` header tags removed.
 *
 * Stripping the comments FIRST is load-bearing: a clock annotation like
 * `{[%clk 0:00:58.9]}` otherwise offers `58.` to any move-number regex, and
 * `[Date "2023.12.11"]` offers `2023.`. That exact bug published a wrong
 * median game length once already.
 */
function movetext(pgn) {
  return (pgn || "").replace(/\{[^}]*\}/g, " ").replace(/\[[^\]]*\]/g, " ");
}

/** Full moves played — the highest move number in the movetext. */
export function moveCount(pgn) {
  let max = 0;
  for (const m of movetext(pgn).matchAll(/(\d+)\s*\./g)) max = Math.max(max, +m[1]);
  return max;
}

/** White's first move in SAN, e.g. `"d4"`. The `(?!\.)` skips `1... d5`. */
export function firstMove(pgn) {
  const m = /\b1\s*\.\s*(?!\.)(\S+)/.exec(movetext(pgn));
  return m ? m[1] : null;
}

const PIECE_VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9 };

/**
 * Points still on the board at termination, both sides summed and kings
 * excluded, so a full board is 78. Summing both sides is deliberate: this
 * measures how deep into the endgame a game ran, not who was ahead.
 */
export function materialLeft(fen) {
  if (!fen) return null;
  let sum = 0;
  for (const ch of fen.split(" ")[0]) sum += PIECE_VALUE[ch.toLowerCase()] || 0;
  return sum;
}

/**
 * The population every PGN derivation runs over: chess.com's live games.
 * Daily/correspondence games are excluded because they span real days rather
 * than time at the board — folding their 300 spans into an hours figure would
 * inflate it by orders of magnitude.
 */
const liveCc = (games) => games.filter((g) => g.plat === "chess.com" && g.speed !== "daily");

const median = (a) => {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Time at the board, derived from live-game PGN wall clock. `skipped` ships
 * with the total so the figure can be stated with its coverage rather than
 * implying every game was measurable.
 */
export function boardTime(games) {
  const byClass = {};
  let totalSecs = 0;
  let measured = 0;
  let skipped = 0;
  for (const g of liveCc(games)) {
    if (g.durSecs == null) { skipped++; continue; }
    byClass[g.speed] = (byClass[g.speed] || 0) + g.durSecs;
    totalSecs += g.durSecs;
    measured++;
  }
  return { totalSecs, byClass, measured, skipped };
}

/** Game length overall and per result — he loses the longer games. */
export function gameLength(games) {
  const all = liveCc(games).filter((g) => g.moves > 0);
  const m = all.map((g) => g.moves);
  const medianOf = (r) => median(all.filter((g) => g.result === r).map((g) => g.moves));
  return {
    n: m.length,
    median: median(m),
    mean: m.length ? m.reduce((a, b) => a + b, 0) / m.length : NaN,
    max: m.length ? Math.max(...m) : NaN,
    winMedian: medianOf("win"),
    lossMedian: medianOf("loss"),
  };
}

/** Bucket edges in full moves; the last bucket is open-ended. */
const LENGTH_EDGES = [0, 20, 30, 40, 50, 60, Infinity];

/**
 * Win rate by game length, plus what share of each bucket's *losses* ended on
 * the clock. The denominator is that bucket's losses, not its whole
 * population: the claim is "past move 20 the flag share of losses doubles",
 * which is a statement about losses only.
 */
export function lengthBuckets(games) {
  const rows = LENGTH_EDGES.slice(0, -1).map((lo, i) => ({
    lo, hi: LENGTH_EDGES[i + 1], n: 0, w: 0, l: 0, flags: 0,
  }));
  for (const g of liveCc(games)) {
    if (!(g.moves > 0) || g.result === "draw") continue;
    const b = rows.find((r) => g.moves >= r.lo && g.moves < r.hi);
    b.n++;
    if (g.result === "win") b.w++;
    else {
      b.l++;
      if (ON_TIME.test(g.termination)) b.flags++;
    }
  }
  return rows.map((r) => ({
    lo: r.lo,
    hi: Number.isFinite(r.hi) ? r.hi : null,
    n: r.n,
    winRate: r.n ? r.w / r.n : NaN,
    flagShareOfLosses: r.l ? r.flags / r.l : NaN,
  }));
}

/**
 * Games he took past 90% of his starting clock — the scramble population.
 * Draws are excluded so the rate is comparable to the overall win rate it is
 * quoted against; counting the 46 draws as non-wins reads as 28.0% against a
 * decided-games baseline of ~48%, which compares two different denominators.
 */
export function clutchRate(games, speed = "blitz", frac = 0.1) {
  const s = liveCc(games).filter(
    (g) =>
      g.speed === speed && g.result !== "draw" &&
      g.clk && g.clk.length > 1 && g.clk[0] && g.clk.at(-1) / g.clk[0] < frac,
  );
  const wins = s.filter((g) => g.result === "win").length;
  return { n: s.length, wins, rate: s.length ? wins / s.length : NaN };
}

/** His opening move as White, ranked — the half of the repertoire picture the
 * Black-only opening rollup can't see. */
export function firstMoveAsWhite(games, top = 6) {
  const counts = {};
  for (const g of games) {
    if (g.plat !== "chess.com" || !g.white || !g.firstMove) continue;
    counts[g.firstMove] = (counts[g.firstMove] || 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, top)
    .map(([move, n]) => ({ move, n }));
}

/** Terminal material, per result: he wins earlier and loses deeper. */
export function materialAtEnd(games) {
  const medianOf = (r) =>
    median(liveCc(games).filter((g) => g.result === r).map((g) => materialLeft(g.fen)).filter((x) => x != null));
  return { winMedian: medianOf("win"), lossMedian: medianOf("loss"), fullBoard: 78 };
}

/** Mates delivered vs received. Delivered is only visible in the opponent's
 * own result string; his own reads "win". */
export function checkmates(games) {
  const cc = games.filter((g) => g.plat === "chess.com");
  return {
    delivered: cc.filter((g) => g.opTermination === "checkmated").length,
    received: cc.filter((g) => g.termination === "checkmated").length,
  };
}

export function normaliseLichess(games, username) {
  const u = username.toLowerCase();
  return games.map((g) => {
    const w = g.players?.white;
    const b = g.players?.black;
    const white = (w?.user?.id || "").toLowerCase() === u;
    const me = white ? w : b;
    const op = white ? b : w;
    const mySide = white ? "white" : "black";
    return {
      plat: "lichess",
      ts: g.createdAt,
      white,
      rated: !!g.rated,
      speed: g.speed,
      myRating: me?.rating ?? null,
      opRating: op?.rating ?? null,
      result: !g.winner ? "draw" : g.winner === mySide ? "win" : "loss",
      termination: g.status,
      opening: g.opening?.name ?? null,
      // lichess's public export carries no accuracy, and no per-move clocks,
      // moves or FENs unless requested (we request the light payload — the
      // full one is a 9-minute download for a frozen archive). Everything
      // derived from a PGN is therefore null on this half of the corpus.
      acc: null,
      fen: null,
      clk: null,
      opTermination: null,
      durSecs: null,
      moves: null,
      firstMove: null,
    };
  });
}

/**
 * The games `clockDeciles` actually consumes: the right speed, enough clock
 * samples to bucket, and a decided result (a draw has no win/loss curve to sit
 * on). Exported because the sample size printed beside the curve must be the
 * count of the games that produced it — computing it from a second, looser
 * filter published an n 144 games too large.
 */
export function clockSample(games, speed = "blitz") {
  return games.filter(
    (g) =>
      g.speed === speed &&
      g.clk &&
      g.clk.length >= 8 &&
      g.clk[0] &&
      (g.result === "win" || g.result === "loss"),
  );
}

/**
 * Mean fraction of starting clock remaining, by decile of game progress,
 * split by result. This is the section's thesis: the win/loss gap opens early
 * and never closes.
 */
export function clockDeciles(games, speed = "blitz") {
  const buckets = Array.from({ length: 10 }, () => ({ win: [], loss: [] }));
  for (const g of clockSample(games, speed)) {
    const start = g.clk[0];
    g.clk.forEach((c, i) => {
      buckets[Math.min(9, Math.floor((10 * i) / g.clk.length))][g.result].push(c / start);
    });
  }
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
  return buckets.map((b, i) => {
    const win = mean(b.win);
    const loss = mean(b.loss);
    return { bucket: i, win, loss, gap: win - loss };
  });
}

const SESSION_GAP = 30 * 60 * 1000;

/** Next-game win rate conditioned on the previous game's result. */
export function tilt(games, gapMs = SESSION_GAP) {
  const acc = { win: { n: 0, w: 0 }, loss: { n: 0, w: 0 }, draw: { n: 0, w: 0 } };
  for (let i = 1; i < games.length; i++) {
    const prev = games[i - 1];
    const cur = games[i];
    if (prev.plat !== cur.plat || cur.ts - prev.ts > gapMs) continue;
    acc[prev.result].n++;
    if (cur.result === "win") acc[prev.result].w++;
  }
  const rate = (x) => (x.n ? x.w / x.n : NaN);
  return {
    afterWin: rate(acc.win),
    afterLoss: rate(acc.loss),
    afterDraw: rate(acc.draw),
    // `n` backs the published afterWin-vs-afterLoss comparison, so it counts
    // only pairs following a decided game. Draws are a 176-pair rounding error
    // that would otherwise inflate the n printed beside those two rates.
    n: acc.win.n + acc.loss.n,
  };
}

/** Splits a time-ordered corpus into sittings. */
export function sessions(games, gapMs = SESSION_GAP) {
  if (!games.length) return [];
  const out = [];
  let cur = [games[0]];
  for (let i = 1; i < games.length; i++) {
    if (games[i].ts - games[i - 1].ts > gapMs) {
      out.push(cur);
      cur = [];
    }
    cur.push(games[i]);
  }
  out.push(cur);
  return out;
}

/** Win rate by position within a sitting. `n` ships with every row — the tail
 * is thin and the UI must be able to say so. */
export function sessionDecay(sessionList, maxPos = 12) {
  const pos = Array.from({ length: maxPos }, () => ({ n: 0, w: 0 }));
  for (const s of sessionList) {
    s.forEach((g, i) => {
      if (i >= maxPos) return;
      pos[i].n++;
      if (g.result === "win") pos[i].w++;
    });
  }
  return pos
    .map((x, i) => ({ position: i + 1, winRate: x.n ? x.w / x.n : NaN, n: x.n }))
    .filter((x) => x.n > 0);
}

const dayKey = (ts, offsetMs = 0) => new Date(ts + offsetMs).toISOString().slice(0, 10);

export function streaks(games, offsetMs = 0) {
  let longestWin = 0, longestLoss = 0, cw = 0, cl = 0;
  for (const g of games) {
    if (g.result === "win") { cw++; cl = 0; longestWin = Math.max(longestWin, cw); }
    else if (g.result === "loss") { cl++; cw = 0; longestLoss = Math.max(longestLoss, cl); }
    else { cw = 0; cl = 0; } // a draw breaks both
  }
  const days = [...new Set(games.map((g) => dayKey(g.ts, offsetMs)))].sort();
  let longestDayStreak = days.length ? 1 : 0;
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    const delta = (Date.parse(days[i]) - Date.parse(days[i - 1])) / 86400000;
    run = delta === 1 ? run + 1 : 1;
    longestDayStreak = Math.max(longestDayStreak, run);
  }
  const spanDays = days.length
    ? Math.round((Date.parse(days.at(-1)) - Date.parse(days[0])) / 86400000) + 1
    : 0;
  return { longestWin, longestLoss, distinctDays: days.length, spanDays, longestDayStreak };
}

/**
 * Collapses the same opening's two platform spellings onto one key. Without
 * this, the merged corpus splits one repertoire line in two at exactly the
 * January 2023 handoff and renders a discontinuity that never happened:
 * lichess returns `Scandinavian Defense: Mieses-Kotroc Variation` (494 games)
 * and chess.com's ECO slug yields `Scandinavian Defense Mieses Kotrc Variation`
 * (426 games).
 *
 * Hyphens become spaces and apostrophes are dropped rather than spaced, because
 * chess.com's slug uses `-` as its word separator and carries no apostrophes at
 * all (`Queens-Pawn-Opening`, `Kings-Indian-Attack`) — so `Queen's Pawn Game`
 * has to canonicalise to `Queens Pawn Game`, never `Queen s Pawn Game`.
 */
export function canonOpening(name) {
  if (!name) return null;
  const c = name
    .replace(/Kotroc/gi, "Kotrc") // lichess spells it Kotroc, chess.com Kotrc
    .replace(/['’]/g, "")
    .replace(/\bwith 1 e4\b/gi, "")
    .replace(/[-:,"]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return c || null;
}

/** The first two words — where repertoire identity lives ("Scandinavian Defense"). */
export function openingFamily(name) {
  const c = canonOpening(name);
  return c ? c.split(" ").slice(0, 2).join(" ").toLowerCase() : null;
}

/**
 * The repertoire line a game belongs to, display-cased — `openingFamily`'s
 * grouping with one correction: a line that arrives by transposition is named
 * after the *host* opening, so first-two-words files it in the wrong bucket.
 *
 * The same early ...d5 repertoire is published as `English Opening Anglo
 * Scandinavian Defense` (1.c4 d5, 61 games), `Nimzowitsch Defense Scandinavian
 * Variation` (1.e4 Nc6 2.d4 d5, 57) and `Alekhine Defense Scandinavian
 * Variation` (27). Filing those under English/Nimzowitsch/Alekhine
 * under-reports the line he actually plays by 4.5 points — 36.6% instead of
 * the 41.1% the spec measures for lichess 2019 — so where a name carries a
 * line, the line wins over the opening.
 */
export function openingLine(name) {
  const c = canonOpening(name);
  if (!c) return null;
  if (/\bscandinavian\b/i.test(c)) return "Scandinavian Defense";
  return c.split(" ").slice(0, 2).join(" ");
}

/**
 * Top openings as Black, per calendar year — the three-act repertoire arc.
 * `share` is of that year's Black games that carried an opening name, which is
 * the denominator the spec's repertoire table uses.
 */
export function repertoireByYear(games, top = 5, offsetMs = 0) {
  const years = {};
  const totals = {};
  for (const g of games) {
    const opening = canonOpening(g.opening);
    if (!opening || g.white) continue;
    const y = dayKey(g.ts, offsetMs).slice(0, 4);
    (years[y] ||= {});
    years[y][opening] = (years[y][opening] || 0) + 1;
    totals[y] = (totals[y] || 0) + 1;
  }
  const out = {};
  for (const [y, counts] of Object.entries(years)) {
    out[y] = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, top)
      .map(([name, count]) => ({ name, count, share: count / totals[y] }));
  }
  return out;
}

/** Below this a platform-year's Black games are too few to quote a share of. */
const THIN_BLACK_GAMES = 30;

/**
 * The same top-openings-as-Black rollup as `repertoireByYear`, but computed
 * **within each platform separately** — which is the only way to separate a
 * repertoire change from a platform change, because the corpus hands off from
 * lichess to chess.com in January 2023. The merged view genuinely cannot show
 * it: a share of a merged year is a share of whichever site he was on.
 *
 * A platform-year under 30 Black games is marked `thin` and emits `share: null`
 * rather than a confident percentage over 9 games.
 *
 * Grouped by `openingLine`, not by full variation name: the question is "what
 * share of his Black games was the Scandinavian", and splitting that across
 * five named variations answers a different one.
 */
export function repertoireByPlatform(games, top = 5, offsetMs = 0, thin = THIN_BLACK_GAMES) {
  const acc = {};
  for (const g of games) {
    const opening = openingLine(g.opening);
    if (!opening || g.white) continue;
    const y = dayKey(g.ts, offsetMs).slice(0, 4);
    const key = g.plat === "lichess" ? "lichess" : "chesscom";
    const slot = ((acc[y] ||= {})[key] ||= { blackGames: 0, counts: {} });
    slot.blackGames++;
    slot.counts[opening] = (slot.counts[opening] || 0) + 1;
  }
  const ranked = (counts) => Object.entries(counts).sort((a, b) => b[1] - a[1]);

  // The lines worth following across the whole arc: the union of every
  // platform-year's top `top`. A plain per-year top-5 breaks the series at
  // exactly the point the arc is about — the Scandinavian collapses to 0.2% of
  // his lichess Black games in 2021, which is rank ~15 that year, so the
  // abandonment would be missing from the data that has to render it.
  const tracked = new Set();
  for (const platforms of Object.values(acc))
    for (const slot of Object.values(platforms))
      for (const [name] of ranked(slot.counts).slice(0, top)) tracked.add(name);

  const out = {};
  for (const [year, platforms] of Object.entries(acc)) {
    out[year] = {};
    for (const [key, slot] of Object.entries(platforms)) {
      const isThin = slot.blackGames < thin;
      const rows = ranked(slot.counts);
      out[year][key] = {
        blackGames: slot.blackGames,
        thin: isThin,
        // An absent line means zero games that year on that platform.
        openings: [...rows.slice(0, top), ...rows.slice(top).filter(([n]) => tracked.has(n))]
          .map(([name, count]) => ({ name, count, share: isThin ? null : count / slot.blackGames })),
      };
    }
  }
  return out;
}

export function terminationSplit(games) {
  const losses = games.filter((g) => g.result === "loss");
  const wins = games.filter((g) => g.result === "win");
  const lossesOnTime = losses.filter((g) => ON_TIME.test(g.termination)).length;
  const winsOnTime = wins.filter((g) => ON_TIME.test(g.termination)).length;
  const decided = wins.length + losses.length;
  return {
    lossesOnTime,
    winsOnTime,
    lossRate: losses.length ? lossesOnTime / losses.length : NaN,
    winRate: wins.length ? winsOnTime / wins.length : NaN,
    decidedOnClock: decided ? (lossesOnTime + winsOnTime) / decided : NaN,
  };
}

/**
 * Occupancy count per square across terminal positions. Index 0 is a1 and 63
 * is h8, so the UI can map index -> file/rank without a second convention.
 */
export function squareMatrix(games, result) {
  const m = new Array(64).fill(0);
  for (const g of games) {
    if (!g.fen || g.result !== result) continue;
    const board = g.fen.split(" ")[0];
    const ranks = board.split("/"); // FEN ranks run 8 down to 1
    if (ranks.length !== 8) continue;
    ranks.forEach((row, i) => {
      const rank = 7 - i; // rank index 0 == rank 1
      let file = 0;
      for (const ch of row) {
        if (/\d/.test(ch)) file += +ch;
        else { if (file < 8) m[rank * 8 + file] += 1; file += 1; }
      }
    });
  }
  return m;
}

const WEEK = 7 * 86400000;

/**
 * One point per week: the week's **maximum** rating, plus both true endpoints
 * so the series still starts and ends where the data does.
 *
 * Maximum, not last. Keeping the last sample per week clipped every interior
 * peak — the plotted lichess blitz arc topped out at 1668 against a true peak
 * of 1686 sitting mid-week — and on a rating chart the peaks are the whole
 * point. The invariant this maintains, asserted by the generator: the maximum
 * of a downsampled arc equals the peak reported for that format.
 */
export function weeklyArc(series) {
  if (!series.length) return [];
  const out = [];
  let best = series[0];
  let bucketStart = series[0].t;
  for (const p of series) {
    if (p.t - bucketStart >= WEEK) {
      out.push(best);
      bucketStart = p.t;
      best = p;
    } else if (p.r > best.r) best = p;
  }
  out.push(best);
  for (const edge of [series[0], series.at(-1)]) if (!out.includes(edge)) out.push(edge);
  return out.sort((a, b) => a.t - b.t);
}

export function hourHistogram(items, offsetMs = 0) {
  const acc = Array.from({ length: 24 }, () => ({ n: 0, w: 0 }));
  for (const it of items) {
    const h = new Date(it.ts + offsetMs).getUTCHours();
    acc[h].n++;
    if (it.result === "win") acc[h].w++;
  }
  return acc.map((x, hour) => ({ hour, n: x.n, winRate: x.n ? x.w / x.n : null }));
}
