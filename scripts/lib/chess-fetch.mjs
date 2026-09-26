// scripts/lib/chess-fetch.mjs
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { fetchWithTimeout } from "./net.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const cacheDir = join(root, ".chess-cache");

/** chess.com returns 403 for any request without a descriptive User-Agent,
 * and asks that it carry contact info. Verified 2026-07-30. */
export const UA = "cv-siddharth-portfolio/1.0 (siddharthpandalai990@gmail.com)";

/** One small JSON document. The 20s default deadline suits a single monthly
 * archive, and the built-in 429/5xx backoff is a bonus for walkArchives. */
export async function getJson(url, extraHeaders = {}) {
  const res = await fetchWithTimeout(url, { headers: { "User-Agent": UA, ...extraHeaders } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

/**
 * The lichess game export: one streamed line per game. Kept for the rare
 * caller that genuinely wants the whole account export in one shot (none
 * left in this repo after this lane — fetchLichessMonthly below is what
 * gen-chess-stats.mjs actually calls); a single rejection here used to fail
 * the ENTIRE corpus at once, which is the resilience problem this lane fixes.
 */
export async function getNdjson(url) {
  const res = await fetchWithTimeout(
    url,
    { headers: { "User-Agent": UA, Accept: "application/x-ndjson" } },
    { timeoutMs: 15 * 60_000, retries: 0 },
  );
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const text = await res.text();
  return parseNdjson(text);
}

function parseNdjson(text) {
  return text.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
}

/** `YYYY-MM` for a UTC calendar month. */
export function monthKey(y, m) {
  return `${y}-${String(m + 1).padStart(2, "0")}`;
}

/** Every UTC calendar month from `fromMs` to `toMs`, inclusive, as {y, m, key}. */
export function monthsBetween(fromMs, toMs) {
  const out = [];
  const from = new Date(fromMs);
  const to = new Date(toMs);
  let y = from.getUTCFullYear();
  let m = from.getUTCMonth();
  const endY = to.getUTCFullYear();
  const endM = to.getUTCMonth();
  while (y < endY || (y === endY && m <= endM)) {
    out.push({ y, m, key: monthKey(y, m) });
    m++;
    if (m > 11) {
      m = 0;
      y++;
    }
  }
  return out;
}

function cachePath(dir, name) {
  return join(cacheDir, dir, name);
}
function readCacheText(dir, name) {
  const f = cachePath(dir, name);
  return existsSync(f) ? readFileSync(f, "utf8") : null;
}
function writeCacheText(dir, name, text) {
  mkdirSync(join(cacheDir, dir), { recursive: true });
  writeFileSync(cachePath(dir, name), text);
}

async function defaultLichessMonthFetch(username, y, m) {
  const since = Date.UTC(y, m, 1);
  const until = Date.UTC(y, m + 1, 1);
  const res = await fetchWithTimeout(
    `https://lichess.org/api/games/user/${username}?max=1000&opening=true&moves=false&clocks=false&evals=false&since=${since}&until=${until}`,
    { headers: { "User-Agent": UA, Accept: "application/x-ndjson" } },
    // 60s, not the 15-minute whole-corpus budget: a single month is at most a
    // few hundred games. 3 retries (4 attempts total) per the resilience brief.
    { timeoutMs: 60_000, retries: 3 },
  );
  if (!res.ok) throw new Error(`${res.status} lichess ${monthKey(y, m)}`);
  return res.text();
}

/**
 * Lichess games fetched in per-calendar-month slices, each cached at
 * `.chess-cache/lichess/YYYY-MM.ndjson`.
 *
 * The previous shape pulled the whole account in one 15-minute NDJSON stream
 * with a single retry, so one stall anywhere in 14k games failed the entire
 * refresh. A CLOSED month never changes again — lichess does not backdate
 * games — so once it is cached here it is done forever; only the CURRENT
 * month is worth refetching on every run, and a failure on it (or on a
 * closed month this cache has never fetched) falls back to whatever is
 * cached rather than discarding the months that DID resolve.
 *
 * Returns `{ games, unresolved }`. `unresolved` lists months that failed
 * AND have no cached slice at all — a genuine gap the caller must refuse to
 * write over the committed corpus for (see gen-chess-stats.mjs).
 */
export async function fetchLichessMonthly(username, { now = new Date(), sinceMs, fetchMonth = defaultLichessMonthFetch } = {}) {
  const months = monthsBetween(sinceMs, now.getTime());
  const currentKey = monthKey(now.getUTCFullYear(), now.getUTCMonth());
  const games = [];
  const unresolved = [];
  for (const { y, m, key } of months) {
    const cacheName = `${key}.ndjson`;
    const cached = readCacheText("lichess", cacheName);
    if (cached !== null && key !== currentKey) {
      games.push(...parseNdjson(cached));
      continue;
    }
    try {
      const text = await fetchMonth(username, y, m);
      writeCacheText("lichess", cacheName, text);
      games.push(...parseNdjson(text));
    } catch (e) {
      if (cached !== null) {
        games.push(...parseNdjson(cached));
      } else {
        unresolved.push({ month: key, error: e.message });
      }
    }
  }
  return { games, unresolved };
}

async function defaultChessComArchiveList(username) {
  return getJson(`https://api.chess.com/pub/player/${username}/games/archives`);
}
async function defaultChessComArchiveFetch(url) {
  const res = await fetchWithTimeout(url, { headers: { "User-Agent": UA } }, { retries: 3 });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

/**
 * chess.com games, one archive (= one calendar month) per request, cached the
 * same way as the lichess half at `.chess-cache/chesscom/YYYY-MM.json`.
 *
 * chess.com's own archive list already IS the month key set — a closed
 * month's URL simply stops changing, so no client-side month math like
 * lichess needs is required here.
 */
export async function fetchChessComMonthly(username, { now = new Date(), fetchArchiveList = defaultChessComArchiveList, fetchArchive = defaultChessComArchiveFetch } = {}) {
  const { archives } = await fetchArchiveList(username);
  const currentKey = monthKey(now.getUTCFullYear(), now.getUTCMonth());
  const games = [];
  const unresolved = [];
  for (const url of archives) {
    const m = /\/(\d{4})\/(\d{2})$/.exec(url);
    const key = m ? `${m[1]}-${m[2]}` : url;
    const cacheName = `${key}.json`;
    const cached = readCacheText("chesscom", cacheName);
    if (cached !== null && key !== currentKey) {
      games.push(...JSON.parse(cached).games);
      continue;
    }
    try {
      const text = await fetchArchive(url);
      writeCacheText("chesscom", cacheName, text);
      games.push(...JSON.parse(text).games);
    } catch (e) {
      if (cached !== null) {
        games.push(...JSON.parse(cached).games);
      } else {
        unresolved.push({ month: key, error: e.message });
      }
    }
  }
  return { games, unresolved };
}

/**
 * Walks every monthly chess.com archive serially and returns the flat games
 * list, with no per-month resilience. Callers that need to know WHICH month
 * failed (gen-chess-stats.mjs) use fetchChessComMonthly instead; this stays
 * for a caller that just wants "give me everything or throw" and a progress
 * callback. chess.com documents unlimited serial access but 429s on parallel
 * requests, so this must not be Promise.all'd.
 */
export async function walkArchives(username, onProgress = () => {}) {
  const { archives } = await getJson(`https://api.chess.com/pub/player/${username}/games/archives`);
  const games = [];
  for (const [i, url] of archives.entries()) {
    const { games: monthly } = await getJson(url);
    games.push(...monthly);
    onProgress(i + 1, archives.length);
  }
  return games;
}

export function readCache(name) {
  const f = join(cacheDir, `${name}.json`);
  return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null;
}

export function writeCache(name, data) {
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(join(cacheDir, `${name}.json`), JSON.stringify(data));
}
