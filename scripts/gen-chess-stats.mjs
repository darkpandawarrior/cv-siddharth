// scripts/gen-chess-stats.mjs
/**
 * Emits src/data/chess.ts (small, imported by the home page) and
 * public/chess/corpus.json (large, fetched only by the /chess room) from the
 * lichess and chess.com public APIs.
 *
 * Why build-time and not an edge endpoint: chess.com 403s any request without
 * a descriptive User-Agent and its Cloudflare layer blocks serverless egress
 * IPs regardless of headers, while the lichess half is a frozen archive (last
 * activity 2025-01-16). Neither half benefits from being live.
 *
 * If ANY fetch fails, both committed artefacts are left untouched so offline
 * builds still succeed off the last good copy — same contract as
 * gen-project-stats.mjs. Nothing is written until every fetch and every
 * derivation has succeeded, and the process exits non-zero so CI reports it
 * rather than silently shipping stale data (per commit 43bd80b).
 */
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  normaliseChessCom, normaliseLichess, clockDeciles, tilt, sessions,
  sessionDecay, streaks, repertoireByYear, terminationSplit, squareMatrix,
  weeklyArc, hourHistogram, canonOpening, clockSample,
  boardTime, gameLength, lengthBuckets, clutchRate, firstMoveAsWhite,
  materialAtEnd, checkmates, repertoireByPlatform,
} from "./lib/chess-derive.mjs";
import { getJson, getNdjson, walkArchives, readCache, writeCache } from "./lib/chess-fetch.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const U = "darkpandawarrior";
const IST = 5.5 * 3600 * 1000;
const iso = (ts) => new Date(ts).toISOString().slice(0, 10);
const r3 = (n) => (Number.isFinite(n) ? Math.round(n * 1000) / 1000 : null);

async function fetchLichessCorpus(seenAt) {
  const cached = readCache("lichess-games");
  if (cached && cached.seenAt === seenAt) return cached.games;
  // ~9 minutes for 14k games. Light payload: no moves, no clocks, no evals.
  const games = await getNdjson(
    `https://lichess.org/api/games/user/${U}?max=20000&opening=true&moves=false&clocks=false&evals=false`,
  );
  writeCache("lichess-games", { seenAt, games });
  return games;
}

/**
 * Hour-of-day histogram of authored commit dates.
 *
 * Two hard limits shape this. GitHub's search API only ever returns the first
 * 1,000 results however many matched (total_count is 1,557 here), and an
 * unauthenticated caller gets 10 search requests per minute — so 10 pages of
 * 100 is simultaneously the ceiling and the budget, and page 11 returns 403.
 * The sample size ships alongside the histogram so the UI can say "1,000 of
 * 1,557" instead of implying full coverage. A GITHUB_TOKEN lifts the rate
 * limit but not the 1,000-result cap.
 *
 * Cached per calendar day: this generator gets re-run several times in a
 * sitting and each run would otherwise burn the whole minute's search quota.
 */
