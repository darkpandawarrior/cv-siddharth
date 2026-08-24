/**
 * The third app in the set.
 *
 * Each client on the shelf is here because it shipped a rider app, a driver app,
 * or both. Several of them also ran a merchant side — a shop, restaurant or
 * vendor app on the same platform — and those never appear in the rider/driver
 * data, so the shelf has been quietly missing a third of some clients.
 *
 * Play publishes a page per developer listing everything that company ships, so
 * this walks the developer page of every client already on the shelf and looks
 * for apps that are not.
 *
 * WHAT IT WILL AND WILL NOT CLAIM. "Same company" is not the same as "same
 * work": a taxi client's account can also hold something unrelated that nobody
 * here ever touched. So a sibling is only kept when its PACKAGE ID shares the
 * client's own stem — `product.merchant.zofeur` next to `product.customer.zofeur`
 * — which is the naming the platform itself imposes and is not something an
 * unrelated app would coincidentally match. Everything else is reported to the
 * console and dropped.
 *
 * Writes .store-siblings.json (gitignored). gen-store.mjs merges it.
 *
 * Usage: node scripts/gen-store-siblings.mjs
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

import { fetchWithTimeout } from "./lib/net.mjs";
const STORE_CACHE = resolve(process.cwd(), ".store-cache.json");
const OUT = resolve(process.cwd(), ".store-siblings.json");
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/** The distinctive middle of a package id: what a client's apps have in common. */
function stem(id) {
  return id
    .split(".")
    .filter(
      (p) =>
        !/^(product|production|products|producton|com|io|app|net|org|xyz|customer|driver|rider|user|passenger|partner|merchant|vendor|store|shop|agent|courier|chauffeur|client|captain|delivery)$/i.test(
          p,
        ),
    )
    .sort((a, b) => b.length - a.length)[0]
    ?.toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const store = JSON.parse(readFileSync(STORE_CACHE, "utf8"));
const known = new Set(Object.keys(store));

/** One developer page per company already on the shelf. */
const developers = new Map();
for (const [id, r] of Object.entries(store)) {
  if (!r.live || !r.developerId) continue;
  if (!developers.has(r.developerId)) developers.set(r.developerId, []);
  developers.get(r.developerId).push(id);
}
console.log(`[siblings] ${developers.size} developer page(s) to walk`);

const found = {};
let rejected = 0;
const queue = [...developers.entries()];

await Promise.all(
  Array.from({ length: 5 }, async () => {
    for (;;) {
      const entry = queue.shift();
      if (!entry) return;
      const [devId, ownIds] = entry;
      const stems = new Set(ownIds.map(stem).filter(Boolean));
      try {
        const res = await fetchWithTimeout(`https://play.google.com/store/apps/dev?id=${devId}&hl=en`, {
          headers: { "user-agent": UA },
        });
        if (!res.ok) continue;
        const html = await res.text();
        const ids = [
          ...new Set([...html.matchAll(/details\?id=([A-Za-z0-9_.]+)/g)].map((m) => m[1])),
        ];
        for (const id of ids) {
          if (known.has(id) || found[id]) continue;
          if (!stems.has(stem(id))) {
            rejected++;
            if (process.env.SIBLINGS_VERBOSE) console.log(`[siblings] REJECT ${id} (dev ${devId})`);
            continue;
          }
          found[id] = { developerId: devId, siblingOf: ownIds[0] };
          console.log(`[siblings] ${id}  (with ${ownIds[0]})`);
        }
      } catch {
        /* a developer page that will not load is not evidence of anything */
      }
    }
  }),
);

writeFileSync(OUT, JSON.stringify(found));
console.log(
  `[siblings] kept ${Object.keys(found).length}, dropped ${rejected} same-publisher app(s) whose id does not match a client stem`,
);
