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
      opening: openingFromEco(g.eco),
      acc: g.accuracies ? (white ? g.accuracies.white : g.accuracies.black) ?? null : null,
      fen: g.fen ?? null,
      clk: ownClocks(g.pgn, white),
    };
  });
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
      // lichess's public export carries no accuracy, and no per-move clocks
      // unless clocks=true was requested (we request the light payload).
      acc: null,
      fen: null,
      clk: null,
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

/** One point per week: the sample that opens each bucket, so the series keeps
 * its true start, plus always the final sample so a peak at the end of the
 * series is never clipped off. */
export function weeklyArc(series) {
  if (!series.length) return [];
  const out = [series[0]];
  let bucketStart = series[0].t;
  for (const p of series) {
    if (p.t - bucketStart >= WEEK) {
      out.push(p);
      bucketStart = p.t;
    }
  }
  const last = series.at(-1);
  if (out.at(-1) !== last) out.push(last);
  return out;
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
