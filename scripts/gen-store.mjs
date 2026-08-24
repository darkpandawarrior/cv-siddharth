/**
 * Generates src/data/store.ts — the shipped-app shelf.
 *
 * NOTHING HERE IS TYPED FROM MEMORY. Every package id is verified against the
 * live Play Store before it is written, and an id that does not resolve is
 * dropped rather than shipped as a dead link, because a broken store link on a
 * portfolio reads as a claim that did not survive contact.
 *
 * WHAT IT PRODUCES:
 *
 * 1. THE FLAGSHIPS — the products themselves, one card each.
 *
 * 2. THE WHITE-LABEL FLEET. The rider and driver apps were a white-label
 *    platform: every client shipped as its own rebranded build with its own
 *    package id and its own listing. This collects those ids, asks Play which
 *    still resolve, and reads each live listing for its icon, rating, install
 *    bucket, update date and — the whole argument in one field — the name of
 *    the company that publishes it.
 *
 * 3. THE DELISTED — merged in from scripts/gen-store-archive.mjs, which proves
 *    from the Internet Archive that a dead id was once a real listing. Run that
 *    first if you want the tier; this works without it.
 *
 * 4. THE TENURE RULE (see JOINED) — the part that decides what belongs here at
 *    all, and the reason the shelf is smaller than the raw data.
 *
 * Reads two source checkouts named by environment variable (see REPOS). The
 * generated data is committed, so a build never needs them. The Play probe is
 * cached in .store-cache.json (gitignored) so a re-run is cheap; delete it to
 * re-probe, or bump PROBE_V to re-read the live listings.
 *
 * Usage: SHELF_RIDER_REPO=... SHELF_DRIVER_REPO=... npm run gen:store
 */
