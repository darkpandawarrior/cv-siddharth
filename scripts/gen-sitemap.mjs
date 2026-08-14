/**
 * Builds public/sitemap.xml from the routes that actually exist.
 *
 * It was a hand-maintained static file — the only artefact derived from
 * profile.ts that wasn't generated — and it had already drifted: /project/
 * portfolio is a real page, linked from the home grid and returning 200, but
 * five of its six siblings were listed and it wasn't. Nothing catches that,
 * because a sitemap omission is invisible from inside the site. Every project
 * added from here on would have drifted the same way.
 *
 * Deriving it from `projects` and an explicit static list makes the drift
 * impossible rather than merely fixed once.
 */
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { projects } from "../src/data/profile.ts";
import { surfaces } from "../src/data/surfaces.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://cv-siddharth.vercel.app";

/**
 * `priority` is a hint, not a ranking, and crawlers largely ignore it — it's
 * here to state intent: the résumé and the home page are what this site is for.
 *
 * The interactive rooms are included deliberately. They're client-rendered, so
 * they carry less indexable text than a project page, but each now declares its
 * own title, description and canonical (src/lib/routeHead.ts) and each is a
 * genuine destination worth finding.
 */
/**
 * Weight and refresh rate per route. ONLY the routes that differ from the
 * default — everything else is 0.5/monthly and appears automatically the day
 * its surface is registered.
 *
 * The route list itself comes from `surfaces`, never from here. The rooms were
 * already derived (this file's own note records `/chess` shipping with a title,
 * a description and a canonical while absent from the sitemap), but the *pages*
 * beside them stayed hand-listed — the identical bug, one row up, waiting for
 * the next page route. surfaces.test.ts fails the build if a route file has no
 * surface, so nothing can now reach production unlisted.
 */
const WEIGHT = {
  "/": { priority: "1.0", changefreq: "weekly" },
  // Ranked with /resume, not below it: /hire is the surface built for someone
  // who will not explore, and it was invisible to crawlers until now.
  "/hire": { priority: "0.9", changefreq: "monthly" },
  "/resume": { priority: "0.9", changefreq: "monthly" },
  // Ranked with the hiring surfaces: it is the only page on this site that is
  // entirely other people's verifiable evidence rather than his own account.
  "/shipped": { priority: "0.8", changefreq: "monthly" },
  "/ink": { priority: "0.7", changefreq: "monthly" },
  "/loopdown": { priority: "0.7", changefreq: "weekly" },
  "/excelsior": { priority: "0.6", changefreq: "yearly" },
  "/lab": { priority: "0.6", changefreq: "monthly" },
  "/playground": { priority: "0.6", changefreq: "monthly" },
  "/pulse": { priority: "0.5", changefreq: "daily" },
  "/forge": { priority: "0.4", changefreq: "monthly" },
  "/terminal": { priority: "0.4", changefreq: "monthly" },
};

const DEFAULT_WEIGHT = { priority: "0.5", changefreq: "monthly" };

const STATIC = ["/", ...surfaces.map((s) => s.to)].map((path) => ({
  path,
  ...(WEIGHT[path] ?? DEFAULT_WEIGHT),
}));

// Date only, no clock time: a sitemap that changes every build for no reason
// trains crawlers to ignore its lastmod.
const today = new Date().toISOString().slice(0, 10);

const urls = [
  ...STATIC,
  ...projects.map((p) => ({ path: `/project/${p.slug}`, priority: "0.8", changefreq: "monthly" })),
];

const xml =
  `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  urls
    .map(
      (u) =>
        `  <url>\n` +
        `    <loc>${SITE}${u.path}</loc>\n` +
        `    <lastmod>${today}</lastmod>\n` +
        `    <changefreq>${u.changefreq}</changefreq>\n` +
        `    <priority>${u.priority}</priority>\n` +
        `  </url>\n`,
    )
    .join("") +
  `</urlset>\n`;

writeFileSync(join(root, "public", "sitemap.xml"), xml);
console.log(`[gen-sitemap] ${urls.length} URLs (${STATIC.length} static + ${projects.length} projects)`);
