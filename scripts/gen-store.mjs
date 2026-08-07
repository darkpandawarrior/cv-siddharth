/**
 * Generates src/data/store.ts — the shipped-app shelf and the white-label fleet.
 *
 * NOTHING HERE IS TYPED FROM MEMORY. Every package id is mined out of a git
 * history and then verified against the live Play Store before it is written;
 * an id that does not resolve is dropped rather than shipped as a dead link,
 * because a broken store link on a portfolio reads as a claim that did not
 * survive contact.
 *
 * WHAT IT PRODUCES:
 *
 * 1. THE FLAGSHIPS — three ids read from the `applicationId` lines of the app
 *    repos' primary flavours. These get their own cards.
 *
 * 2. THE WHITE-LABEL FLEET — the interesting one. Jugnoo shipped its rider and
 *    driver apps as a white-label platform, and the way that platform works is
 *    that EVERY CLIENT GETS A BRANCH. So the two repos carry 1,700-odd `wl_*`
 *    branches between them, each one a client build with its own applicationId
 *    in a product flavour. Pass A walks the whole history of those branches for
 *    every applicationId ever committed on one and who introduced it; pass B
 *    reads the branch tips for how much of each build is his. Then Play is asked
 *    which are still live, and the live ones give up their icon, rating, install
 *    bucket and — the whole argument in one field — the name of the company
 *    that publishes them.
 *
 *    An earlier version of this file claimed the white-label apps could not be
 *    linked at all, on the evidence that product.clicklabs.jugnoo.white and
 *    product.customer.tempwl both 404. That was true and the conclusion drawn
 *    from it was wrong: those two are the TEMPLATES on master. The real client
 *    ids were one branch away the whole time.
 *
 * 3. THE DELISTED — merged in from scripts/gen-store-archive.mjs, which proves
 *    from the Internet Archive that a dead id was once a real listing. Run that
 *    first if you want the tier; this works without it.
 *
 * WHAT IS DELIBERATELY NOT SHIPPED: branch names. They are internal and some of
 * them carry colleagues' names. Only the package id — which is public the moment
 * the app ships — the public listing data, and aggregate counts leave this file.
 *
 * Needs the private app repos on disk (see REPOS) and refuses to guess without
 * them. The store probe is cached in .store-cache.json (gitignored) so a re-run
 * is cheap; delete it to re-probe, or bump PROBE_V to re-read the live ones.
 *
 * Usage: npm run gen:store
 */
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { homedir } from "node:os";

const CACHE = resolve(process.cwd(), ".store-cache.json");
/** Written by scripts/gen-store-archive.mjs. Optional — the fleet works without it. */
const ARCHIVE_CACHE = resolve(process.cwd(), ".store-archive-cache.json");
const OUT = resolve(process.cwd(), "src/data/store.ts");
const ICON_DIR = resolve(process.cwd(), "public/store");

/** The two white-label platform repos, and which side of the marketplace each is. */
const REPOS = [
  { dir: `${homedir()}/Repos/Android/Jugnoo/jugnoo-android-autos`, side: "rider" },
  { dir: `${homedir()}/Repos/Android/Jugnoo/jugnoo-android-driver`, side: "driver" },
];

/** His committer identity in those repos. */
const AUTHOR = "siddharth.pandalai";

/** Read from the primary flavours. These get their own cards. */
const FLAGSHIPS = [
  { id: "io.eka.ekav2", role: "Technical owner & Product Owner", employer: "Dice.tech" },
  { id: "product.clicklabs.jugnoo", role: "Android engineer", employer: "Jugnoo" },
  { id: "product.clicklabs.jugnoo.driver", role: "Android engineer", employer: "Jugnoo" },
];

/**
 * The base app and the unbranded templates on master. Not clients — excluding
 * them is what makes the fleet count a count of *clients*.
 */
const NOT_A_CLIENT = /^product\.clicklabs\.jugnoo(\.driver)?$|white|tempwl|\.wl$/i;

const git = (dir, args) =>
  execFileSync("git", ["-C", dir, ...args], { encoding: "utf8", maxBuffer: 1 << 28 });

/* ── 1. Mine ────────────────────────────────────────────────────────────── */

