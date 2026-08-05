// Weeb Central — the anime/manga corpus, and the two things it admits.
//
// Source is a Notion export (data/weeb/*.csv), committed so the build is
// reproducible without a Notion token. That export is a SNAPSHOT and goes stale
// the moment something airs, which is the whole problem with a hand-kept list:
// it records what he watched, never what has happened since.
//
// So every title is matched against AniList's public GraphQL — no key, no
// OAuth, no client secret, because reading public media data needs none of it.
// That buys three things the Notion table cannot know:
//
//   1. Whether a SEQUEL exists that his row never accounted for. This is the
//      "new seasons not tracked here" gap, detected rather than asserted.
//   2. The crowd's average score, so his rating can be compared against it
//      instead of just listed.
//   3. Episode counts, real genres and years, where his columns are 14% and
//      53% filled respectively.
//
// Network-optional, same contract as gen-archive-text.mjs: responses cache to
// .weeb-cache/ and a failed fetch keeps the previous output rather than
// shipping a gap. A fresh clone with no network still builds.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outPath = join(root, "src", "data", "weeb.ts");
const cacheDir = join(root, ".weeb-cache");
const cachePath = join(cacheDir, "anilist.json");

const API = "https://graphql.anilist.co";
// AniList 403s the default Node/urllib agent. Identify properly.
const HEADERS = {
  "Content-Type": "application/json",
  "User-Agent": "cv-siddharth/1.0 (+https://cv-siddharth.vercel.app)",
};

/** Titles his Notion spells differently to every database on earth. */
const ALIAS = {
  "Naruto Shippudden": "Naruto Shippuden",
  "Stein’s;Gate": "Steins;Gate",
  "Bayblade: Metal Fusion": "Beyblade: Metal Fusion",
  Bayblade: "Beyblade",
  "Boruto: Naruto Next Generations": "Boruto",
};

/**
 * Minimal RFC-4180 reader. The export has quoted fields containing commas and
 * newlines (genre lists, notes), so splitting on "," loses rows — and adding a
 * csv dependency for one build script is not worth it.
 */
function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  const s = text.replace(/^﻿/, "").replace(/\r\n/g, "\n");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const head = rows.shift();
  return rows
    .filter((r) => r.some((v) => v.trim()))
    .map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}

const cache = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, "utf8")) : {};
let fetched = 0, failed = 0;

const QUERY = `query($s:String,$t:MediaType){ Page(perPage:1){ media(search:$s, type:$t){
  id title{romaji english} episodes chapters seasonYear status averageScore popularity genres siteUrl
  coverImage{ medium }
  relations{ edges{ relationType node{ id type title{romaji english} status seasonYear format } } } } } }`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** One AniList lookup, cached by `${type}:${title}`. Retries once on 429. */
async function lookup(title, type) {
  const key = `${type}:${title}`;
  if (key in cache) return cache[key];
  const search = ALIAS[title] ?? title;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(API, {
        method: "POST",
        headers: HEADERS,
        body: JSON.stringify({ query: QUERY, variables: { s: search, t: type } }),
      });
      if (res.status === 429) {
        // AniList sends Retry-After in seconds. Respect it rather than guess.
        await sleep((Number(res.headers.get("retry-after")) || 60) * 1000);
        continue;
      }
      if (!res.ok) throw new Error(String(res.status));
      const json = await res.json();
      const m = json?.data?.Page?.media?.[0] ?? null;
      cache[key] = m;
      fetched++;
      await sleep(700);
      return m;
    } catch (e) {
      if (attempt === 1) { failed++; console.warn(`[gen-weeb] ${title}: ${e.message}`); return null; }
      await sleep(2000);
    }
  }
  return null;
}

const stars = (s) => (s.match(/⭐/g) || []).length;
const int = (s) => (/^\d+$/.test(s.trim()) ? Number(s.trim()) : null);

const anime = parseCsv(readFileSync(join(root, "data", "weeb", "anime.csv"), "utf8"));
const manga = parseCsv(readFileSync(join(root, "data", "weeb", "manga.csv"), "utf8"));

const shows = [];
for (const r of anime) {
  const name = r.Name?.trim();
  if (!name) continue;
  const m = await lookup(name, "ANIME");
  // One hop is enough to answer "has something aired that this row never knew
  // about". Walking the whole chain would cost a request per sequel for a
  // finer answer to the same yes/no.
  const sequels = (m?.relations?.edges ?? [])
    .filter((e) => e.relationType === "SEQUEL" && e.node?.type === "ANIME")
    .map((e) => ({
      title: e.node.title.english || e.node.title.romaji,
      year: e.node.seasonYear ?? null,
      status: e.node.status ?? "",
    }));
  shows.push({
    name,
    category: r.Category?.trim() || "",
    watch: r["Watch Status"]?.trim() || "",
    show: r["Show Status"]?.trim() || "",
    score: stars(r["Score /5"] ?? ""),
    done: int(r["Seasons Completed"] ?? ""),
    out: int(r["Seasons Out"] ?? ""),
    epsWatched: int(r["Eps Watched (For Pending)"] ?? ""),
    year: int(r.YOR ?? "") ?? m?.seasonYear ?? null,
    genres: (r.Genre || "").split(",").map((g) => g.trim()).filter(Boolean),
    al: m
      ? {
          id: m.id,
          title: m.title.english || m.title.romaji,
          episodes: m.episodes ?? null,
          crowd: m.averageScore ?? null,
          genres: m.genres ?? [],
          status: m.status ?? "",
          url: m.siteUrl ?? "",
          cover: m.coverImage?.medium ?? "",
          sequels,
        }
      : null,
  });
}