async function commitHours() {
  const day = iso(Date.now());
  const cached = readCache("commit-hours");
  if (cached && cached.day === day) return cached;

  const token = process.env.GITHUB_TOKEN;
  const headers = {
    Accept: "application/vnd.github.cloak-preview+json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const items = [];
  let total = 0;
  for (let page = 1; page <= 10; page++) {
    const r = await getJson(
      `https://api.github.com/search/commits?q=author:${U}&per_page=100&page=${page}&sort=author-date&order=asc`,
      headers,
    );
    total = r.total_count ?? total;
    items.push(...(r.items || []));
    if (!r.items?.length || items.length >= total) break;
  }
  // Authored dates carry the committing machine's offset, which is
  // inconsistent across this history (2019 commits show +03:00, which is not
  // Pune). Normalised to IST, and the UI says so rather than implying the
  // hour data is clean.
  const hours = hourHistogram(items.map((c) => ({ ts: Date.parse(c.commit.author.date) })), IST)
    // Commits have no win/loss, so hourHistogram's winRate would read as a
    // flat 0% — dropped rather than shipped as a false zero.
    .map(({ hour, n }) => ({ hour, n }));
  const out = { day, hours, sampled: items.length, total, from: iso(Date.parse(items[0].commit.author.date)) };
  writeCache("commit-hours", out);
  return out;
}

async function build() {
  // ---- lichess ----
  const liUser = await getJson(`https://lichess.org/api/user/${U}`);
  const liHistory = await getJson(`https://lichess.org/api/user/${U}/rating-history`);
  // The /user endpoint already carries every perf's rating, game count and
  // `prov` flag, so the per-perf endpoints the first draft of this script hit
  // were three redundant requests.
  const liRaw = await fetchLichessCorpus(liUser.seenAt);

  // ---- chess.com ----
  // /stats is deliberately not fetched: its `best.rating` per format is the
  // same figure peaksOf() already derives from the archive walk (blitz 1425
  // both ways), so it would be a request whose answer we already have.
  const ccProfile = await getJson(`https://api.chess.com/pub/player/${U}`);
  const ccRaw = await walkArchives(U, (i, n) => {
    if (i % 10 === 0 || i === n) console.log(`  chess.com archives ${i}/${n}`);
  });

  // ---- puzzle + commits ----
  const puzzleRaw = await getJson("https://lichess.org/api/puzzle/daily");
  const commits = await commitHours();

  // ---- merge ----
  const games = [...normaliseLichess(liRaw, U), ...normaliseChessCom(ccRaw, U)]
    .sort((a, b) => a.ts - b.ts);

  const wins = games.filter((g) => g.result === "win").length;
  const losses = games.filter((g) => g.result === "loss").length;
  const draws = games.length - wins - losses;

  const term = terminationSplit(games);
  const deciles = clockDeciles(games, "blitz");
  const clockN = clockSample(games, "blitz").length;
  const t = tilt(games);
  const st = streaks(games, IST);
  const decay = sessionDecay(sessions(games), 12);
  const rep = repertoireByYear(games, 5, IST);
  const repPlat = repertoireByPlatform(games, 5, IST);

  // Everything chess.com's API withholds but its PGNs carry. The lichess half
  // is fetched without moves, clocks or FENs, so all of this is chess.com-only
  // and every field below ships a `scope` saying so.
  const bt = boardTime(games);
  const lichessHours = (liUser.playTime?.total ?? 0) / 3600;
  const chesscomHours = bt.totalSecs / 3600;
  const len = gameLength(games);
  const mat = materialAtEnd(games);
  const mates = checkmates(games);
  const buckets = lengthBuckets(games);
  const clutch = clutchRate(games);
  const r1 = (n) => (Number.isFinite(n) ? Math.round(n * 10) / 10 : null);

  // Games per platform per year — the shape the arc is about. A handoff in
  // January 2023, not two parallel streams: lichess's late points are three
  // games in January 2025, so `lastActive` alone would over-read as activity.
  const byYear = {};
  for (const g of games) {
    const y = iso(g.ts + IST).slice(0, 4);
    (byYear[y] ||= { lichess: 0, "chess.com": 0 })[g.plat]++;
  }

  const bySide = (white) => {
    const s = games.filter((g) => g.white === white);
    return { games: s.length, winRate: r3(s.filter((g) => g.result === "win").length / s.length) };
  };

  const accGames = games.filter((g) => g.acc != null);
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
  const accuracy = accGames.length
    ? {
        mean: r3(mean(accGames.map((g) => g.acc))),
        inWins: r3(mean(accGames.filter((g) => g.result === "win").map((g) => g.acc))),
        inLosses: r3(mean(accGames.filter((g) => g.result === "loss").map((g) => g.acc))),
        covered: accGames.length,
        total: ccRaw.length,
      }
    : null;

  const upsets = games
    .filter((g) => g.result === "win" && g.opRating && g.myRating)
    .map((g) => ({ ...g, gap: g.opRating - g.myRating }))
    .sort((a, b) => b.gap - a.gap);
  const top = upsets[0];

  // ---- rating arcs ----
  // lichess: the rating-history endpoint already returns one point per day.
  const liArc = liHistory
    .filter((h) => ["Blitz", "Bullet", "Rapid"].includes(h.name) && h.points.length > 20)
    .map((h) => ({
      platform: "lichess",
      format: h.name.toLowerCase(),
      points: h.points.map(([y, m, d, r]) => ({ t: Date.UTC(y, m, d), r })),
    }));
  // chess.com: no history endpoint, so ratings come out of the archive walk.
  const ccArc = ["blitz", "bullet", "rapid"].map((format) => ({
    platform: "chess.com",
    format,
    points: games
      .filter((g) => g.plat === "chess.com" && g.rated && g.speed === format && g.myRating)
      .map((g) => ({ t: g.ts, r: g.myRating })),
  })).filter((a) => a.points.length > 20);

  const fullArc = [...liArc, ...ccArc];

  const peaksOf = (arcs, platform) =>
    arcs.filter((a) => a.platform === platform).map((a) => {
      const p = a.points.reduce((x, y) => (y.r > x.r ? y : x));
      return { format: a.format, rating: p.r, at: iso(p.t) };
    });

  /**
   * NEVER WRITE AWAY A PEAK.
   *
   * lichess's rating-history endpoint returned 0 series on 2026-08-24 — his
   * account has been inactive there since 2025-01 and the history is simply
   * gone from the API. The fetch SUCCEEDED and returned an empty array, so
   * the "keep the previous file if a fetch fails" contract never fired, and a
   * refresh silently replaced real peaks (blitz 1686, bullet 1662, rapid
   * 1552) with an empty list. That took out the site's "ratings are not
   * comparable across platforms — 1686 vs 1425" claim, crashed
   * gen-system-prompt, and failed the claim audit.
   *
   * An empty success is a failure in effect and not in code, which is the
   * same shape as a stalled fetch never rejecting. So the rule is
   * REGRESSION, not error: a peak that existed does not stop existing because
   * an endpoint stopped talking about it. He did reach 1686; only the
   * evidence moved.
   */
  const previousPeaks = (() => {
    try {
      const prev = readFileSync(join(root, "src", "data", "chess.ts"), "utf8");
      const parsed = JSON.parse(prev.slice(prev.indexOf("{"), prev.lastIndexOf("}") + 1));
      return Object.fromEntries((parsed.platforms ?? []).map((p) => [p.id, p.peaks ?? []]));
    } catch { return {}; }
  })();

  const keepPeaks = (id, fresh) => {
    const old = previousPeaks[id] ?? [];
    if (fresh.length >= old.length) return fresh;
    console.warn(
      `[gen-chess-stats] ${id}: derived ${fresh.length} peak(s) but the committed file has ${old.length} — ` +
      `keeping the existing ones. The upstream endpoint has probably stopped serving history for an ` +
      `inactive account; a rating he actually reached does not un-happen.`,
    );
    return old;
  };

  const data = {
    generatedAt: new Date().toISOString(),
    username: U,
    totals: {
      games: games.length,
      wins, losses, draws,
      // lichess reports playTime in seconds; chess.com publishes no equivalent.
      // This is the lichess figure only — `boardTime` below carries both halves.
      hours: Math.round((liUser.playTime?.total ?? 0) / 3600),
    },
    // Time at the board across both platforms. Deliberately NOT presented as
    // one metric: the two halves are measured differently and the `note` says
    // so wherever this is rendered.
    boardTime: {
      scope: "both platforms, two measurements",
      lichessHours: Math.round(lichessHours),
      chesscomHours: Math.round(chesscomHours),
      combinedHours: Math.round(lichessHours + chesscomHours),
      note:
        "lichess self-reports playTime.total; the chess.com half is derived from " +
        "live-game PGN wall clock (UTCDate/StartTime to EndDate/EndTime). Two " +
        "measurement methods, not one uniform metric.",
      chesscom: {
        games: bt.measured,
        skipped: bt.skipped,
        // Daily/correspondence games are excluded — they span real days, not
        // time at the board.
        excludedDaily: games.filter((g) => g.plat === "chess.com" && g.speed === "daily").length,
        byClass: Object.fromEntries(
          Object.entries(bt.byClass).map(([k, v]) => [k, r1(v / 3600)]),
        ),
        meanMinutes: r1(bt.totalSecs / 60 / bt.measured),
      },
    },
    // The thesis confirmed independently of the clock traces: win rate falls
    // monotonically with game length while the flag share of losses doubles
    // after move 20. chess.com-only — lichess ships no moves.
    length: {
      scope: "chess.com",
      games: len.n,
      median: len.median,
      mean: r3(len.mean),
      max: len.max,
      winMedian: len.winMedian,
      lossMedian: len.lossMedian,
      buckets: buckets.map((b) => ({
        lo: b.lo, hi: b.hi, n: b.n,
        winRate: r3(b.winRate),
        flagShareOfLosses: r3(b.flagShareOfLosses),
      })),
      decided: buckets.reduce((a, b) => a + b.n, 0),
    },
    material: {
      scope: "chess.com",
      winMedian: mat.winMedian,
      lossMedian: mat.lossMedian,
      fullBoard: mat.fullBoard,
    },
    firstMoveWhite: { scope: "chess.com", moves: firstMoveAsWhite(games) },
    clutch: { scope: "chess.com", n: clutch.n, wins: clutch.wins, rate: r3(clutch.rate) },
    checkmate: { scope: "chess.com", delivered: mates.delivered, received: mates.received },
    span: { from: iso(games[0].ts), to: iso(games.at(-1).ts) },
    activityByYear: Object.entries(byYear).sort().map(([year, n]) => ({
      year, lichess: n.lichess, chesscom: n["chess.com"],
    })),
    platforms: [
      {
        id: "lichess",
        url: `https://lichess.org/@/${U}`,
        joined: iso(liUser.createdAt),
        lastActive: iso(Math.max(...games.filter((g) => g.plat === "lichess").map((g) => g.ts))),
        games: liRaw.length,
        peaks: keepPeaks("lichess", peaksOf(fullArc, "lichess")),
        // Every lichess format reports prov: true — deviation grew during
        // inactivity — so these are "last rating", never "current rating".
        // Derived, not asserted, so the label can never outlive the fact.
        provisional: ["blitz", "bullet", "rapid"].every((p) => liUser.perfs?.[p]?.prov === true),
        // `perfs.puzzle.rating` is the LAST rating (1661), not the peak. The
        // 1847 figure is the high-water mark, which only rating-history carries.
        puzzles: liUser.perfs?.puzzle
          ? {
              peak: Math.max(
                ...(liHistory.find((h) => h.name === "Puzzles")?.points ?? []).map((p) => p[3]),
                liUser.perfs.puzzle.rating,
              ),
              last: liUser.perfs.puzzle.rating,
              solved: liUser.perfs.puzzle.games,
            }
          : null,
      },
      {
        id: "chess.com",
        url: `https://www.chess.com/member/${U}`,
        joined: iso(ccProfile.joined * 1000),
        lastActive: iso(Math.max(...games.filter((g) => g.plat === "chess.com").map((g) => g.ts))),
        games: ccRaw.length,
        peaks: keepPeaks("chess.com", peaksOf(fullArc, "chess.com")),
        provisional: false,
        puzzles: null,
      },
    ],
    thesis: {
      decidedOnClock: r3(term.decidedOnClock),
      lossesOnTime: r3(term.lossRate),
      winsOnTime: r3(term.winRate),
      deciles: deciles.map((d) => ({ bucket: d.bucket, win: r3(d.win), loss: r3(d.loss), gap: r3(d.gap) })),
      sampleSize: clockN,
    },
    discipline: {
      distinctDays: st.distinctDays,
      spanDays: st.spanDays,
      longestDayStreak: st.longestDayStreak,
      longestWin: st.longestWin,
      longestLoss: st.longestLoss,
    },
    tilt: { afterWin: r3(t.afterWin), afterLoss: r3(t.afterLoss), n: t.n },
    sessionDecay: decay.map((d) => ({ ...d, winRate: r3(d.winRate) })),
    repertoire: Object.entries(rep).sort().map(([year, openings]) => ({
      year,
      openings: openings.map((o) => ({ ...o, share: r3(o.share) })),
    })),
    colour: { white: bySide(true), black: bySide(false) },
    accuracy,
    bestUpset: top
      ? { opRating: top.opRating, myRating: top.myRating, gap: top.gap, at: iso(top.ts), platform: top.plat, speed: top.speed }
      : null,
    puzzle: {
      id: puzzleRaw.puzzle.id,
      fen: puzzleRaw.puzzle.fen,
      solution: puzzleRaw.puzzle.solution,
      rating: puzzleRaw.puzzle.rating,
      themes: puzzleRaw.puzzle.themes,
      lastMove: puzzleRaw.puzzle.lastMove,
    },
    // Weekly downsample keeps the home bundle small; the room reads the full
    // series out of corpus.json.
    arc: fullArc.map((a) => ({ ...a, points: weeklyArc(a.points) })),
  };

  // The downsampled arc IS the chart, so its maximum must equal the peak
  // printed beside it. Keeping the last sample per week broke this silently —
  // lichess blitz plotted a ceiling of 1668 against a reported peak of 1686 —
  // and a chart quietly disagreeing with its own caption is exactly the class
  // of drift this generator exists to make impossible. Asserted, not trusted.
  for (const a of data.arc) {
    const peak = data.platforms
      .find((p) => p.id === a.platform)
      .peaks.find((p) => p.format === a.format);
    const plotted = Math.max(...a.points.map((p) => p.r));
    if (plotted !== peak.rating) {
      throw new Error(
        `arc downsampling clipped ${a.platform} ${a.format}: plotted max ${plotted} != peak ${peak.rating}`,
      );
    }
  }

  const corpus = {
    generatedAt: data.generatedAt,
    arc: fullArc,
    graveyard: { losses: squareMatrix(games, "loss"), wins: squareMatrix(games, "win") },
    hours: {
      chess: hourHistogram(games, IST),
      commits: commits.hours,
      // GitHub search returns at most 1,000 of the matching commits; the UI
      // must label the overlay as a sample, not the whole history.
      commitSample: { n: commits.sampled, total: commits.total, from: commits.from },
    },
    // Opening shares as Black WITHIN each platform, per year — the only way to
    // separate a repertoire change from the January 2023 platform handoff, since
    // a share of a merged year is a share of whichever site he was on. Lives
    // here rather than in chess.ts because it is 12 KB and only the room's
    // repertoire scene reads it; chess.ts would cross 60 KB carrying it.
    repertoireByPlatform: Object.fromEntries(
      Object.entries(repPlat).sort().map(([year, platforms]) => [
        year,
        Object.fromEntries(
          Object.entries(platforms).map(([plat, p]) => [
            plat,
            {
              blackGames: p.blackGames,
              thin: p.thin,
              // 4dp, not 3: a line that fell to one game in 2,332 rounds to a
              // flat 0 at 3dp, which reads as "never played" beside a count of 1.
              openings: p.openings.map((o) => ({
                ...o,
                share: Number.isFinite(o.share) ? Math.round(o.share * 10000) / 10000 : null,
              })),
            },
          ]),
        ),
      ]),
    ),
    openings: Object.entries(
      games.reduce((acc, g) => {
        // Canonicalised: the same opening arrives spelled two ways from the two
        // platforms, and raw keys would split one line in two at the handoff.
        const opening = canonOpening(g.opening);
        if (!opening) return acc;
        const k = `${g.white ? "W" : "B"}|${opening}`;
        (acc[k] ||= { name: opening, side: g.white ? "white" : "black", n: 0, w: 0 });
        acc[k].n++;
        if (g.result === "win") acc[k].w++;
        return acc;
      }, {}),
    ).map(([, v]) => ({ ...v, winRate: r3(v.w / v.n) })).sort((a, b) => b.n - a.n),
    // Positions for guess-the-move: decided chess.com games with a terminal
    // FEN, sampled deterministically so the set is stable between builds.
    positions: games
      .filter((g) => g.plat === "chess.com" && g.fen && g.result !== "draw")
      .filter((_, i) => i % 37 === 0)
      .slice(0, 60)
      .map((g) => ({ fen: g.fen, result: g.result, speed: g.speed, at: iso(g.ts), myRating: g.myRating })),
  };

  writeFileSync(
    join(root, "src", "data", "chess.ts"),
    `// GENERATED by scripts/gen-chess-stats.mjs — do not edit by hand.\n` +
      `// Hand-editing breaks the property that this file IS the claim audit for\n` +
      `// the chess section: every figure here traces to a live API response.\n` +
      `// Regenerate with: npm run gen:chess\n\n` +
      `export type ChessData = typeof chess;\n\n` +
      `export const chess = ${JSON.stringify(data, null, 2)} as const;\n`,
  );
  mkdirSync(join(root, "public", "chess"), { recursive: true });
  writeFileSync(join(root, "public", "chess", "corpus.json"), JSON.stringify(corpus));

  console.log(
    `chess: ${data.totals.games} games, ${data.span.from} -> ${data.span.to}, ` +
      `${Math.round(data.thesis.decidedOnClock * 1000) / 10}% decided on a clock, ` +
      `${data.boardTime.combinedHours}h at the board ` +
      `(${data.boardTime.chesscomHours}h derived from ${data.boardTime.chesscom.games} PGNs, ` +
      `${data.boardTime.chesscom.skipped} skipped)`,
  );
}

/**
 * A transient upstream failure is NOT a build failure.
 *
 * This catch already said the right thing — "leaving committed data
 * untouched" — and then exited 1 anyway, which is a contradiction: if the
 * committed data is intact and correct, nothing is broken. GitHub's commit
 * SEARCH api allows about 30 requests a minute and this walks it to page 10,
 * so a 403 here is routine, and it was taking `npm run refresh` down with it
 * — and with it gen:chess-deep and gen:system-prompt, which run after.
 *
 * Same posture gen-project-stats.mjs already takes ("fetch failed, keeping
 * committed projectStats.ts"). A real bug — a parse error, a bad write —
 * still exits 1 and still goes red.
 */
const TRANSIENT = /\b(403|408|429|5\d\d)\b|rate limit|timeout|timed out|ETIMEDOUT|ECONNRESET|ENOTFOUND|fetch failed|socket hang up/i;

build().catch((err) => {
  if (TRANSIENT.test(err.message)) {
    console.warn("gen-chess-stats: upstream unavailable, keeping committed data —", err.message);
    return; // exit 0: nothing is wrong with the repo
  }
  console.error("gen-chess-stats failed; leaving committed data untouched:", err.message);
  process.exit(1);
});