/** Every distinct client applicationId across every wl_* branch, with provenance. */
function mine() {
  const clients = new Map();
  let branchCount = 0;

  for (const { dir, side } of REPOS) {
    if (!existsSync(dir)) throw new Error(`[gen-store] missing repo ${dir} — refusing to guess`);
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
     * Reading branch tips alone misses any client whose id was later changed or
     * whose branch was rewound, and the first version of this script did miss
     * 121 of them. One `git log --all -p` walk over the gradle files catches
     * every id that ever existed and hands over the authoring commit for free —
     * and it is ~20x faster than pickaxing each id separately, which is what it
     * replaced. git walks newest-first, so the LAST sighting of an id is the
     * earliest commit that introduced it: that is who set the client up.
     *
     * SCOPED TO THE WHITE-LABEL BRANCHES, not --all, and the difference is not
     * cosmetic. --all also reaches the mainline dev branches, where in 2018 an
     * engineer at be Group (be.xyz, Vietnam) committed `xyz.be.driver` — an app
     * that is on the store today with a million installs. It resolves, so it
     * would have been written into the fleet. But its id never appeared on a
     * client branch, the commit predates him by two years, and nothing shows
     * the binary shipping today is that build. Membership of the fleet is
     * "appeared on a white-label branch", and the glob is what enforces it. */
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

    /* Pass B — the branch tips, for how much of each client's build is his.
     *
     * Commits of his that a branch's history carries and master's does not: his
     * work is in that client's build even where he did not cut the branch. */
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
const PROBE_V = 3;

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
      const res = await fetch(url, { headers: { "user-agent": UA } });
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
        const res = await fetch(`${a.icon}=s128-rw`, { headers: { "user-agent": UA } });
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

const iconsWritten = await fetchIcons(fleet);
console.log(`[gen-store] ${iconsWritten} new icon(s) downloaded to public/store/`);

const stats = {
  branches: branchCount,
  clients: clients.length,
  live: fleet.length,
  setUpByHim: fleet.filter((a) => a.setUpByHim).length,
  carryingHisCommits: fleet.filter((a) => a.commits > 0).length,
  installFloor: fleet.reduce((s, a) => s + installFloor(a.installs), 0),
  developers: new Set(fleet.map((a) => a.developer).filter(Boolean)).size,
  delisted: delisted.length,
  archiveChecked,
};
console.log("[gen-store]", stats);

const pick = ({ id, name, rating, installs, url, side, setUpByHim, developer, icon }) => ({
  id,
  name,
  rating,
  installs,
  url,
  side,
  setUpByHim,
  developer,
  // Downloaded to public/store at generation time; null if the fetch failed.
  icon: icon ? `/store/${id}.webp` : null,
});

writeFileSync(
  OUT,
  `// AUTO-GENERATED by scripts/gen-store.mjs — do not edit by hand.
//
// Package ids mined from the applicationId lines of every wl_* branch in the
// Jugnoo rider and driver repos, then verified against the live Play Store.
// Anything that does not resolve is dropped rather than shipped as a dead link.
// Branch names are deliberately not exported — they are internal.
// Run \`npm run gen:store\` to refresh.

/** The three apps that get their own card. */
export const storeApps = ${JSON.stringify(
    flagships.map(({ id, name, rating, installs, url, role, employer }) => ({
      id,
      name,
      rating,
      installs,
      url,
      role,
      employer,
    })),
    null,
    2,
  )} as const;

/**
 * The white-label fleet: client builds of the Jugnoo platform that are still on
 * the Play Store. \`setUpByHim\` means he authored the commit that introduced
 * that client's applicationId; the rest carry his commits in their history.
 */
export const fleet = ${JSON.stringify(fleet.map(pick), null, 1)} as const;

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
    delisted.map(({ id, name, rating, ratings, side, setUpByHim, firstSeen, lastSeen, url }) => ({
      id,
      name,
      rating,
      ratings,
      side,
      setUpByHim,
      firstSeen,
      lastSeen,
      url,
    })),
    null,
    1,
  )} as const;

/** Counts behind the fleet, all derived — see scripts/gen-store.mjs. */
export const fleetStats = ${JSON.stringify(stats, null, 2)} as const;

export const storeGeneratedAt = ${JSON.stringify(new Date().toISOString().slice(0, 10))};
`,
);
console.log(`[gen-store] wrote ${flagships.length} flagship(s) and ${fleet.length} fleet app(s)`);