import { writeFileSync, readFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

import { fetchWithTimeout } from "./lib/net.mjs";
const CACHE = resolve(process.cwd(), ".store-cache.json");
/** Written by scripts/gen-store-archive.mjs. Optional — the fleet works without it. */
const ARCHIVE_CACHE = resolve(process.cwd(), ".store-archive-cache.json");
/** Written by scripts/gen-store-flavours.mjs. Optional — brand colours and the
 *  icons of apps Play cannot supply one for, because they are no longer on it. */
const FLAVOUR_CACHE = resolve(process.cwd(), ".store-flavours.json");
/** First-seen dates for still-live listings, from scripts/gen-store-archive.mjs. */
const SINCE_CACHE = resolve(process.cwd(), ".store-since-cache.json");
/** Extra apps of clients already on the shelf, from scripts/gen-store-siblings.mjs. */
const SIBLINGS_CACHE = resolve(process.cwd(), ".store-siblings.json");
const OUT = resolve(process.cwd(), "src/data/store.ts");
const ICON_DIR = resolve(process.cwd(), "public/store");

/**
 * The two source checkouts this generator reads, supplied by the operator.
 *
 * Deliberately NOT hardcoded and deliberately not named: this repository is
 * public, the inputs are not, and a path is a statement about what is on
 * somebody's disk. Set them when you run it:
 *
 *   SHELF_RIDER_REPO=... SHELF_DRIVER_REPO=... npm run gen:store
 *
 * Without them the script refuses to run rather than inventing a shelf. The
 * generated src/data/store.ts is committed, so a build never needs either.
 */
const REPOS = [
  { dir: process.env.SHELF_RIDER_REPO, side: "rider" },
  { dir: process.env.SHELF_DRIVER_REPO, side: "driver" },
].filter((r) => r.dir);

/** His committer identity in those repos. */
const AUTHOR = "siddharth.pandalai";

/**
 * January 2021 — the month he joined Jugnoo. The whole shelf hinges on it.
 *
 * A white-label branch estate is nine years deep and most of it predates him.
 * An app whose last shipped build went out in 2019 cannot contain a line he
 * wrote, and listing it as work he touched would be the exact kind of quiet
 * inflation this generator exists to prevent. So an app is only counted when
 * there is evidence it was still on the store on or after this date:
 *
 *   - a live app carries Play's own "Updated on", i.e. when the binary you can
 *     install right now was published;
 *   - a delisted one carries the last date the Internet Archive saw its listing.
 *
 * The second is a LOWER BOUND, not a death certificate — the Archive stops
 * crawling long before an app stops existing — so this rule under-counts, and
 * under-counting is the right direction for a portfolio. The apps it removes are
 * reported rather than silently dropped.
 */
const JOINED = "2021-01";

/** Read from the primary flavours. These get their own cards. */
const FLAGSHIPS = [
  { id: "io.eka.ekav2", role: "Technical owner & Product Owner", employer: "Dice.tech" },
  { id: "product.clicklabs.jugnoo", role: "Android developer", employer: "Jugnoo" },
  { id: "product.clicklabs.jugnoo.driver", role: "Android developer", employer: "Jugnoo" },
];

/**
 * The base app and the unbranded templates on master. Not clients — excluding
 * them is what makes the fleet count a count of *clients*.
 */
const NOT_A_CLIENT = /^product\.clicklabs\.jugnoo(\.driver)?$|white|tempwl|\.wl$/i;

const git = (dir, args) =>
  execFileSync("git", ["-C", dir, ...args], { encoding: "utf8", maxBuffer: 1 << 28 });

/* ── 1. Mine ────────────────────────────────────────────────────────────── */

/** Every distinct client package id in the sources, with provenance. */
function mine() {
  const clients = new Map();
  let branchCount = 0;

  if (REPOS.length === 0)
    throw new Error("[gen-store] set SHELF_RIDER_REPO and SHELF_DRIVER_REPO — refusing to guess");
  for (const { dir, side } of REPOS) {
    if (!existsSync(dir)) throw new Error(`[gen-store] no checkout at ${dir}`);
    const base = ["origin/master", "origin/main"].find((r) => {
      try {
        git(dir, ["rev-parse", "--verify", "-q", r]);
        return true;
      } catch {
        return false;
      }
    });
    if (!base) throw new Error(`[gen-store] no base branch in ${dir}`);

    const branches = git(dir, ["branch", "-r", "--format=%(refname:short)"])
      .split("\n")
      .filter((b) => /\/wl[_-]/i.test(b));

    /* Pass A — every applicationId ever COMMITTED, and who introduced it.
     *
     * Reading only the current state misses any client whose id was later changed,
     * and the first version of this script did miss 121 of them. Walking the
     * history catches every id that ever existed and identifies who introduced
     * each one for free — and it is ~20x faster than searching per id, which is
     * what it replaced.
     *
     * SCOPED TO THE CLIENT WORK, and the difference is not cosmetic. Widen it and
     * it reaches product-line history, where in 2018 an outside team set up an
     * app that is on the store today with a million installs. It resolves, so it
     * would have been written into the fleet — but it was never a client of this
     * platform, it predates him by two years, and nothing shows the binary
     * shipping today is that build. The scope is what keeps it out. */
    const history = git(dir, [
      "log",
      "--glob=refs/remotes/origin/[wW]l[_-]*",
      "-p",
      "--no-renames",
      "--format=@@%H|%ae",
      "--",
      "*build.gradle",
    ]);
    let email = "";
    for (const line of history.split("\n")) {
      if (line.startsWith("@@") && line.includes("|")) {
        email = line.split("|")[1];
        continue;
      }
      if (line[0] !== "+") continue;
      const id = /^\+\s*applicationId\s*["']([^"']+)["']/.exec(line)?.[1];
      if (!id || NOT_A_CLIENT.test(id)) continue;
      const prev = clients.get(id);
      clients.set(id, {
        id,
        side: prev?.side ?? side,
        commits: prev?.commits ?? 0,
        setUpByHim: email.startsWith(AUTHOR),
      });
    }

    /* Pass B — how much of each client's build is his.
     *
     * Work of his that a client's line of development carries and the mainline
     * does not: his contribution is in that build even where he did not start
     * it. */
    for (const branch of branches) {
      // git grep -E is POSIX ERE, which has no \s — anchor in JS instead.
      let lines;
      try {
        lines = git(dir, ["grep", "-h", "-E", "applicationId", branch, "--", "*build.gradle"]);
      } catch {
        continue; // branch has no gradle file, or no match (grep exits 1)
      }
      const ids = [
        ...new Set(
          lines
            .split("\n")
            .map((l) => /^\s*applicationId\s*["']([^"']+)["']/.exec(l)?.[1])
            .filter((id) => id && !NOT_A_CLIENT.test(id)),
        ),
      ];
      if (ids.length === 0) continue;
      branchCount++;

      const mineHere = Number(
        git(dir, ["rev-list", "--count", `--author=${AUTHOR}`, `${base}..${branch}`]).trim(),
      );
      for (const id of ids) {
        const e = clients.get(id);
        if (e) e.commits = Math.max(e.commits, mineHere);
      }
    }
  }
  return { clients: [...clients.values()], branchCount };
}

/* ── 2. Verify ──────────────────────────────────────────────────────────── */

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/** Cache schema version. Bump to force a re-probe of everything already live. */
const PROBE_V = 5;

const unescape = (s) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\+/g, " ")
    .trim();