const books = [];
for (const r of manga) {
  const name = r.Name?.trim();
  if (!name) continue;
  const m = await lookup(name, "MANGA");
  books.push({
    name,
    category: r.Category?.trim() || "",
    read: r["Read Status"]?.trim() || "",
    pub: r["Publication Status"]?.trim() || "",
    score: stars(r["Score /5"] ?? ""),
    chaptersRead: int(r["Chapters Read"] ?? ""),
    chaptersTotal: int(r["Total Chapters"] ?? "") ?? m?.chapters ?? null,
    al: m ? { id: m.id, title: m.title.english || m.title.romaji, crowd: m.averageScore ?? null, url: m.siteUrl ?? "", cover: m.coverImage?.medium ?? "" } : null,
  });
}

mkdirSync(cacheDir, { recursive: true });
writeFileSync(cachePath, JSON.stringify(cache));

if (failed && existsSync(outPath)) {
  console.warn(`[gen-weeb] ${failed} lookup(s) failed — keeping the existing file rather than shipping a gap`);
  process.exit(0);
}

const count = (arr, fn) => arr.reduce((m, x) => { const k = fn(x); m[k] = (m[k] ?? 0) + 1; return m; }, {});
const pct = (a, b) => (b ? +((100 * a) / b).toFixed(1) : 0);

const byWatch = count(shows.filter((s) => s.watch), (s) => s.watch);
const paired = shows.filter((s) => s.done != null && s.out != null);
const behind = paired.filter((s) => s.done < s.out);
const seasonsOut = paired.reduce((n, s) => n + s.out, 0);
const seasonsDone = paired.reduce((n, s) => n + Math.min(s.done, s.out), 0);

const caughtUpRate = (status) => {
  const set = paired.filter((s) => s.watch === status);
  return set.length ? { n: set.length, pct: pct(set.filter((s) => s.done >= s.out).length, set.length) } : null;
};

// The stale rows: he marked himself caught up, and AniList knows a sequel
// exists. This is the list the Notion table structurally cannot produce.
const stale = shows
  .filter((s) => s.al?.sequels.length && s.done != null && s.out != null && s.done >= s.out)
  .map((s) => ({ name: s.name, sequel: s.al.sequels[0].title, year: s.al.sequels[0].year, status: s.al.sequels[0].status }))
  .sort((a, b) => (b.year ?? 0) - (a.year ?? 0));

// Taste vs the crowd. AniList scores 0-100, his are 1-5 — compare each on its
// own scale (his ×20) only where BOTH exist, and say n out loud.
const rated = shows.filter((s) => s.score > 0 && s.al?.crowd != null);
const divergence = rated
  .map((s) => ({ name: s.name, mine: s.score, crowd: s.al.crowd, delta: s.score * 20 - s.al.crowd }))
  .sort((a, b) => b.delta - a.delta);

const scoreDist = count(shows.filter((s) => s.score > 0), (s) => s.score);
const deepestGaps = behind
  .map((s) => ({ name: s.name, gap: s.out - s.done }))
  .sort((a, b) => b.gap - a.gap)
  .slice(0, 8);

const out = {
  generatedAt: new Date().toISOString().slice(0, 10),
  anime: {
    total: shows.length,
    matched: shows.filter((s) => s.al).length,
    byWatch,
    scoreDist,
    scored: shows.filter((s) => s.score > 0).length,
    seasonsOut,
    seasonsDone,
    behindCount: behind.length,
    pairedCount: paired.length,
    unwatchedSeasons: behind.reduce((n, s) => n + (s.out - s.done), 0),
    deepestGaps,
    caughtUp: {
      completed: caughtUpRate("Completed"),
      paused: caughtUpRate("Paused"),
      watching: caughtUpRate("Watching"),
    },
  },
  manga: {
    total: books.length,
    byRead: count(books.filter((b) => b.read), (b) => b.read),
    chaptersRead: books.reduce((n, b) => n + (b.chaptersRead ?? 0), 0),
  },
  stale,
  divergence: { n: rated.length, top: divergence.slice(0, 6), bottom: divergence.slice(-6).reverse() },
  // The per-title arrays are deliberately NOT emitted. Nothing renders them —
  // the room shows aggregates and eight example rows — and shipping all 154
  // enriched records (covers, genres, sequel edges) cost 130 kB in the route
  // chunk to display about twenty numbers. The raw rows stay in data/weeb/*.csv
  // and the AniList half re-derives from cache in seconds, so a future grid can
  // add them back by extending this object.
};

writeFileSync(
  outPath,
  `// AUTO-GENERATED by scripts/gen-weeb.mjs — do not edit by hand.\n` +
    `// Source: data/weeb/*.csv (Notion export) enriched with AniList public GraphQL.\n` +
    `export const weeb = ${JSON.stringify(out, null, 2)} as const;\n`,
);

console.log(
  `[gen-weeb] ${shows.length} anime + ${books.length} manga · ${fetched} fetched, ${Object.keys(cache).length} cached · ` +
    `${out.anime.matched}/${shows.length} matched · ${stale.length} stale rows · ` +
    `${out.anime.unwatchedSeasons} unwatched seasons → src/data/weeb.ts`,
);
