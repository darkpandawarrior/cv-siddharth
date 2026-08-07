/**
 * The apps that used to be on the Play Store.
 *
 * scripts/gen-store.mjs asks Play which mined package ids are live. This asks
 * the Internet Archive about the ones that are not — because "this id 404s
 * today" and "this app was never published" are different statements, and only
 * the first one is provable from Play alone.
 *
 * A CDX record with statuscode 200 for
 * `play.google.com/store/apps/details?id=<id>` is proof the listing existed:
 * Play answers 404 for a package it has never published, and the Archive stores
 * the status it received. Where a snapshot exists, the archived page is fetched
 * and its JSON-LD read for the name and rating the app had at that moment.
 *
 * ABSENCE PROVES NOTHING HERE, and the output says so. The Archive crawls
 * whatever it happens to crawl; a small client app in Cameroon can be published
 * for three years and never be snapshotted once. So this produces a FLOOR on
 * how many of these shipped, never a count of how many did not.
 *
 * WHY IT IS FAST. The obvious implementation — one CDX query per package id —
 * takes ~15 seconds a query, which is seven hours for 1,250 ids. CDX also
 * accepts `matchType=prefix`, and every id here shares a namespace with dozens
 * of others (`product.customer.`, `production.`, `com.<vendor>`). Asking for a
 * whole namespace at once returns every archived listing under it in about a
 * second, and the answer for 1,250 ids arrives in a couple of minutes instead.
 *
 * Usage: node scripts/gen-store-archive.mjs   (then: npm run gen:store)
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const STORE_CACHE = resolve(process.cwd(), ".store-cache.json");
const ARCHIVE_CACHE = resolve(process.cwd(), ".store-archive-cache.json");
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const get = (url, ms) =>
  fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(ms) });

/**
 * The namespace to ask about for a given id.
 *
 * One segment is enough for the platform's own namespaces — `product.`,
 * `production.` and friends are rare enough on Play that the whole thing comes
 * back in one page. `com.` is not: it is most of the store, so those get two
 * segments (`com.snape`, `com.liftethiopia`) to stay small.
 */
const CROWDED = new Set(["com", "io", "app", "net", "org"]);
const namespaceOf = (id) => {
  const parts = id.split(".");
  return CROWDED.has(parts[0]) ? parts.slice(0, 2).join(".") : `${parts[0]}.`;
};

/**
 * Every archived listing under a namespace: id → 200-status timestamps, sorted.
 *
 * Retries, and throws rather than returning empty, because an empty result and
 * a failed request are indistinguishable to the caller and mean opposite things.
 */
async function crawlNamespace(prefix) {
  const target = encodeURIComponent(`play.google.com/store/apps/details?id=${prefix}`);
  const url = `https://web.archive.org/cdx/search/cdx?url=${target}&matchType=prefix&output=json&fl=timestamp,original,statuscode&limit=50000`;
  let text = "";
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await get(url, 180000);
      text = await res.text();
      // CDX answers 200-with-empty for a namespace it has never crawled, and
      // 429/5xx-with-HTML when it is being asked too much. Only the first is data.
      if (res.ok && (!text.trim() || text.trim().startsWith("["))) break;
    } catch {
      /* fall through to the backoff */
    }
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    if (attempt === 3) throw new Error(`CDX unavailable for ${prefix}`);
  }
  const byId = new Map();
  if (!text.trim().startsWith("[")) return byId;
  for (const [ts, original, status] of JSON.parse(text).slice(1)) {
    if (status !== "200") continue;
    // The archived URL carries whatever query string the crawler followed
    // (&hl=, &pcampaignid=…), so read the id back off it rather than assuming.
    const id = /[?&]id=([^&]+)/.exec(original)?.[1];
    if (!id) continue;
    if (!byId.has(id)) byId.set(id, []);
    byId.get(id).push(ts);
  }
  for (const list of byId.values()) list.sort();
  return byId;
}

/**
 * The listing as the Archive saw it. `id_` asks for the original bytes.
 *
 * Retries: the Archive throttles hard once a run has been at it for a while, and
 * a throttled fetch here costs the app its name on the page.
 */
async function archived(id, ts) {
  const url = `https://web.archive.org/web/${ts}id_/https://play.google.com/store/apps/details?id=${id}`;
  let html = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await get(url, 60000);
      if (res.ok) {
        html = await res.text();
        break;
      }
    } catch {
      /* fall through to the backoff */
    }
    await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
  }
  if (!html) throw new Error(`archived page unavailable for ${id}`);
  // Play's JSON-LD is the only structure stable across a decade of layouts.
  const ld = /"@type"\s*:\s*"SoftwareApplication".{0,4000}?\}\s*\}/s.exec(html)?.[0] ?? html;
  // The name is lifted out of a JSON string, so it still carries JSON escapes —
  // Play writes "Drive & Deliver". Let JSON itself undo them.
  const unescape = (s) => {
    if (s == null) return null;
    try {
      return JSON.parse(`"${s}"`);
    } catch {
      return s;
    }
  };
  return {
    name: unescape(/"name"\s*:\s*"([^"]{1,80})"/.exec(ld)?.[1] ?? null),
    rating: Number(/"ratingValue"\s*:\s*"?([0-9.]+)"?/.exec(ld)?.[1]) || null,
    ratings: Number(/"ratingCount"\s*:\s*"?([0-9]+)"?/.exec(ld)?.[1]) || null,
  };
}