async function probe(id) {
  const url = `https://play.google.com/store/apps/details?id=${id}&hl=en`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetchWithTimeout(url, { headers: { "user-agent": UA } });
      if (res.status === 404) return { v: PROBE_V, live: false };
      if (res.status === 429 || res.status >= 500) {
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        continue;
      }
      const html = await res.text();
      const name = html.match(/itemprop="name"[^>]*>([^<]{1,80})/)?.[1]?.trim();
      if (!name) return { v: PROBE_V, live: false };
      return {
        v: PROBE_V,
        live: true,
        // Play HTML-escapes listing names; they land in JSX as text, so decode.
        name: unescape(name),
        rating: Number(html.match(/aria-label="Rated ([0-9.]+) stars/)?.[1]) || null,
        installs: html.match(/([0-9.,]+[KMB]?\+)\s*<\/div><div[^>]*>Downloads/)?.[1] ?? null,
        // "Updated on Jul 22, 2025" — the date the CURRENT binary was published.
        // This is the field that decides whether an app is his: he was at Jugnoo
        // from January 2021, so a client whose shipped build predates that was
        // not built from any commit of his.
        updated: html.match(/Updated on<\/div><div[^>]*>([^<]{4,30})</)?.[1]?.trim() ?? null,
        // The developer name is the whole white-label argument in one field: the
        // listing belongs to the client's own company, not to Jugnoo.
        //
        // Read the ANCHOR TEXT, not the href. Play uses two forms of developer
        // link — `?id=Some+Company+Ltd` and `?id=9120420080484665068` — and the
        // numeric one would otherwise put a 19-digit account id on the page
        // where a company name belongs. The link text says "Ryde Technology"
        // either way. The href is the fallback, and only when it isn't a number.
        developer: (() => {
          const m = /<a href="\/store\/apps\/dev(?:eloper)?\?id=([^"&]{1,90})"[^>]*>(?:<[^>]+>)*([^<]{1,80})</.exec(
            html,
          );
          const text = m?.[2]?.trim();
          if (text) return unescape(text);
          const href = m?.[1];
          return href && !/^\d+$/.test(href) ? unescape(decodeURIComponent(href)) : null;
        })(),
        // The id as Play writes it in the link, kept alongside the display name:
        // it is the only form its developer page will answer to, and that page
        // is where the rest of a client's apps live.
        developerId:
          /<a href="\/store\/apps\/dev(?:eloper)?\?id=([^"&]{1,90})"/.exec(html)?.[1] ?? null,
        // First play-lh URL on the page is the app icon, before any screenshot.
        icon: /https:\/\/play-lh\.googleusercontent\.com\/[A-Za-z0-9_-]{20,}/.exec(html)?.[0] ?? null,
        url,
      };
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  return { v: PROBE_V, live: false };
}

