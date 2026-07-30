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
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  normaliseChessCom, normaliseLichess, clockDeciles, tilt, sessions,
  sessionDecay, streaks, repertoireByYear, terminationSplit, squareMatrix,
  weeklyArc, hourHistogram, canonOpening, clockSample,
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

  const data = {
    generatedAt: new Date().toISOString(),
    username: U,
    totals: {
      games: games.length,
      wins, losses, draws,
      // lichess reports playTime in seconds; chess.com publishes no equivalent,
      // so this is the lichess figure only and the UI must label it that way.
      hours: Math.round((liUser.playTime?.total ?? 0) / 3600),
    },
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
        peaks: peaksOf(fullArc, "lichess"),
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
        peaks: peaksOf(fullArc, "chess.com"),
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
      `${Math.round(data.thesis.decidedOnClock * 1000) / 10}% decided on a clock`,
  );
}

build().catch((err) => {
  console.error("gen-chess-stats failed; leaving committed data untouched:", err.message);
  process.exit(1);
});