const store = JSON.parse(readFileSync(STORE_CACHE, "utf8"));
const cache = existsSync(ARCHIVE_CACHE) ? JSON.parse(readFileSync(ARCHIVE_CACHE, "utf8")) : {};
const dead = Object.keys(store).filter((id) => !store[id].live);

/**
 * Read the newest archived listing for each proven-archived id.
 *
 * Concurrency 2, because the Archive throttles and a throttled fetch costs the
 * app its name. `wasLive` is written either way: the snapshot's existence is the
 * claim, and losing the name must never lose the evidence.
 */
async function readListings(ids, stampsById) {
  const queue = ids.filter((id) => !cache[id]?.wasLive || !cache[id]?.name);
  console.log(`[archive] reading ${queue.length} listing(s)`);
  let done = 0;
  const record = (id, stamps, meta) => {
    cache[id] = {
      wasLive: true,
      name: null,
      rating: null,
      ratings: null,
      ...meta,
      firstSeen: stamps[0].slice(0, 8),
      lastSeen: stamps.at(-1).slice(0, 8),
      snapshots: stamps.length,
      url: `https://web.archive.org/web/${stamps.at(-1)}/https://play.google.com/store/apps/details?id=${id}`,
    };
  };
  await Promise.all(
    Array.from({ length: 2 }, async () => {
      for (;;) {
        const id = queue.shift();
        if (id === undefined) return;
        const stamps = stampsById.get(id);
        try {
          // Newest snapshot: the last time anyone saw it on the store.
          record(id, stamps, await archived(id, stamps.at(-1)));
        } catch {
          record(id, stamps, {});
        }
        if (++done % 10 === 0) {
          writeFileSync(ARCHIVE_CACHE, JSON.stringify(cache));
          console.log(`[archive] ${done} read · ${Object.values(cache).filter((r) => r.name).length} named`);
        }
      }
    }),
  );
  writeFileSync(ARCHIVE_CACHE, JSON.stringify(cache));
}

function report() {
  const wasLive = Object.values(cache).filter((r) => r.wasLive);
  console.log(
    `\n[archive] PROVABLY ONCE LIVE: ${wasLive.length} of ${Object.keys(cache).length}` +
      ` · ${wasLive.filter((r) => r.name).length} named`,
  );
}

/* ── 1. One CDX sweep per namespace ─────────────────────────────────────── */

/* `--names` skips the sweep and only re-reads listings for ids already proven
 * archived. The Archive throttles a heavy run hard, and when it does, phase 2
 * loses names while phase 1's evidence is already safely cached — so retrying
 * should not mean paying for the whole index scan again. */
const namesOnly = process.argv.includes("--names");
if (namesOnly) {
  const seenFromCache = new Map();
  for (const [id, r] of Object.entries(cache)) {
    const ts = r.wasLive && /\/web\/(\d{14})\//.exec(r.url ?? "")?.[1];
    if (ts) seenFromCache.set(id, [r.firstSeen ?? ts, ts]);
  }
  console.log(`[archive] --names: ${seenFromCache.size} archived ids from cache, no CDX sweep`);
  await readListings(
    dead.filter((id) => seenFromCache.has(id)),
    seenFromCache,
  );
  report();
  process.exit(0);
}

const namespaces = [...new Set(dead.map(namespaceOf))];
console.log(`[archive] ${dead.length} dead ids across ${namespaces.length} namespaces`);

const seen = new Map();
const failed = new Set();
{
  const queue = [...namespaces];
  let done = 0;
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      for (;;) {
        const prefix = queue.shift();
        if (prefix === undefined) return;
        try {
          for (const [id, stamps] of await crawlNamespace(prefix)) seen.set(id, stamps);
        } catch {
          // A namespace that never answered is retried on the next run. Never
          // record a failed lookup as "no snapshot" — that invents evidence.
          failed.add(prefix);
        }
        if (++done % 25 === 0) console.log(`[archive] ${done}/${namespaces.length} namespaces`);
      }
    }),
  );
}
if (failed.size) console.warn(`[archive] ${failed.size} namespace(s) unavailable — re-run to cover`);

const hits = dead.filter((id) => seen.has(id));
console.log(`[archive] ${hits.length} of ${dead.length} were archived at least once`);

/* ── 2. Read the last snapshot of each one that was ─────────────────────── */

/* Only write a negative for an id whose namespace actually answered, and NEVER
 * over a positive already on record.
 *
 * The first version of this did `cache[id] = {wasLive:false}` for everything not
 * in `seen`, and a rate-limited re-run duly turned 88 proven-published apps into
 * 25. A downgrade from "we have the crawl" to "there is no crawl" can only ever
 * be a bug: the Archive does not lose snapshots between two runs a minute apart. */
for (const id of dead) {
  if (seen.has(id) || cache[id]?.wasLive || failed.has(namespaceOf(id))) continue;
  cache[id] = { wasLive: false };
}

await readListings(hits, seen);
report();