/**
 * Icons are downloaded rather than hotlinked. 1 kB each at s128, and it keeps
 * the page self-contained: no request to a Google CDN from a visitor's browser,
 * and nothing that breaks the day play-lh starts refusing cross-origin loads.
 */
async function fetchIcons(apps) {
  mkdirSync(ICON_DIR, { recursive: true });
  let written = 0;
  await Promise.all(
    apps.map(async (a) => {
      const file = resolve(ICON_DIR, `${a.id}.webp`);
      if (!a.icon || existsSync(file)) return;
      try {
        const res = await fetchWithTimeout(`${a.icon}=s128-rw`, { headers: { "user-agent": UA } });
        if (!res.ok) return;
        writeFileSync(file, Buffer.from(await res.arrayBuffer()));
        written++;
      } catch {
        /* the UI falls back to an initial */
      }
    }),
  );
  return written;
}

/** Probes everything not already cached. Concurrency 6 — polite, and fast enough. */
async function verifyAll(ids) {
  const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, "utf8")) : {};
  // Re-probe anything live that predates the current schema, so the icon and
  // developer fields land. A dead id stays dead — no point spending a request.
  const queue = ids.filter((id) => !(id in cache) || (cache[id].live && cache[id].v !== PROBE_V));
  console.log(`[gen-store] probing ${queue.length} listing(s), ${ids.length - queue.length} cached`);
  let done = 0;
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      for (;;) {
        const id = queue.shift();
        if (!id) return;
        cache[id] = await probe(id);
        if (++done % 100 === 0) writeFileSync(CACHE, JSON.stringify(cache));
      }
    }),
  );
  writeFileSync(CACHE, JSON.stringify(cache));
  return cache;
}

/* ── 3. Write ───────────────────────────────────────────────────────────── */

/** "500K+" → 500000, for the floor on combined installs. */
function installFloor(s) {
  const m = /([\d.,]+)([KMB]?)/.exec(s ?? "");
  return m ? parseFloat(m[1].replace(/,/g, "")) * ({ K: 1e3, M: 1e6, B: 1e9 }[m[2]] ?? 1) : 0;
}

const { clients, branchCount } = mine();
console.log(`[gen-store] mined ${clients.length} client ids across ${branchCount} branches`);

/* Apps a client shipped under a package id this data never carried — a rebrand,
 * or a third app in the set. Found on the client's own Play developer page and
 * kept only where the id matches the client's stem (gen-store-siblings.mjs), so
 * "same company" alone never gets anything onto the shelf. */
{
  const siblings = existsSync(SIBLINGS_CACHE)
    ? JSON.parse(readFileSync(SIBLINGS_CACHE, "utf8"))
    : {};
  const have = new Set(clients.map((c) => c.id));
  for (const [id, meta] of Object.entries(siblings)) {
    if (have.has(id)) continue;
    const sib = clients.find((c) => c.id === meta.siblingOf);
    clients.push({
      id,
      side: /driver|captain|partner|chauffeur/i.test(id) ? "driver" : (sib?.side ?? "rider"),
      // Nothing in the source data names this app, so no authorship is claimed
      // for it beyond the client it belongs to.
      commits: 0,
      setUpByHim: false,
    });
  }
  if (Object.keys(siblings).length)
    console.log(`[gen-store] +${Object.keys(siblings).length} sibling app(s) from developer pages`);
}

const store = await verifyAll([...FLAGSHIPS.map((f) => f.id), ...clients.map((c) => c.id)]);

const flagships = FLAGSHIPS.map((f) => ({ ...f, ...store[f.id] })).filter((f) => f.live);
for (const f of FLAGSHIPS) if (!store[f.id]?.live) console.warn(`[gen-store] DROPPED ${f.id}`);
if (flagships.length === 0) throw new Error("[gen-store] no flagship resolved — refusing to write");

