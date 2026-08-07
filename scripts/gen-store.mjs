/**
 * Generates src/data/store.ts — the shipped-app shelf and the white-label fleet.
 *
 * NOTHING HERE IS TYPED FROM MEMORY. Every package id is mined out of a git
 * history and then verified against the live Play Store before it is written;
 * an id that does not resolve is dropped rather than shipped as a dead link,
 * because a broken store link on a portfolio reads as a claim that did not
 * survive contact.
 *
 * TWO PASSES:
 *
 * 1. THE FLAGSHIPS — three ids read from the `applicationId` lines of the app
 *    repos' primary flavours. These get their own cards.
 *
 * 2. THE WHITE-LABEL FLEET — the interesting one. Jugnoo shipped its rider and
 *    driver apps as a white-label platform, and the way that platform works is
 *    that EVERY CLIENT GETS A BRANCH. So the two repos carry 1,700-odd `wl_*`
 *    branches between them, each one a client build with its own applicationId
 *    in a product flavour. This script walks all of them, collects the distinct
 *    client ids, works out who introduced each one (git log -S over the gradle
 *    files — the engineer who added the applicationId is the engineer who set
 *    that client up), and then asks the Play Store which are still live.
 *
 *    An earlier version of this file claimed the white-label apps could not be
 *    linked at all, on the evidence that product.clicklabs.jugnoo.white and
 *    product.customer.tempwl both 404. That was true and the conclusion drawn
 *    from it was wrong: those two are the TEMPLATES on master. The real client
 *    ids were one branch away the whole time.
 *
 * WHAT IS DELIBERATELY NOT SHIPPED: branch names. They are internal and some of
 * them carry colleagues' names. Only the package id — which is public the moment
 * the app ships — the public listing data, and an aggregate count leave this file.
 *
 * Needs the private app repos on disk (see REPOS) and refuses to guess without
 * them. The store probe is cached in .store-cache.json (gitignored) so a re-run
 * is cheap; delete it to re-probe.
 *
 * Usage: npm run gen:store
 */
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { homedir } from "node:os";

const CACHE = resolve(process.cwd(), ".store-cache.json");
const OUT = resolve(process.cwd(), "src/data/store.ts");

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

      // Commits of his that this branch's history carries and master's does not:
      // his work is in this client's build even where he did not cut the branch.
      const mineHere = Number(
        git(dir, ["rev-list", "--count", `--author=${AUTHOR}`, `${base}..${branch}`]).trim(),
      );

      for (const id of ids) {
        if (clients.has(id)) {
          const e = clients.get(id);
          e.commits = Math.max(e.commits, mineHere);
          continue;
        }
        // Who introduced this applicationId? The engineer who added the line to
        // the gradle file is the engineer who set this client up.
        const first = git(dir, [
          "log",
          "-S",
          id,
          "--format=%ae",
          branch,
          "--",
          "*build.gradle",
        ])
          .trim()
          .split("\n")
          .pop();
        clients.set(id, { id, side, commits: mineHere, setUpByHim: !!first?.startsWith(AUTHOR) });
      }
    }
  }
  return { clients: [...clients.values()], branchCount };
}

/* ── 2. Verify ──────────────────────────────────────────────────────────── */

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

async function probe(id) {
  const url = `https://play.google.com/store/apps/details?id=${id}&hl=en`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { "user-agent": UA } });
      if (res.status === 404) return { live: false };
      if (res.status === 429 || res.status >= 500) {
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        continue;
      }
      const html = await res.text();
      const name = html.match(/itemprop="name"[^>]*>([^<]{1,80})/)?.[1]?.trim();
      if (!name) return { live: false };
      return {
        live: true,
        // Play HTML-escapes listing names; they land in JSX as text, so decode.
        name: name.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"'),
        rating: Number(html.match(/aria-label="Rated ([0-9.]+) stars/)?.[1]) || null,
        installs: html.match(/([0-9.,]+[KMB]?\+)\s*<\/div><div[^>]*>Downloads/)?.[1] ?? null,
        url,
      };
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  return { live: false };
}

/** Probes everything not already cached. Concurrency 6 — polite, and fast enough. */
async function verifyAll(ids) {
  const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, "utf8")) : {};
  const queue = ids.filter((id) => !(id in cache));
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

const stats = {
  branches: branchCount,
  clients: clients.length,
  live: fleet.length,
  setUpByHim: fleet.filter((a) => a.setUpByHim).length,
  carryingHisCommits: fleet.filter((a) => a.commits > 0).length,
  installFloor: fleet.reduce((s, a) => s + installFloor(a.installs), 0),
};
console.log("[gen-store]", stats);

const pick = ({ id, name, rating, installs, url, side, setUpByHim }) => ({
  id,
  name,
  rating,
  installs,
  url,
  side,
  setUpByHim,
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

/** Counts behind the fleet, all derived — see scripts/gen-store.mjs. */
export const fleetStats = ${JSON.stringify(stats, null, 2)} as const;

export const storeGeneratedAt = ${JSON.stringify(new Date().toISOString().slice(0, 10))};
`,
);
console.log(`[gen-store] wrote ${flagships.length} flagship(s) and ${fleet.length} fleet app(s)`);
