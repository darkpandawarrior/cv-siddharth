// scripts/lib/chess-fetch.mjs
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const cacheDir = join(root, ".chess-cache");

/** chess.com returns 403 for any request without a descriptive User-Agent,
 * and asks that it carry contact info. Verified 2026-07-30. */
export const UA = "cv-siddharth-portfolio/1.0 (siddharthpandalai990@gmail.com)";

export async function getJson(url, extraHeaders = {}) {
  const res = await fetch(url, { headers: { "User-Agent": UA, ...extraHeaders } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

export async function getNdjson(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/x-ndjson" } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const text = await res.text();
  return text.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
}

/**
 * Walks every monthly archive serially. chess.com documents unlimited serial
 * access but 429s on parallel requests, so this must not be Promise.all'd.
 * Measured: 45 archives in ~39s.
 */
export async function walkArchives(username, onProgress = () => {}) {
  const { archives } = await getJson(
    `https://api.chess.com/pub/player/${username}/games/archives`,
  );
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