const fleet = clients
  .filter((c) => store[c.id]?.live)
  .map((c) => ({ ...c, ...store[c.id] }))
  // Biggest first: installs, then rating. A visitor reads the first row.
  .sort(
    (a, b) =>
      installFloor(b.installs) - installFloor(a.installs) || (b.rating ?? 0) - (a.rating ?? 0),
  );

/* The ones that used to be on the store. See scripts/gen-store-archive.mjs:
 * an archived 200 for the listing URL is proof it was published, and absence of
 * a snapshot is proof of nothing at all — so this is a floor, never a count. */
const archive = existsSync(ARCHIVE_CACHE) ? JSON.parse(readFileSync(ARCHIVE_CACHE, "utf8")) : {};
const delisted = clients
  .filter((c) => !store[c.id]?.live && archive[c.id]?.wasLive)
  .map((c) => ({ ...c, ...archive[c.id] }))
  .sort((a, b) => (b.lastSeen ?? "").localeCompare(a.lastSeen ?? ""));
const archiveChecked = Object.keys(archive).length;

/* First-seen dates for the live listings, also from the Archive. Play never
 * says when an app appeared, only when it was last updated; the earliest crawl
 * of a listing is the closest anyone outside Google gets. */
const since = existsSync(SINCE_CACHE) ? JSON.parse(readFileSync(SINCE_CACHE, "utf8")) : {};
for (const app of fleet) app.firstSeen = since[app.id]?.firstSeen ?? null;

/* Apply the tenure rule. See JOINED. */
const monthOf = (app) =>
  app.updated
    ? new Date(`${app.updated} UTC`).toISOString().slice(0, 7)
    : app.lastSeen
      ? `${app.lastSeen.slice(0, 4)}-${app.lastSeen.slice(4, 6)}`
      : null;
const withinTenure = (app) => {
  const m = monthOf(app);
  // No date at all: keep it only on the direct evidence that he set it up.
  if (!m) return !!app.setUpByHim;
  return m >= JOINED;
};
const predating = [...fleet, ...delisted].filter((a) => !withinTenure(a));
const liveKept = fleet.filter(withinTenure);
const pastKept = delisted.filter(withinTenure);
console.log(
  `[gen-store] tenure rule removed ${predating.length} app(s) last shipped before ${JOINED}`,
);

const iconsWritten = await fetchIcons([...flagships, ...fleet]);
console.log(`[gen-store] ${iconsWritten} new icon(s) downloaded to public/store/`);

/* Brand colours and icons (scripts/gen-store-flavours.mjs).
 *
 * A delisted app has no Play listing left to take an icon from, and the Archive
 * does not keep one. Resolving them separately is what lets these apps be shown
 * as themselves rather than as ninety identical grey rectangles. */
const flavours = existsSync(FLAVOUR_CACHE) ? JSON.parse(readFileSync(FLAVOUR_CACHE, "utf8")) : {};
const iconOnDisk = (id) => existsSync(resolve(ICON_DIR, `${id}.webp`));

/**
 * A readable name for a pulled app whose archived page would not load.
 *
 * The Archive proves these were published and holds the page, but its replay
 * endpoint throttles hard and a handful never come back — which left the shelf
 * printing `com.kadere.driver` where a name belongs. Each build is named after
 * its client, so that name is a fair label, and the tile still links to the
 * archived listing for anyone who wants the official one. Falls back to the
 * distinctive segment of the package id.
 */
