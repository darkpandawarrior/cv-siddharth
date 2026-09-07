// src/data/routes.ts — every path this site prerenders and lists in its
// sitemap, derived once from the registries that already own the data.
//
// WHY THIS FILE EXISTS. gen-sitemap.mjs built its URL list from `surfaces` and
// `projects` alone, so it never knew about `/read/$slug` — the ~68 anthology,
// unfiled and Excelsior pages, the site's largest body of unique prose, were
// in no sitemap at all. The prerender page list (vite.config.ts) needs the
// exact same set: TanStack Start's `pages` config has to name every concrete
// `/project/$slug` and `/read/$slug` instance up front, because file-based
// dynamic routes carry no params of their own to discover. One derivation
// feeding both closes the gap structurally — a slug added to any corpus
// widens the sitemap and the prerender set together, rather than needing the
// same edit made twice and drifting the way the sitemap already had.
//
// NODE-IMPORTABILITY IS A HARD CONSTRAINT, same reason as surfaces.ts:
// gen-sitemap.mjs and vite.config.ts both import this directly, so it stays
// plain data with no React.
import { surfaces } from "./surfaces.ts";
import { projects } from "./profile.ts";
import { anthologyEntries, unfiledPieces, siblingSeries } from "./anthology.ts";
import { printedPieces } from "./archiveText.ts";

/** Every path a surface tile links to, in registry order. */
export const surfacePaths: string[] = surfaces.map((s) => s.to);

/** Every project's canonical `/project/$slug` — post-rename slugs only; the
 *  old ones are Vercel-level 301s (vercel.json `redirects`), never a page. */
export const projectPaths: string[] = projects.map((p) => `/project/${p.slug}`);

/**
 * Every slug `read.$slug.tsx`'s loader can resolve, across both corpora it
 * reads (archiveText first, then anthology/unfiled/sibling — see that route's
 * own comment on why printed resolves first). Order here doesn't matter: this
 * feeds a sitemap and a prerender queue, neither of which is read in order.
 */
export const readSlugs: string[] = [
  ...printedPieces.map((p) => p.slug),
  ...anthologyEntries.map((e) => e.slug),
  ...unfiledPieces.map((p) => p.slug),
  ...siblingSeries.flatMap((s) => s.entries.map((e) => e.slug)),
];

export const readPaths: string[] = readSlugs.map((slug) => `/read/${slug}`);

/** Every document this site serves at build time: the prerender set and the
 *  sitemap set are this array, exactly, so they cannot drift from each other. */
export const allRoutes: string[] = ["/", ...surfacePaths, ...projectPaths, ...readPaths];