function nameFromCode(id) {
  const flavour = flavours[id]?.flavour;
  const raw =
    flavour ??
    id
      .split(".")
      .filter((p) => !/^(product|production|products|com|io|app|net|customer|driver|rider|user|passenger|partner)$/.test(p))
      .sort((a, b) => b.length - a.length)[0];
  if (!raw) return null;
  // camelCase and snake_case both become words: "akbarTravels" → "Akbar Travels".
  // A trailing side word goes too — the tile already says RIDER or DRIVER, and
  // "Kaderedriver" is not a name anyone chose.
  return raw
    .replace(/(driver|rider|customer|passenger|partner)$/i, (m, _w, i) => (i > 2 ? "" : m))
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}
for (const app of [...fleet, ...delisted]) {
  app.color = flavours[app.id]?.color ?? null;
  app.name ??= nameFromCode(app.id);
  // Play's icon is what the app looks like NOW and wins where it exists; the
  // branch icon is what it looked like when it shipped, and is all a pulled app
  // has left.
  if (!app.icon && iconOnDisk(app.id)) app.icon = `branch:${app.id}`;
}

/* Keep only what is referenced. The flavour sweep recovers an icon for every
 * client it can find — 1,100-odd — and shipping 5 MB of PNGs for apps that
 * appear nowhere on the site would be a build artefact masquerading as content. */
{
  const keep = new Set([...flagships, ...liveKept, ...pastKept].filter((a) => a.icon).map((a) => a.id));
  let pruned = 0;
  for (const file of readdirSync(ICON_DIR)) {
    if (!file.endsWith(".webp") || keep.has(file.slice(0, -5))) continue;
    unlinkSync(resolve(ICON_DIR, file));
    pruned++;
  }
  console.log(`[gen-store] kept ${keep.size} icon(s), pruned ${pruned} unreferenced`);
}

/**
 * When each app's last shipped build went out, by year.
 *
 * Live apps use Play's "Updated on" — the binary you can install today. Gone
 * ones use the last date the Internet Archive saw the listing, which is a lower
 * bound on the same thing.
 *
 * Both are dates this generator already relies on to decide what belongs on the
 * shelf at all, which is the point of drawing them: the chart has nothing before
 * the month he joined, and that is a fact a visitor can see instead of a rule
 * they have to take on trust.
 */
function lastShippedByYear(live, past) {
  const years = {};
  const bump = (year, key) => {
    if (!year) return;
    years[year] ??= { year: Number(year), live: 0, gone: 0 };
    years[year][key]++;
  };
  for (const a of live) bump(a.updated && new Date(`${a.updated} UTC`).getUTCFullYear(), "live");
  for (const a of past) bump(Number((a.lastSeen ?? "").slice(0, 4)) || null, "gone");
  return Object.values(years).sort((a, b) => a.year - b.year);
}

/**
 * Group the apps by the client that shipped them.
 *
 * Almost every client shipped a PAIR — one app for riders, one for drivers —
 * which meant the shelf listed the same company twice, side by side, with the
 * same logo and the same publisher. Ninety rows became forty-odd companies and
 * the page stopped reading like a spreadsheet.
 *
 * Keyed on the publisher name where Play gives one, since that is the actual
 * legal owner and is identical across a client's apps. Where it does not (every
 * delisted app, which has no listing left to ask), the package id with the side
 * and the platform's own namespace stripped does the same job:
 * `product.driver.superfix` and `product.customer.superfix` both key to
 * `superfix`.
 */
function groupByClient(apps) {
  const groups = new Map();
  for (const app of apps) {
    const key = (
      app.developer ??
      app.id
        .replace(/^(product|production|products|com|io|app|net)\./, "")
        .replace(/(^|\.)(customer|driver|rider|user|passenger|partner|courier|agent|chauffeur)(\.|$)/g, ".")
    )
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(app);
  }

  return [...groups.entries()].map(([key, list]) => {
    // Rider first, then whichever has the most installs — the card's identity
    // (name, icon, colour) comes from that one.
    const ordered = [...list].sort(
      (a, b) =>
        (a.side === "rider" ? -1 : 1) - (b.side === "rider" ? -1 : 1) ||
        installFloor(b.installs) - installFloor(a.installs),
    );
    const lead = ordered[0];
    return {
      key,
      // The shared part of the two app names is the client's actual name:
      // "Zofeur - Hire a Safe Driver." and "Zofeur - Driver App" → "Zofeur".
      name: sharedName(ordered.map((a) => a.name).filter(Boolean)) ?? lead.name ?? lead.id,
      developer: lead.developer ?? null,
      icon: ordered.find((a) => a.icon)?.icon ?? null,
      color: ordered.find((a) => a.color)?.color ?? null,
      setUpByHim: ordered.some((a) => a.setUpByHim),
      installs: ordered.reduce((s, a) => s + installFloor(a.installs), 0),
      rating: (() => {
        const r = ordered.map((a) => a.rating).filter((x) => x != null);
        return r.length ? Number((r.reduce((s, x) => s + x, 0) / r.length).toFixed(1)) : null;
      })(),
      apps: ordered,
    };
  });
}

/**
 * The longest name shared by a client's apps, trimmed at a word boundary.
 *
 * Returns null rather than a fragment: "Ping Rider"/"Ping Driver" share "Ping "
 * and that is a name, but two unrelated titles sharing one letter is not.
 */
function sharedName(names) {
  if (names.length === 0) return null;
  if (names.length === 1) return names[0];
  let prefix = names[0];
  for (const n of names.slice(1)) {
    let i = 0;
    while (i < prefix.length && i < n.length && prefix[i].toLowerCase() === n[i].toLowerCase()) i++;
    prefix = prefix.slice(0, i);
  }
  // Cut back to a word boundary. "Dida Client" and "Dida Chauffeur" share the
  // six characters "Dida C", which is not a name — the company is "Dida".
  const endsAWord = names.every((n) => n.length === prefix.length || /[\s\-–—:|,.]/.test(n[prefix.length]));
  if (!endsAWord && prefix.includes(" ")) prefix = prefix.slice(0, prefix.lastIndexOf(" "));
  const trimmed = prefix.replace(/[\s\-–—:|,.]+$/, "").trim();
  return trimmed.length >= 3 ? trimmed : null;
}

const stats = {
  branches: branchCount,
  clients: clients.length,
  live: liveKept.length,
  setUpByHim: liveKept.filter((a) => a.setUpByHim).length,
  carryingHisCommits: liveKept.filter((a) => a.commits > 0).length,
  installFloor: liveKept.reduce((s, a) => s + installFloor(a.installs), 0),
  developers: new Set(liveKept.map((a) => a.developer).filter(Boolean)).size,
  delisted: pastKept.length,
  archiveChecked,
  /** Verified published, but last shipped before he joined. Not counted above. */
  predatingHim: predating.length,
  joined: JOINED,
  /** Companies, not apps — most shipped a rider app and a driver app. */
  clientsLive: groupByClient(liveKept).length,
  clientsGone: groupByClient(pastKept).length,
};
console.log("[gen-store]", stats);

const pick = ({ id, name, rating, installs, url, side, setUpByHim, developer, icon, color, updated, firstSeen }) => ({
  id,
  name,
  rating,
  installs,
  url,
  side,
  setUpByHim,
  developer,
  /** Play's own "Updated on" — when the binary you can install now was published. */
  updated,
  /** Earliest archived crawl of the listing: on the store since AT LEAST this. */
  firstSeen,
  // Written to public/store at generation time: from the live listing where
  // there is one, otherwise resolved separately.
  icon: icon ? `/store/${id}.webp` : null,
  // The hex this client's build tinted its theme to, read from the flavour's
  // own `resValue "color", 'theme_color'`. Null for the ones that never set one.
  color,
});

writeFileSync(
  OUT,
  `// AUTO-GENERATED by scripts/gen-store.mjs — do not edit by hand.
//
// Every entry was verified against its live Play Store listing at generation
// time; anything that does not resolve is dropped rather than shipped as a dead
// link. Internal names are deliberately not exported.
// Run \`npm run gen:store\` to refresh.

/** The three apps that get their own card. */
export const storeApps = ${JSON.stringify(
    flagships.map(({ id, name, rating, installs, url, role, employer, icon }) => ({
      id,
      name,
      rating,
      installs,
      url,
      role,
      employer,
      icon: icon ? `/store/${id}.webp` : null,
    })),
    null,
    2,
  )} as const;

/**
 * The white-label fleet: client builds of the Jugnoo platform that are still on
 * the Play Store. \`setUpByHim\` means he authored the commit that introduced
 * that client's applicationId; the rest carry his commits in their history.
 */
export const fleet = ${JSON.stringify(liveKept.map(pick), null, 1)} as const;

/**
 * The same live apps, grouped by the company that shipped them — because almost
 * every client shipped a rider app and a driver app, and listing both as
 * separate rows made the page twice as long and half as clear.
 */
export const liveClients = ${JSON.stringify(
    groupByClient(liveKept.map(pick)).map(({ key, name, developer, icon, color, setUpByHim, rating, apps }) => ({
      key,
      name,
      developer,
      icon,
      color,
      setUpByHim,
      rating,
      apps: apps.map(({ id, name, url, side, installs, rating, updated }) => ({
        id,
        name,
        url,
        side,
        installs,
        rating,
        updated,
      })),
    })),
    null,
    1,
  )} as const;

/**
 * Client builds that are NOT on the store any more, but provably once were:
 * the Internet Archive holds a 200 for the listing URL. \`lastSeen\` is the most
 * recent snapshot — the last date anyone can show the app was on sale — and
 * \`name\`/\`rating\` are what the listing said at that moment, not today.
 *
 * This is a FLOOR. The Archive crawls what it happens to crawl, so an app with
 * no snapshot is not an app that was never published.
 */
export const delisted = ${JSON.stringify(
    pastKept.map(({ id, name, rating, ratings, side, setUpByHim, firstSeen, lastSeen, url, icon, color }) => ({
      id,
      name,
      rating,
      ratings,
      side,
      setUpByHim,
      firstSeen,
      lastSeen,
      url,
      // Recovered from the branch: Play has no listing left to ask.
      icon: icon ? `/store/${id}.webp` : null,
      color,
    })),
    null,
    1,
  )} as const;

/** The pulled apps, grouped the same way. */
export const pastClients = ${JSON.stringify(
    groupByClient(
      pastKept.map(({ id, name, side, setUpByHim, firstSeen, lastSeen, url, icon, color, rating }) => ({
        id,
        name,
        side,
        setUpByHim,
        firstSeen,
        lastSeen,
        url,
        icon: icon ? `/store/${id}.webp` : null,
        color,
        rating,
        installs: null,
        developer: null,
      })),
    ).map(({ key, name, icon, color, setUpByHim, apps }) => ({
      key,
      name,
      icon,
      color,
      setUpByHim,
      lastSeen: apps.map((a) => a.lastSeen).sort().at(-1) ?? null,
      firstSeen: apps.map((a) => a.firstSeen).filter(Boolean).sort()[0] ?? null,
      apps: apps.map(({ id, name, url, side, rating, lastSeen }) => ({
        id,
        name,
        url,
        side,
        rating,
        lastSeen,
      })),
    })),
    null,
    1,
  )} as const;

/** Counts behind the fleet, all derived — see scripts/gen-store.mjs. */
export const fleetStats = ${JSON.stringify(stats, null, 2)} as const;

/**
 * The year each app's last shipped build went out — \`live\` from Play's own
 * "Updated on", \`gone\` from the last archived crawl of a listing that no
 * longer exists. Both are floors, and neither has anything before he joined.
 */
export const lastShipped = ${JSON.stringify(lastShippedByYear(liveKept, pastKept), null, 1)} as const;

export const storeGeneratedAt = ${JSON.stringify(new Date().toISOString().slice(0, 10))};
`,
);
console.log(`[gen-store] wrote ${flagships.length} flagship(s) and ${fleet.length} fleet app(s)`);
